const { test } = require('node:test');
const assert = require('node:assert');
const GitHubActionScraper = require('../scripts/github-action-scraper');

function tierWith(teams, games, extra = {}) {
  return {
    standings: { teams, lastUpdated: '2026-08-11T10:00:00.000Z', totalTeams: teams.length },
    schedule: { teamSchedules: {}, allGames: games, recentGames: [], upcomingGames: [], totalGames: games.length, lastUpdated: '2026-08-11T10:00:00.000Z', ...extra },
    summary: { totalTeams: teams.length, totalGames: games.length, completedGames: 0, upcomingGames: games.length }
  };
}

function formatted(divisions) {
  return {
    metadata: { lastUpdated: '2026-08-11T12:00:00.000Z', source: 'YSBA Website', totalDivisions: 0 },
    divisions
  };
}

test('carries forward divisions missing from the new scrape', () => {
  const prev = formatted({
    '8U': { displayName: '8U Rep', tiers: { 'rep-tier-3': tierWith([{ team: 'A' }], []) } },
    '13U': { displayName: '13U Rep', tiers: { 'rep-tier-1': tierWith([{ team: 'B' }], []) } }
  });
  const next = formatted({
    '8U': { displayName: '8U Rep', tiers: { 'rep-tier-3': tierWith([{ team: 'A2' }], []) } }
  });

  const merged = GitHubActionScraper.mergeFormattedData(next, prev, new Set());

  assert.ok(merged.divisions['13U'], '13U should be carried forward from previous data');
  assert.strictEqual(merged.divisions['13U'].tiers['rep-tier-1'].standings.teams[0].team, 'B');
  // Fresh data must win where present
  assert.strictEqual(merged.divisions['8U'].tiers['rep-tier-3'].standings.teams[0].team, 'A2');
});

test('carries forward tiers missing within a division present in the new scrape', () => {
  const prev = formatted({
    '9U': {
      displayName: '9U Rep',
      tiers: {
        'rep-tier-2': tierWith([{ team: 'Old2' }], []),
        'rep-tier-3': tierWith([{ team: 'Old3' }], [])
      }
    }
  });
  const next = formatted({
    '9U': { displayName: '9U Rep', tiers: { 'rep-tier-2': tierWith([{ team: 'New2' }], []) } }
  });

  const merged = GitHubActionScraper.mergeFormattedData(next, prev, new Set());

  assert.strictEqual(merged.divisions['9U'].tiers['rep-tier-2'].standings.teams[0].team, 'New2');
  assert.strictEqual(merged.divisions['9U'].tiers['rep-tier-3'].standings.teams[0].team, 'Old3');
});

test('keeps previous schedule when the new scrape only failed the schedule', () => {
  const prevGames = [{ homeTeam: 'X', awayTeam: 'Y', isCompleted: true }];
  const prev = formatted({
    '11U': { displayName: '11U Rep', tiers: { 'rep-tier-2': tierWith([{ team: 'Old' }], prevGames) } }
  });
  const next = formatted({
    '11U': {
      displayName: '11U Rep',
      tiers: {
        'rep-tier-2': {
          standings: { teams: [{ team: 'Fresh' }], totalTeams: 1 },
          schedule: { teamSchedules: {}, allGames: [], error: 'No schedule data available' },
          summary: { totalTeams: 1, totalGames: 0, completedGames: 0, upcomingGames: 0 }
        }
      }
    }
  });

  const merged = GitHubActionScraper.mergeFormattedData(next, prev, new Set(['11U-rep-tier-2']));

  const tier = merged.divisions['11U'].tiers['rep-tier-2'];
  assert.strictEqual(tier.standings.teams[0].team, 'Fresh', 'fresh standings kept');
  assert.strictEqual(tier.schedule.allGames.length, 1, 'previous schedule preserved');
  assert.strictEqual(tier.schedule.error, undefined, 'error flag not carried onto preserved schedule');
  assert.strictEqual(tier.summary.totalGames, 1, 'summary game counts follow preserved schedule');
});

test('updates metadata.totalDivisions to the merged tier-combination count', () => {
  const prev = formatted({
    '8U': { displayName: '8U', tiers: { 'rep-tier-3': tierWith([], []) } },
    '13U': { displayName: '13U', tiers: { 'rep-tier-1': tierWith([], []), 'rep-tier-2': tierWith([], []) } }
  });
  const next = formatted({
    '8U': { displayName: '8U', tiers: { 'rep-tier-3': tierWith([], []) } }
  });

  const merged = GitHubActionScraper.mergeFormattedData(next, prev, new Set());
  assert.strictEqual(merged.metadata.totalDivisions, 3);
});

test('merges API data, carrying forward missing division/tier entries', () => {
  const prev = {
    lastUpdated: '2026-08-11T10:00:00.000Z',
    divisions: {
      '8U': { 'rep-tier-3': { standings: [{ team: 'A' }], recentGames: [], nextGames: [] } },
      '13U': { 'rep-tier-1': { standings: [{ team: 'B' }], recentGames: [{ g: 1 }], nextGames: [] } }
    }
  };
  const next = {
    lastUpdated: '2026-08-11T12:00:00.000Z',
    divisions: {
      '8U': { 'rep-tier-3': { standings: [{ team: 'A2' }], recentGames: [], nextGames: [] } }
    }
  };

  const merged = GitHubActionScraper.mergeAPIData(next, prev, new Set());

  assert.strictEqual(merged.divisions['8U']['rep-tier-3'].standings[0].team, 'A2');
  assert.strictEqual(merged.divisions['13U']['rep-tier-1'].standings[0].team, 'B');
});

test('merges API data, preserving previous games for schedule-failed tiers', () => {
  const prev = {
    divisions: {
      '11U': { 'rep-tier-2': { standings: [{ team: 'Old' }], recentGames: [{ g: 1 }], nextGames: [{ g: 2 }] } }
    }
  };
  const next = {
    divisions: {
      '11U': { 'rep-tier-2': { standings: [{ team: 'Fresh' }], recentGames: [], nextGames: [] } }
    }
  };

  const merged = GitHubActionScraper.mergeAPIData(next, prev, new Set(['11U-rep-tier-2']));

  const tier = merged.divisions['11U']['rep-tier-2'];
  assert.strictEqual(tier.standings[0].team, 'Fresh');
  assert.strictEqual(tier.recentGames.length, 1);
  assert.strictEqual(tier.nextGames.length, 1);
});
