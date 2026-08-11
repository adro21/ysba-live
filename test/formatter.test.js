const { test } = require('node:test');
const assert = require('node:assert');
const DataFormatter = require('../src/scraper/formatter');

// The dashboard is rebuilt from already-formatted (merged) data, where a
// completed game's scores live under `score: {home, away}` instead of the
// raw `homeScore`/`awayScore`. formatGames must accept both shapes.

test('formatGames keeps scores when re-formatting an already-formatted game', () => {
  const formatter = new DataFormatter();
  const [game] = formatter.formatGames([{
    date: '2026-08-10T22:30:00.000Z',
    dateText: 'Mon, Aug 10',
    time: '6:30 PM',
    homeTeam: 'X',
    awayTeam: 'Y',
    isCompleted: true,
    score: { home: 5, away: 3, scoreText: '3 - 5' }
  }]);

  assert.strictEqual(game.score.home, 5);
  assert.strictEqual(game.score.away, 3);
});
