#!/usr/bin/env node

/**
 * YSBA Live GitHub Actions Scraper
 * 
 * This script runs in GitHub Actions every 30 minutes to:
 * 1. Scrape all YSBA divisions
 * 2. Generate optimized JSON files
 * 3. Commit and push changes to trigger Render deployment
 */

const YSBAScraper = require('../src/scraper/scraper');
const DataFormatter = require('../src/scraper/formatter');
const DataWriter = require('../src/scraper/writer');
const DataOptimizer = require('../src/scraper/optimizer');
const config = require('../config');

class GitHubActionScraper {
  constructor() {
    this.scraper = new YSBAScraper();
    this.formatter = new DataFormatter();
    this.writer = new DataWriter();
    this.optimizer = new DataOptimizer();
    this.startTime = Date.now();
  }

  async run() {
    console.log('🚀 YSBA Live GitHub Actions Scraper Starting...');
    console.log(`📅 ${new Date().toISOString()}`);
    
    try {
      // Get all divisions to scrape
      const divisionsToScrape = this.getDivisionsToScrape();
      console.log(`📋 Will scrape ${divisionsToScrape.length} division/tier combinations`);

      const allDivisionData = {};
      let successCount = 0;
      let errorCount = 0;
      const errors = [];

      // Scrape each division
      for (let i = 0; i < divisionsToScrape.length; i++) {
        const { division, tier } = divisionsToScrape[i];
        const progress = `(${i + 1}/${divisionsToScrape.length})`;
        
        try {
          console.log(`📊 ${progress} Scraping ${division}/${tier}...`);
          
          // Scrape with retry logic
          const [standingsData, scheduleData] = await Promise.all([
            this.scrapeWithRetry(() => 
              this.scraper.scrapeStandingsForDivision(division, tier)
            ),
            this.scrapeWithRetry(() => 
              this.scraper.scrapeScheduleForDivision(division, tier)
            )
          ]);
          
          const divisionKey = `${division}-${tier}`;
          allDivisionData[divisionKey] = {
            standings: standingsData,
            schedule: scheduleData
          };
          
          successCount++;
          console.log(`✅ ${progress} ${division}/${tier} completed`);
          
          // Small delay between divisions
          if (i < divisionsToScrape.length - 1) {
            await this.sleep(1000);
          }
          
        } catch (error) {
          errorCount++;
          errors.push({ division, tier, error: error.message });
          console.error(`❌ ${progress} ${division}/${tier} failed:`, error.message);
          continue;
        }
      }

      if (successCount > 0) {
        console.log('\n📝 Processing and writing data files...');
        
        // Format the data
        const formattedData = this.formatter.formatYSBAData(allDivisionData);
        const apiData = this.formatter.formatForAPI(allDivisionData);
        const dashboardData = this.formatter.generateDashboardSummary(allDivisionData);
        
        // Write all output files
        await Promise.all([
          this.writer.writeYSBAData(formattedData),
          this.writer.writeAPIData(apiData),
          this.writer.writeDashboardData(dashboardData),
          this.writer.writeMetadata({
            source: 'GitHub Actions',
            successCount,
            errorCount,
            errors,
            divisionsScraped: successCount,
            totalDivisions: divisionsToScrape.length,
            duration: Date.now() - this.startTime
          })
        ]);
        
        // Write individual division files
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
        
        // Create optimized files
        console.log('🔧 Creating optimized data files...');
        await this.optimizer.createOptimizedFiles();
        
        const duration = Date.now() - this.startTime;
        
        console.log('\n✅ GitHub Actions Scraper Completed Successfully!');
        console.log(`📊 Results: ${successCount} success, ${errorCount} errors`);
        console.log(`⏱️  Duration: ${(duration / 1000).toFixed(1)}s`);
        console.log(`📄 Files written to public/ and data/ directories`);
        
        if (errorCount > 0) {
          console.log('\n⚠️  Some divisions failed:');
          errors.forEach(({ division, tier, error }) => {
            console.log(`   • ${division}/${tier}: ${error}`);
          });
        }
        
        process.exit(0);
        
      } else {
        throw new Error(`All ${divisionsToScrape.length} division scrapes failed`);
      }
      
    } catch (error) {
      console.error('\n❌ GitHub Actions Scraper Failed!');
      console.error('Error:', error.message);
      
      await this.writer.writeErrorLog(error, {
        source: 'GitHub Actions',
        totalDivisions: this.getDivisionsToScrape().length
      });
      
      process.exit(1);
    } finally {
      await this.scraper.cleanup();
    }
  }

  getDivisionsToScrape() {
    const divisions = [];
    
    for (const [divisionKey, divisionConfig] of Object.entries(config.DIVISIONS)) {
      for (const tierKey of Object.keys(divisionConfig.tiers)) {
        divisions.push({ division: divisionKey, tier: tierKey });
      }
    }
    
    return divisions;
  }

  async scrapeWithRetry(scrapeFunction, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await scrapeFunction();
      } catch (error) {
        lastError = error;
        console.log(`⚠️  Attempt ${attempt}/${maxRetries} failed: ${error.message}`);
        
        if (attempt < maxRetries) {
          const delay = attempt * 2000;
          console.log(`⏳ Retrying in ${delay/1000}s...`);
          await this.sleep(delay);
        }
      }
    }
    
    throw lastError;
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the scraper if this file is executed directly
if (require.main === module) {
  const scraper = new GitHubActionScraper();
  scraper.run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = GitHubActionScraper;