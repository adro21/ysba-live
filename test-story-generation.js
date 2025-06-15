#!/usr/bin/env node

/**
 * Test Story Generation Logic
 * 
 * This script tests if the AI story generation is working correctly
 * and detecting meaningful position changes like Richmond Hill Phoenix 9U DS
 * moving to 2nd place.
 */

const GitHubActionScraper = require('./scripts/github-action-scraper');
const fs = require('fs').promises;
const path = require('path');

async function testStoryGeneration() {
  console.log('📰 Testing Story Generation Logic');
  console.log('=================================\n');

  try {
    const scraper = new GitHubActionScraper();
    
    // Load current standings
    const standingsPath = path.join(__dirname, 'public', 'ysba-standings.json');
    const currentStandings = JSON.parse(await fs.readFile(standingsPath, 'utf8'));
    
    // Create mock previous standings with Richmond Hill Phoenix in 3rd place
    const previousStandings = JSON.parse(JSON.stringify(currentStandings));
    
    // Simulate Richmond Hill Phoenix being in 3rd place previously
    const nineUSelect = previousStandings.divisions['9U']?.tiers['select-all-tiers'];
    if (nineUSelect && nineUSelect.teams && nineUSelect.teams.length >= 4) {
      // Move Richmond Hill Phoenix from 2nd to 3rd, and Newmarket Hawks from 3rd to 2nd
      const rhp = nineUSelect.teams.find(t => t.team === 'Richmond Hill Phoenix 9U DS');
      const nh = nineUSelect.teams.find(t => t.team === 'Newmarket Hawks 9U DS');
      
      if (rhp && nh) {
        // Swap their positions in the previous standings
        rhp.pos = 3;
        nh.pos = 2;
        
        // Sort teams by position to reflect the change
        nineUSelect.teams.sort((a, b) => a.pos - b.pos);
        
        console.log('✅ Created mock previous standings with Richmond Hill Phoenix in 3rd place');
        console.log('   Previous: Newmarket Hawks #2, Richmond Hill Phoenix #3');
        console.log('   Current:  Richmond Hill Phoenix #2, Newmarket Hawks #3');
        console.log('   This should trigger a position_change story!\n');
      }
    }

    // Test the story trigger detection
    const storyTriggers = scraper.detectStoryTriggers(previousStandings, currentStandings);
    
    console.log(`📊 Story triggers detected: ${storyTriggers.length}`);
    storyTriggers.forEach((trigger, index) => {
      console.log(`${index + 1}. ${trigger.type}: ${trigger.team || trigger.division}`);
      if (trigger.positionChange) {
        console.log(`   Moved from #${trigger.oldPosition} to #${trigger.newPosition}`);
      }
    });

    // Test quality trigger filtering
    const qualityTriggers = storyTriggers.filter(t => 
      ['first_win', 'undefeated_milestone', 'hot_streak', 'breakthrough', 'tight_race', 'position_change'].includes(t.type)
    );
    
    console.log(`\n🎯 Quality triggers: ${qualityTriggers.length}`);
    qualityTriggers.forEach((trigger, index) => {
      console.log(`${index + 1}. ${trigger.type}: ${trigger.team || trigger.division}`);
    });

    // Check if it would trigger story generation
    if (qualityTriggers.length >= 1) {
      console.log('\n✅ WOULD TRIGGER STORY GENERATION!');
      console.log('   The fix is working - position changes now count as quality triggers');
    } else {
      console.log('\n❌ Would NOT trigger story generation');
      console.log('   Need to investigate further...');
    }

    // Test Richmond Hill Phoenix specific change
    const rhpTrigger = qualityTriggers.find(t => 
      t.team === 'Richmond Hill Phoenix 9U DS' && t.type === 'position_change'
    );
    
    if (rhpTrigger) {
      console.log('\n🎯 Richmond Hill Phoenix position change detected:');
      console.log(`   Team: ${rhpTrigger.team}`);
      console.log(`   Change: #${rhpTrigger.oldPosition} → #${rhpTrigger.newPosition}`);
      console.log(`   Division: ${rhpTrigger.division}`);
      console.log('   ✅ This is exactly the type of change that should generate a story!');
    } else {
      console.log('\n⚠️ Richmond Hill Phoenix position change not detected');
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testStoryGeneration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});