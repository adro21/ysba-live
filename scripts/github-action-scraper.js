#!/usr/bin/env node

/**
 * YSBA Live GitHub Actions Scraper
 * 
 * This script runs in GitHub Actions every 30 minutes to:
 * 1. Scrape all YSBA divisions
 * 2. Generate optimized JSON files
 * 3. Send email notifications for significant changes
 * 4. Generate new homepage stories when story-worthy events occur
 * 5. Commit and push changes to trigger Render deployment
 */

const YSBAScraper = require('../src/scraper/scraper');
const InterlockScraper = require('../src/scraper/interlock-scraper');
const DataFormatter = require('../src/scraper/formatter');
const DataWriter = require('../src/scraper/writer');
const DataOptimizer = require('../src/scraper/optimizer');
const EmailService = require('../email-service');
const AIStoryService = require('../ai-story-service');
const config = require('../config');
const fs = require('fs').promises;
const path = require('path');

// Maximum time for the entire script (10 minutes to leave buffer for git operations)
const SCRIPT_TIMEOUT_MS = 10 * 60 * 1000;
// Time to reserve for file writing and cleanup (60 seconds)
const RESERVED_TIME_MS = 60 * 1000;
// Maximum time for a single division scrape - standings only (45 seconds)
const STANDINGS_TIMEOUT_MS = 45 * 1000;
// Maximum time for schedule scrape (30 seconds) - schedule is optional
const SCHEDULE_TIMEOUT_MS = 30 * 1000;
// Circuit breaker: abort if this many consecutive failures
const CIRCUIT_BREAKER_THRESHOLD = 3;
// Navigation timeout - reduced from 60s since YSBA is either fast or down
const NAVIGATION_TIMEOUT_MS = 30 * 1000;

class GitHubActionScraper {
  constructor() {
    this.scraper = new YSBAScraper();
    this.interlockScraper = new InterlockScraper();
    this.formatter = new DataFormatter();
    this.writer = new DataWriter();
    this.optimizer = new DataOptimizer();
    this.emailService = new EmailService();
    this.aiStoryService = new AIStoryService();
    this.startTime = Date.now();
    this.consecutiveFailures = 0;
    this.circuitBroken = false;

    // Set up script-level timeout failsafe
    this.scriptTimeout = setTimeout(() => {
      console.error('❌ SCRIPT TIMEOUT: Scraper exceeded maximum time limit');
      console.error(`   Script has been running for ${(Date.now() - this.startTime) / 1000}s`);
      process.exit(1);
    }, SCRIPT_TIMEOUT_MS);
  }

  // Check if we have enough time remaining to continue
  hasTimeRemaining() {
    const elapsed = Date.now() - this.startTime;
    const remaining = SCRIPT_TIMEOUT_MS - elapsed - RESERVED_TIME_MS;
    return remaining > STANDINGS_TIMEOUT_MS;
  }

  getRemainingTime() {
    const elapsed = Date.now() - this.startTime;
    return Math.max(0, SCRIPT_TIMEOUT_MS - elapsed - RESERVED_TIME_MS);
  }

  async run() {
    console.log('🚀 YSBA Live GitHub Actions Scraper Starting...');
    console.log(`📅 ${new Date().toISOString()}`);
    
    try {
      // Load previous standings for change detection
      const previousStandings = await this.loadPreviousStandings();
      console.log(`📊 Loaded previous standings for change detection`);
      
      // Get all divisions to scrape
      const divisionsToScrape = this.getDivisionsToScrape();
      console.log(`📋 Will scrape ${divisionsToScrape.length} division/tier combinations`);

      const allDivisionData = {};
      let successCount = 0;
      let errorCount = 0;
      const errors = [];

      // Scrape each division with circuit breaker and time budget
      for (let i = 0; i < divisionsToScrape.length; i++) {
        const { division, tier } = divisionsToScrape[i];
        const progress = `(${i + 1}/${divisionsToScrape.length})`;

        // Check circuit breaker
        if (this.circuitBroken) {
          console.log(`⚡ ${progress} Skipping ${division}/${tier} - circuit breaker tripped`);
          errors.push({ division, tier, error: 'Skipped due to circuit breaker' });
          continue;
        }

        // Check time budget
        if (!this.hasTimeRemaining()) {
          console.log(`⏰ ${progress} Skipping ${division}/${tier} - time budget exhausted (${Math.round(this.getRemainingTime() / 1000)}s remaining)`);
          errors.push({ division, tier, error: 'Skipped due to time budget' });
          continue;
        }

        try {
          console.log(`📊 ${progress} Scraping ${division}/${tier}... (${Math.round(this.getRemainingTime() / 1000)}s remaining)`);

          // SEQUENTIAL scraping: standings first (critical), then schedule (optional)
          // This prevents queue buildup when YSBA is slow

          const scraperForDivision = this.getScraperFor(division);

          // 1. Scrape standings (required)
          let standingsData;
          try {
            standingsData = await this.withTimeout(
              this.scrapeWithRetry(() =>
                scraperForDivision.scrapeStandingsForDivision(division, tier),
                2 // Only 2 retries for faster failure
              ),
              STANDINGS_TIMEOUT_MS,
              `Standings timeout after ${STANDINGS_TIMEOUT_MS / 1000}s`
            );
          } catch (standingsError) {
            // Standings failed - this is a critical failure
            throw new Error(`Standings failed: ${standingsError.message}`);
          }

          // 2. Scrape schedule (optional - don't fail the whole division if this fails)
          let scheduleData = null;
          try {
            scheduleData = await this.withTimeout(
              this.scrapeWithRetry(() =>
                scraperForDivision.scrapeScheduleForDivision(division, tier),
                1 // Only 1 retry for schedule - it's optional
              ),
              SCHEDULE_TIMEOUT_MS,
              `Schedule timeout after ${SCHEDULE_TIMEOUT_MS / 1000}s`
            );
          } catch (scheduleError) {
            console.log(`⚠️  ${progress} Schedule failed for ${division}/${tier}, continuing with standings only: ${scheduleError.message}`);
            // Continue without schedule data - standings are more important
          }

          const divisionKey = `${division}-${tier}`;
          allDivisionData[divisionKey] = {
            standings: standingsData,
            schedule: scheduleData
          };

          successCount++;
          this.consecutiveFailures = 0; // Reset circuit breaker counter on success
          console.log(`✅ ${progress} ${division}/${tier} completed${scheduleData ? '' : ' (standings only)'}`);

          // Small delay between divisions
          if (i < divisionsToScrape.length - 1) {
            await this.sleep(500);
          }

        } catch (error) {
          errorCount++;
          this.consecutiveFailures++;
          errors.push({ division, tier, error: error.message });
          console.error(`❌ ${progress} ${division}/${tier} failed:`, error.message);

          // Check circuit breaker threshold
          if (this.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
            console.error(`\n⚡ CIRCUIT BREAKER TRIPPED: ${CIRCUIT_BREAKER_THRESHOLD} consecutive failures`);
            console.error(`   YSBA website appears to be down or unresponsive`);
            console.error(`   Aborting remaining divisions to save time\n`);
            this.circuitBroken = true;
          }

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
        
        // Check for standings changes and send email notifications
        if (this.emailService.isConfigured && previousStandings) {
          console.log('📧 Checking for standings changes...');
          await this.checkAndSendNotifications(previousStandings, formattedData);
        } else if (!this.emailService.isConfigured) {
          console.log('📧 Email service not configured - skipping notifications');
        }

        // Check for story-worthy changes and generate new stories
        if (previousStandings) {
          console.log('📰 Checking for story-worthy changes...');
          await this.checkAndGenerateStories(previousStandings, formattedData);
        } else {
          console.log('📰 No previous standings for story comparison - generating initial stories...');
          await this.generateInitialStories(formattedData);
        }
        
        const duration = Date.now() - this.startTime;

        // Clear the script timeout since we finished successfully
        clearTimeout(this.scriptTimeout);

        console.log('\n✅ GitHub Actions Scraper Completed Successfully!');
        console.log(`📊 Results: ${successCount} success, ${errorCount} errors`);
        console.log(`⏱️  Duration: ${(duration / 1000).toFixed(1)}s`);
        console.log(`📄 Files written to public/ and data/ directories`);

        if (this.circuitBroken) {
          console.log('\n⚡ Note: Circuit breaker was triggered - some divisions were skipped');
          console.log('   This usually means the YSBA website was temporarily unresponsive');
        }

        if (errorCount > 0) {
          // Categorize errors
          const skippedCircuit = errors.filter(e => e.error.includes('circuit breaker'));
          const skippedTime = errors.filter(e => e.error.includes('time budget'));
          const actualFailures = errors.filter(e => !e.error.includes('circuit breaker') && !e.error.includes('time budget'));

          if (actualFailures.length > 0) {
            console.log(`\n⚠️  ${actualFailures.length} divisions failed:`);
            actualFailures.slice(0, 5).forEach(({ division, tier, error }) => {
              console.log(`   • ${division}/${tier}: ${error}`);
            });
            if (actualFailures.length > 5) {
              console.log(`   ... and ${actualFailures.length - 5} more`);
            }
          }

          if (skippedCircuit.length > 0) {
            console.log(`\n⚡ ${skippedCircuit.length} divisions skipped (circuit breaker)`);
          }

          if (skippedTime.length > 0) {
            console.log(`\n⏰ ${skippedTime.length} divisions skipped (time budget)`);
          }
        }

        process.exit(0);
        
      } else {
        // Clear the script timeout
        clearTimeout(this.scriptTimeout);

        if (this.circuitBroken) {
          // Circuit breaker tripped = YSBA site is down. This is not our fault.
          // Exit gracefully so GitHub Actions doesn't send failure emails.
          // Previous data files are still valid and being served.
          console.log('\n⚡ YSBA website appears to be down or unresponsive');
          console.log('   Circuit breaker tripped - no data could be scraped');
          console.log('   Previous data files remain valid. Exiting gracefully.');
          console.log(`⏱️  Duration: ${((Date.now() - this.startTime) / 1000).toFixed(1)}s`);
          process.exit(0);
        } else {
          throw new Error(`All ${divisionsToScrape.length} division scrapes failed`);
        }
      }
      
    } catch (error) {
      // Clear the script timeout
      clearTimeout(this.scriptTimeout);

      console.error('\n❌ GitHub Actions Scraper Failed!');
      console.error('Error:', error.message);

      await this.writer.writeErrorLog(error, {
        source: 'GitHub Actions',
        totalDivisions: this.getDivisionsToScrape().length
      });

      process.exit(1);
    } finally {
      await this.scraper.cleanup();
      await this.interlockScraper.cleanup();
    }
  }

  // Pick the right scraper for a division. Interlock divisions have
  // source: 'interlock' in config and use the TeamSnap public API.
  getScraperFor(division) {
    const divisionConfig = config.DIVISIONS[division];
    if (divisionConfig?.source === 'interlock') {
      return this.interlockScraper;
    }
    return this.scraper;
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

  async scrapeWithRetry(scrapeFunction, maxRetries = 2) {
    let lastError;
    const startTime = Date.now();

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await scrapeFunction();
      } catch (error) {
        lastError = error;
        const elapsed = Date.now() - startTime;
        console.log(`⚠️  Attempt ${attempt}/${maxRetries} failed after ${Math.round(elapsed / 1000)}s: ${error.message}`);

        // If the error happened very quickly (< 5s), it's likely a network/DNS issue
        // Don't bother retrying - the site is probably down
        if (elapsed < 5000 && error.message.includes('net::')) {
          console.log(`🚫 Fast failure detected (network error) - skipping retries`);
          break;
        }

        if (attempt < maxRetries) {
          const delay = attempt * 1500; // Slightly shorter delays
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

  // Timeout wrapper for async operations
  async withTimeout(promise, timeoutMs, errorMessage) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  async loadPreviousStandings() {
    try {
      const standingsPath = path.join(__dirname, '..', 'public', 'ysba-standings.json');
      const data = await fs.readFile(standingsPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.log('📊 No previous standings found (first run or file missing)');
      return null;
    }
  }

  async checkAndSendNotifications(previousStandings, newStandings) {
    try {
      console.log('📧 Starting email notification check...');
      let totalNotificationsSent = 0;
      let divisionsChecked = 0;
      let changesDetected = 0;
      
      // Check each division for changes
      if (previousStandings && previousStandings.divisions && newStandings && newStandings.divisions) {
        for (const [divisionKey, newDivisionData] of Object.entries(newStandings.divisions)) {
          const oldDivisionData = previousStandings.divisions[divisionKey];
          
          if (!oldDivisionData) {
            console.log(`📧 New division detected: ${divisionKey} - skipping notifications for first appearance`);
            continue;
          }
          
          // Check each tier within the division
          for (const [tierKey, newTierData] of Object.entries(newDivisionData.tiers || {})) {
            divisionsChecked++;
            const oldTierData = oldDivisionData.tiers?.[tierKey];
            
            if (!oldTierData || !newTierData.teams || !oldTierData.teams) {
              console.log(`📧 Skipping ${divisionKey}/${tierKey} - missing data`);
              continue;
            }
            
            // Convert tier data to the format expected by email service
            const oldTeams = this.convertToEmailFormat(oldTierData.teams);
            const newTeams = this.convertToEmailFormat(newTierData.teams);
            
            // Debug: Log team counts
            console.log(`📧 Checking ${divisionKey}/${tierKey}: ${oldTeams.length} old teams, ${newTeams.length} new teams`);
            
            // Check for changes in this division/tier
            const changes = this.emailService.detectStandingsChanges(oldTeams, newTeams);
            
            if (changes && changes.length > 0) {
              changesDetected += changes.length;
              console.log(`📧 Changes detected in ${divisionKey}/${tierKey}: ${changes.length} changes`);
              console.log(`📧 Changes: ${JSON.stringify(changes)}`);
              
              // Construct division key for email service
              const emailDivisionKey = `${divisionKey}-${tierKey}`;
              
              try {
                const result = await this.emailService.sendDivisionStandingsUpdate(
                  emailDivisionKey, 
                  newTeams, 
                  changes
                );
                
                if (result.sent) {
                  totalNotificationsSent += result.count || 0;
                  console.log(`✅ Sent ${result.count || 0} notifications for ${emailDivisionKey}`);
                } else {
                  console.log(`📧 No subscribers for ${emailDivisionKey}`);
                }
              } catch (emailError) {
                console.error(`❌ Failed to send notifications for ${emailDivisionKey}:`, emailError.message);
              }
            }
          }
        }
      }
      
      console.log(`📧 Summary: Checked ${divisionsChecked} divisions, found ${changesDetected} changes total`);
      
      if (totalNotificationsSent > 0) {
        console.log(`✅ Total notifications sent: ${totalNotificationsSent}`);
      } else if (changesDetected > 0) {
        console.log(`📧 ${changesDetected} changes detected but no subscribers found for those divisions`);
      } else {
        console.log('📧 No changes detected in any division');
      }
      
    } catch (error) {
      console.error('❌ Error checking/sending notifications:', error.message);
    }
  }

  convertToEmailFormat(teams) {
    return teams.map(team => ({
      position: team.pos,
      team: team.team,
      teamCode: team.team, // Use team name as unique identifier instead of position-based code
      wins: team.w,
      losses: team.l,
      ties: team.t,
      winPercentage: team.pct,
      points: team.points || (team.w * 2 + team.t),
      runsFor: team.rf,
      runsAgainst: team.ra
    }));
  }

  // Check for story-worthy changes and generate new stories if needed
  async checkAndGenerateStories(previousStandings, newStandings) {
    try {
      console.log('📰 Analyzing standings for story-worthy changes...');
      
      const storyTriggers = this.detectStoryTriggers(previousStandings, newStandings);
      
      // Only generate new stories if we have significant, quality triggers
      const qualityTriggers = storyTriggers.filter(t => 
        ['first_win', 'undefeated_milestone', 'hot_streak', 'breakthrough', 'tight_race', 'position_change'].includes(t.type)
      );
      
      if (qualityTriggers.length >= 1) {
        console.log(`📰 Found ${qualityTriggers.length} quality story triggers:`, qualityTriggers.map(t => t.type));
        
        // Generate new stories based on current standings
        const stories = await this.aiStoryService.generateStories();
        
        if (stories && stories.length > 0) {
          console.log(`✅ Generated ${stories.length} new stories based on recent changes`);
        } else {
          console.log('⚠️ Story generation failed or returned empty results');
        }
      } else if (storyTriggers.length > 0) {
        console.log(`📰 Found ${storyTriggers.length} story triggers but not enough quality ones (${qualityTriggers.length}) - keeping existing stories`);
      } else {
        console.log('📰 No significant story-worthy changes detected - keeping existing stories');
      }
      
    } catch (error) {
      console.error('❌ Error checking/generating stories:', error.message);
    }
  }

  // Generate initial stories when no previous standings exist
  async generateInitialStories(standings) {
    try {
      console.log('📰 Generating initial stories for new deployment...');
      
      const stories = await this.aiStoryService.generateStories();
      
      if (stories && stories.length > 0) {
        console.log(`✅ Generated ${stories.length} initial stories`);
      } else {
        console.log('⚠️ Initial story generation failed or returned empty results');
      }
      
    } catch (error) {
      console.error('❌ Error generating initial stories:', error.message);
    }
  }

  // Detect story-worthy changes between old and new standings
  detectStoryTriggers(previousStandings, newStandings) {
    const triggers = [];
    
    if (!previousStandings?.divisions || !newStandings?.divisions) {
      return triggers;
    }

    // Check each division for story-worthy changes
    for (const [divisionKey, newDivisionData] of Object.entries(newStandings.divisions)) {
      const oldDivisionData = previousStandings.divisions[divisionKey];
      
      if (!oldDivisionData) {
        triggers.push({ type: 'new_division', division: divisionKey });
        continue;
      }
      
      // Check each tier within the division
      for (const [tierKey, newTierData] of Object.entries(newDivisionData.tiers || {})) {
        const oldTierData = oldDivisionData.tiers?.[tierKey];
        
        if (!oldTierData || !newTierData.teams || !oldTierData.teams) {
          continue;
        }
        
        const divisionName = `${divisionKey}/${tierKey}`;
        const tierTriggers = this.detectTierStoryTriggers(oldTierData.teams, newTierData.teams, divisionName);
        triggers.push(...tierTriggers);
      }
    }
    
    return triggers;
  }

  // Detect story triggers within a specific tier
  detectTierStoryTriggers(oldTeams, newTeams, divisionName) {
    const triggers = [];
    
    // Create lookup maps
    const oldTeamsMap = {};
    const newTeamsMap = {};
    
    oldTeams.forEach(team => oldTeamsMap[team.team] = team);
    newTeams.forEach(team => newTeamsMap[team.team] = team);
    
    // Check each team for story-worthy changes
    newTeams.forEach(newTeam => {
      const oldTeam = oldTeamsMap[newTeam.team];
      
      if (!oldTeam) {
        triggers.push({ type: 'new_team', team: newTeam.team, division: divisionName });
        return;
      }
      
      // First win trigger (team went from 0 wins to 1+ wins)
      if (oldTeam.w === 0 && newTeam.w >= 1) {
        triggers.push({ 
          type: 'first_win', 
          team: newTeam.team, 
          division: divisionName,
          record: `${newTeam.w}-${newTeam.l}${newTeam.t ? `-${newTeam.t}` : ''}`
        });
      }
      
      // Undefeated milestone (team reaches 3+ wins undefeated)
      if (newTeam.l === 0 && newTeam.w >= 3 && (oldTeam.w < 3 || oldTeam.l > 0)) {
        triggers.push({ 
          type: 'undefeated_milestone', 
          team: newTeam.team, 
          division: divisionName,
          record: `${newTeam.w}-${newTeam.l}${newTeam.t ? `-${newTeam.t}` : ''}`
        });
      }
      
      // Hot streak (team gains 2+ wins since last check and has high win rate)
      const winsGained = newTeam.w - oldTeam.w;
      const totalGames = newTeam.w + newTeam.l + (newTeam.t || 0);
      const winPct = totalGames > 0 ? newTeam.w / totalGames : 0;
      
      if (winsGained >= 2 && winPct >= 0.75 && newTeam.w >= 3) {
        triggers.push({ 
          type: 'hot_streak', 
          team: newTeam.team, 
          division: divisionName,
          winsGained,
          record: `${newTeam.w}-${newTeam.l}${newTeam.t ? `-${newTeam.t}` : ''}`
        });
      }
      
      // Position changes - more sensitive for top positions
      const positionChange = oldTeam.pos - newTeam.pos; // positive = moved up
      const isTopPosition = newTeam.pos <= 3 || oldTeam.pos <= 3; // Top 3 positions
      
      // Trigger for: 2+ spot changes anywhere, OR 1+ spot changes in top 3
      if (Math.abs(positionChange) >= 2 || (isTopPosition && Math.abs(positionChange) >= 1)) {
        triggers.push({ 
          type: 'position_change', 
          team: newTeam.team, 
          division: divisionName,
          positionChange,
          oldPosition: oldTeam.pos,
          newPosition: newTeam.pos
        });
      }
      
      // Breakthrough moment (team reaches .500 or better after being below .500)
      const oldWinPct = (oldTeam.w + oldTeam.l + (oldTeam.t || 0)) > 0 ? 
        oldTeam.w / (oldTeam.w + oldTeam.l + (oldTeam.t || 0)) : 0;
      
      if (oldWinPct < 0.5 && winPct >= 0.5 && totalGames >= 4) {
        triggers.push({ 
          type: 'breakthrough', 
          team: newTeam.team, 
          division: divisionName,
          record: `${newTeam.w}-${newTeam.l}${newTeam.t ? `-${newTeam.t}` : ''}`
        });
      }
    });
    
    // Check for tight division races
    if (newTeams.length >= 3) {
      const sortedTeams = [...newTeams].sort((a, b) => b.w - a.w || a.l - b.l);
      const leader = sortedTeams[0];
      const secondPlace = sortedTeams[1];
      
      if (leader.w - secondPlace.w <= 1 && leader.w >= 3) {
        triggers.push({ 
          type: 'tight_race', 
          division: divisionName,
          leader: leader.team,
          secondPlace: secondPlace.team,
          leaderRecord: `${leader.w}-${leader.l}${leader.t ? `-${leader.t}` : ''}`,
          secondRecord: `${secondPlace.w}-${secondPlace.l}${secondPlace.t ? `-${secondPlace.t}` : ''}`
        });
      }
    }
    
    return triggers;
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