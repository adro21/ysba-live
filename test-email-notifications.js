#!/usr/bin/env node

/**
 * Test Email Notifications System
 * 
 * This script tests the entire email notification pipeline and simulates
 * the GitHub Actions scraper flow to verify email notifications work.
 * 
 * Usage:
 *   npm run test-emails          # Run full test suite
 *   node test-email-notifications.js --send  # Include actual email sending test
 */

const fs = require('fs').promises;
const path = require('path');
const EmailService = require('./email-service');

class EmailNotificationTester {
  constructor() {
    this.emailService = new EmailService();
  }

  async run() {
    console.log('🧪 Email Notification Testing Started');
    console.log('=====================================\n');

    try {
      // Test 1: Check email service configuration
      await this.testEmailConfiguration();

      // Test 2: Load and examine current standings data
      await this.testDataLoading();

      // Test 3: Test change detection with mock data
      await this.testChangeDetection();

      // Test 4: Test subscriber loading
      await this.testSubscriberLoading();

      // Test 5: Send a test notification
      await this.testNotificationSending();

      // Test 6: Simulate the GitHub Actions scraper flow
      await this.testGitHubActionsFlow();

      console.log('✅ All tests completed!');

    } catch (error) {
      console.error('❌ Test failed:', error.message);
    }
  }

  async testEmailConfiguration() {
    console.log('🔧 Test 1: Email Service Configuration');
    console.log('-------------------------------------');
    
    console.log(`SendGrid configured: ${this.emailService.isConfigured}`);
    console.log(`GitHub Gist configured: ${this.emailService.isGithubConfigured}`);
    console.log(`From email: ${this.emailService.fromEmail}`);
    console.log(`Base URL: ${this.emailService.baseUrl}`);
    
    if (!this.emailService.isConfigured) {
      console.log('⚠️  SendGrid not configured - emails will not be sent');
    }
    console.log('');
  }

  async testDataLoading() {
    console.log('📊 Test 2: Data Loading');
    console.log('------------------------');

    try {
      // Load current standings
      const standingsPath = path.join(__dirname, 'public', 'ysba-standings.json');
      const standingsData = JSON.parse(await fs.readFile(standingsPath, 'utf8'));
      
      console.log(`✅ Loaded standings data successfully`);
      console.log(`Last updated: ${standingsData.lastUpdated}`);
      console.log(`Available divisions: ${Object.keys(standingsData.divisions).length}`);
      
      // Check a specific division structure
      const nineUSelect = standingsData.divisions['9U']?.tiers['select-all-tiers'];
      if (nineUSelect && nineUSelect.teams) {
        console.log(`📋 9U Select teams: ${nineUSelect.teams.length}`);
        console.log(`Sample team structure:`, JSON.stringify(nineUSelect.teams[0], null, 2));
        
        // Test the conversion logic from the GitHub scraper
        const convertToEmailFormat = (teams) => {
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
        };
        
        const emailFormattedTeams = convertToEmailFormat(nineUSelect.teams.slice(0, 3));
        console.log('✅ Converted to email format:', JSON.stringify(emailFormattedTeams[0], null, 2));
        
      } else {
        console.log('⚠️  9U Select division not found or has no teams');
      }

    } catch (error) {
      console.log(`❌ Failed to load standings: ${error.message}`);
    }
    
    console.log('');
  }

  async testChangeDetection() {
    console.log('🔍 Test 3: Change Detection Logic');
    console.log('---------------------------------');

    // Create mock old and new standings to test change detection
    const oldStandings = [
      { teamCode: '511105', team: 'Midland Penetang Twins 9U DS', position: 1, wins: 7, losses: 0, winPercentage: '1.000' },
      { teamCode: '518966', team: 'Vaughan Vikings 9U DS', position: 2, wins: 6, losses: 2, winPercentage: '0.750' },
      { teamCode: '511113', team: 'Richmond Hill Phoenix 9U DS', position: 3, wins: 4, losses: 2, winPercentage: '0.667' }
    ];

    const newStandings = [
      { teamCode: '511105', team: 'Midland Penetang Twins 9U DS', position: 1, wins: 8, losses: 0, winPercentage: '1.000' },
      { teamCode: '518966', team: 'Vaughan Vikings 9U DS', position: 3, wins: 6, losses: 2, winPercentage: '0.750' },
      { teamCode: '511113', team: 'Richmond Hill Phoenix 9U DS', position: 2, wins: 5, losses: 2, winPercentage: '0.714' }
    ];

    console.log('Testing with mock standings...');
    const changes = this.emailService.detectStandingsChanges(oldStandings, newStandings);
    
    console.log(`Detected ${changes.length} changes:`);
    changes.forEach(change => console.log(`  - ${change}`));
    
    if (changes.length === 0) {
      console.log('⚠️  No changes detected - this could be the problem!');
    }

    console.log('');
  }

  async testSubscriberLoading() {
    console.log('👥 Test 4: Subscriber Loading');
    console.log('-----------------------------');

    try {
      const allSubscribers = await this.emailService.loadSubscribers();
      console.log(`Total subscribers: ${allSubscribers.length}`);
      
      const activeSubscribers = allSubscribers.filter(sub => sub.active);
      console.log(`Active subscribers: ${activeSubscribers.length}`);

      // Test division-specific subscribers
      const nineUSelectSubscribers = await this.emailService.getActiveSubscribers('9U-select-all-tiers');
      console.log(`9U Select subscribers: ${nineUSelectSubscribers.length}`);

      if (activeSubscribers.length > 0) {
        console.log(`Sample subscriber preferences:`, JSON.stringify(activeSubscribers[0].divisionPreferences, null, 2));
      }

    } catch (error) {
      console.log(`❌ Failed to load subscribers: ${error.message}`);
    }

    console.log('');
  }

  async testNotificationSending() {
    console.log('📧 Test 5: Notification Sending');
    console.log('-------------------------------');

    if (!this.emailService.isConfigured) {
      console.log('⚠️  SendGrid not configured - skipping email test');
      return;
    }

    try {
      const mockStandings = [
        { team: 'Midland Penetang Twins 9U DS', wins: 8, losses: 0, winPercentage: '1.000' },
        { team: 'Vaughan Vikings 9U DS', wins: 6, losses: 2, winPercentage: '0.750' },
        { team: 'Richmond Hill Phoenix 9U DS', wins: 5, losses: 2, winPercentage: '0.714' }
      ];

      const mockChanges = [
        'Richmond Hill Phoenix 9U DS moved up to #2 (was #3)',
        'Vaughan Vikings 9U DS dropped to #3 (was #2)'
      ];

      console.log('Attempting to send test notification...');
      const result = await this.emailService.sendDivisionStandingsUpdate(
        '9U-select-all-tiers',
        mockStandings,
        mockChanges
      );

      console.log(`Send result:`, result);

    } catch (error) {
      console.log(`❌ Failed to send test notification: ${error.message}`);
    }

    console.log('');
  }

  async testGitHubActionsFlow() {
    console.log('🤖 Test 6: GitHub Actions Scraper Flow (All Divisions)');
    console.log('---------------------------------------------------');

    try {
      // Load current standings (as the GitHub Actions scraper would)
      const standingsPath = path.join(__dirname, 'public', 'ysba-standings.json');
      const currentStandings = JSON.parse(await fs.readFile(standingsPath, 'utf8'));
      
      // Create a mock "previous" standings with changes across multiple divisions
      const previousStandings = JSON.parse(JSON.stringify(currentStandings));
      
      // Simulate the GitHub Actions scraper change detection logic
      const convertToEmailFormat = (teams) => {
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
      };

      // Test multiple divisions/tiers
      const testCases = [
        { division: '9U', tier: 'select-all-tiers', name: '9U Select' },
        { division: '11U', tier: 'select-all-tiers', name: '11U Select' },
        { division: '13U', tier: 'select-all-tiers', name: '13U Select' },
        { division: '10U', tier: 'rep-tier-2', name: '10U Rep AA' },
        { division: '12U', tier: 'rep-tier-2', name: '12U Rep AA' },
        { division: '12U', tier: 'rep-tier-3', name: '12U Rep A' },
        { division: '13U', tier: 'rep-tier-2', name: '13U Rep AA' },
        { division: '15U', tier: 'rep-tier-2', name: '15U Rep AA' },
        { division: '9U', tier: 'rep-tier-3', name: '9U Rep A' }
      ];

      let totalChangesDetected = 0;
      let divisionsWithChanges = 0;
      let totalSubscribers = 0;

      for (const testCase of testCases) {
        const { division, tier, name } = testCase;
        
        // Create position changes for this division/tier
        const divisionData = previousStandings.divisions[division]?.tiers[tier];
        if (divisionData && divisionData.teams && divisionData.teams.length >= 3) {
          // Swap positions of teams 2 and 3
          const temp = divisionData.teams[1];
          divisionData.teams[1] = divisionData.teams[2];
          divisionData.teams[2] = temp;
          
          // Update position numbers
          divisionData.teams[1].pos = 2;
          divisionData.teams[2].pos = 3;
        }

        const newDivisionData = currentStandings.divisions[division];
        const oldDivisionData = previousStandings.divisions[division];
        
        if (newDivisionData?.tiers[tier] && oldDivisionData?.tiers[tier]) {
          const newTierData = newDivisionData.tiers[tier];
          const oldTierData = oldDivisionData.tiers[tier];
          
          if (newTierData.teams && oldTierData.teams && newTierData.teams.length > 0) {
            console.log(`📊 Testing ${name} (${division}/${tier})...`);
            
            // Convert tier data to email format (as GitHub Actions scraper does)
            const oldTeams = convertToEmailFormat(oldTierData.teams);
            const newTeams = convertToEmailFormat(newTierData.teams);
            
            // Check for changes using email service
            const changes = this.emailService.detectStandingsChanges(oldTeams, newTeams);
            
            console.log(`   🔍 Changes: ${changes.length}`);
            
            if (changes.length > 0) {
              divisionsWithChanges++;
              totalChangesDetected += changes.length;
              
              // Test the division key format
              const emailDivisionKey = `${division}-${tier}`;
              
              // Check subscribers for this division
              const subscribers = await this.emailService.getActiveSubscribers(emailDivisionKey);
              totalSubscribers += subscribers.length;
              
              console.log(`   ✅ Would send ${subscribers.length} notifications for ${emailDivisionKey}`);
              if (changes.length <= 2) {
                changes.forEach(change => console.log(`      - ${change}`));
              }
            } else {
              console.log(`   ⚠️  No changes detected`);
            }
          }
        }
      }

      console.log('\n📈 Summary Across All Divisions:');
      console.log(`   🎯 Divisions tested: ${testCases.length}`);
      console.log(`   📊 Divisions with changes detected: ${divisionsWithChanges}`);
      console.log(`   🔄 Total changes detected: ${totalChangesDetected}`);
      console.log(`   👥 Total notification recipients: ${totalSubscribers}`);
      
      if (divisionsWithChanges > 0) {
        console.log('   ✅ Change detection working across multiple divisions!');
      } else {
        console.log('   ⚠️  No changes detected in any division');
      }

    } catch (error) {
      console.log(`❌ Multi-division test failed: ${error.message}`);
    }

    console.log('');
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  const tester = new EmailNotificationTester();
  tester.run().catch(error => {
    console.error('Fatal test error:', error);
    process.exit(1);
  });
}

module.exports = EmailNotificationTester;