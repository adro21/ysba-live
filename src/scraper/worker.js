const cron = require('node-cron');
const YSBAScraper = require('./scraper');
const DataFormatter = require('./formatter');
const DataWriter = require('./writer');
const DataOptimizer = require('./optimizer');
const config = require('../../config');

class YSBAWorker {
  constructor() {
    this.scraper = new YSBAScraper();
    this.formatter = new DataFormatter();
    this.writer = new DataWriter();
    this.optimizer = new DataOptimizer();
    this.isRunning = false;
    this.runCount = 0;
    this.lastRun = null;
    this.lastError = null;
    
    // Define which divisions to scrape
    this.divisionsToScrape = this.getDivisionsToScrape();
  }

  // Get list of divisions to scrape based on config
  getDivisionsToScrape() {
    const divisions = [];
    
    // Add all configured divisions from config
    for (const [divisionKey, divisionConfig] of Object.entries(config.DIVISIONS)) {
      for (const tierKey of Object.keys(divisionConfig.tiers)) {
        divisions.push({ division: divisionKey, tier: tierKey });
      }
    }
    
    console.log(`📋 Configured to scrape ${divisions.length} division/tier combinations:`);
    divisions.forEach(({ division, tier }) => {
      console.log(`   • ${division}/${tier}`);
    });
    
    return divisions;
  }

  // Main scraping function
  async performFullScrape() {
    if (this.isRunning) {
      console.log('⚠️  Scraping already in progress, skipping this run');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();
    
    console.log('\n🚀 ===== YSBA Background Worker Started =====');
    console.log(`📅 Run #${++this.runCount} at ${new Date().toISOString()}`);
    
    try {
      const allDivisionData = {};
      let successCount = 0;
      let errorCount = 0;
      const errors = [];

      // Scrape each division/tier combination
      for (let i = 0; i < this.divisionsToScrape.length; i++) {
        const { division, tier } = this.divisionsToScrape[i];
        const progress = `(${i + 1}/${this.divisionsToScrape.length})`;
        
        try {
          console.log(`\n📊 ${progress} Scraping ${division}/${tier}...`);
          
          // Scrape standings and schedule in parallel for speed
          const [standingsData, scheduleData] = await Promise.all([
            this.scrapeWithRetry(() => 
              this.scraper.scrapeStandingsForDivision(division, tier)
            ),
            this.scrapeWithRetry(() => 
              this.scraper.scrapeScheduleForDivision(division, tier)
            )
          ]);
          
          // Store the raw data
          const divisionKey = `${division}-${tier}`;
          allDivisionData[divisionKey] = {
            standings: standingsData,
            schedule: scheduleData
          };
          
          successCount++;
          console.log(`✅ ${progress} ${division}/${tier} completed successfully`);
          
          // Add small delay between divisions to be respectful
          if (i < this.divisionsToScrape.length - 1) {
            await this.sleep(1000);
          }
          
        } catch (error) {
          errorCount++;
          errors.push({ division, tier, error: error.message });
          console.error(`❌ ${progress} ${division}/${tier} failed:`, error.message);
          
          // Continue with other divisions even if one fails
          continue;
        }
      }

      // Process and write data if we have any successful scrapes
      if (successCount > 0) {
        console.log('\n📝 Processing and writing data files...');
        
        // Format the data
        const formattedData = this.formatter.formatYSBAData(allDivisionData);
        const apiData = this.formatter.formatForAPI(allDivisionData);
        const dashboardData = this.formatter.generateDashboardSummary(allDivisionData);
        
        // Write all output files
        const writeResults = await Promise.all([
          this.writer.writeYSBAData(formattedData),
          this.writer.writeAPIData(apiData),
          this.writer.writeDashboardData(dashboardData),
          this.writer.writeMetadata({
            runCount: this.runCount,
            successCount,
            errorCount,
            errors,
            divisionsScraped: successCount,
            totalDivisions: this.divisionsToScrape.length,
            duration: Date.now() - startTime
          })
        ]);
        
        // Write individual division files for faster loading
        console.log('📁 Writing individual division files...');
        for (const [divisionKey, data] of Object.entries(allDivisionData)) {
          const [division, ...tierParts] = divisionKey.split('-');
          const tier = tierParts.join('-');
          
          const divisionFormatted = {
            standings: this.formatter.formatStandings(data.standings),
            schedule: this.formatter.formatSchedule(data.schedule),
            summary: this.formatter.generateDivisionSummary(data.standings, data.schedule)
          };
          
          await this.writer.writeDivisionData(division, tier, divisionFormatted);
        }
        
        // Clean up old error logs
        await this.writer.cleanupErrorLogs();
        
        // Create optimized files for frontend use
        console.log('🔧 Creating optimized data files...');
        await this.optimizer.createOptimizedFiles();
        
        const duration = Date.now() - startTime;
        const mainFileSize = writeResults[0]?.sizeKB || 'unknown';
        
        console.log('\n✅ ===== YSBA Background Worker Completed =====');
        console.log(`📊 Results: ${successCount} success, ${errorCount} errors`);
        console.log(`⏱️  Duration: ${(duration / 1000).toFixed(1)}s`);
        console.log(`📄 Main file size: ${mainFileSize} KB`);
        console.log(`📅 Next run: 30 minutes`);
        
        this.lastRun = {
          timestamp: new Date().toISOString(),
          success: true,
          duration,
          successCount,
          errorCount,
          fileSize: mainFileSize
        };
        
      } else {
        throw new Error(`All ${this.divisionsToScrape.length} division scrapes failed`);
      }
      
    } catch (error) {
      console.error('\n❌ ===== YSBA Background Worker Failed =====');
      console.error('Error:', error.message);
      
      // Write error log
      await this.writer.writeErrorLog(error, {
        runCount: this.runCount,
        divisionsToScrape: this.divisionsToScrape.length
      });
      
      this.lastError = {
        timestamp: new Date().toISOString(),
        message: error.message,
        runCount: this.runCount
      };
      
      this.lastRun = {
        timestamp: new Date().toISOString(),
        success: false,
        error: error.message,
        duration: Date.now() - startTime
      };
    } finally {
      // Clean up browser resources
      await this.scraper.cleanup();
      this.isRunning = false;
    }
  }

  // Retry wrapper for scraping operations
  async scrapeWithRetry(scrapeFunction, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await scrapeFunction();
      } catch (error) {
        lastError = error;
        console.log(`⚠️  Attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        
        if (attempt < maxRetries) {
          const delay = attempt * 2000; // Exponential backoff: 2s, 4s, 6s
          console.log(`⏳ Retrying in ${delay/1000}s...`);
          await this.sleep(delay);
        }
      }
    }
    
    throw lastError;
  }

  // Start the cron job
  start() {
    console.log('🎯 YSBA Background Worker starting...');
    console.log(`📋 Will scrape ${this.divisionsToScrape.length} divisions every 30 minutes`);
    
    // Run immediately on start
    console.log('🚀 Running initial scrape...');
    this.performFullScrape();
    
    // Schedule cron job for every 30 minutes
    const cronExpression = '*/30 * * * *'; // Every 30 minutes
    
    console.log(`⏰ Scheduled cron job: ${cronExpression}`);
    cron.schedule(cronExpression, () => {
      this.performFullScrape();
    });
    
    // Keep the process alive
    console.log('✅ YSBA Background Worker is running...');
    console.log('👀 Monitor the logs for scraping activity');
    console.log('🛑 Press Ctrl+C to stop\n');
  }

  // Get worker status
  getStatus() {
    return {
      isRunning: this.isRunning,
      runCount: this.runCount,
      lastRun: this.lastRun,
      lastError: this.lastError,
      divisionsConfigured: this.divisionsToScrape.length,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version
    };
  }

  // Graceful shutdown
  async shutdown() {
    console.log('\n🛑 Shutting down YSBA Background Worker...');
    
    if (this.isRunning) {
      console.log('⏳ Waiting for current scrape to complete...');
      // Wait for current operation to complete
      while (this.isRunning) {
        await this.sleep(1000);
      }
    }
    
    await this.scraper.cleanup();
    console.log('✅ YSBA Background Worker shut down gracefully');
    process.exit(0);
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  if (global.worker) {
    await global.worker.shutdown();
  } else {
    process.exit(0);
  }
});

process.on('SIGTERM', async () => {
  if (global.worker) {
    await global.worker.shutdown();
  } else {
    process.exit(0);
  }
});

// Start the worker if this file is run directly
if (require.main === module) {
  const worker = new YSBAWorker();
  global.worker = worker; // Store for graceful shutdown
  worker.start();
}

module.exports = YSBAWorker;