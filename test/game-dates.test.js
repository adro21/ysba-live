const { test } = require('node:test');
const assert = require('node:assert');
const YSBAScraper = require('../src/scraper/scraper');

// attachGameDates runs in Node (not page.evaluate) and anchors YSBA
// wall-clock times to America/Toronto, appending the current year when
// the site omits it.

test('attaches EDT-anchored ISO date for a summer game with explicit year', () => {
  const games = [{ dateText: 'Tue, May 12, 2026', time: '6:30 PM', date: null }];
  const [game] = YSBAScraper.attachGameDates(games);
  // 6:30 PM EDT (UTC-4) => 22:30 UTC
  assert.strictEqual(game.date, '2026-05-12T22:30:00.000Z');
});

test('appends current year when dateText has no year', () => {
  const year = new Date().getFullYear();
  const games = [{ dateText: 'Thu, Jun 18', time: '9:00 AM', date: null }];
  const [game] = YSBAScraper.attachGameDates(games);
  assert.strictEqual(game.date, `${year}-06-18T13:00:00.000Z`);
});

test('anchors EST dates with UTC-5 offset', () => {
  const games = [{ dateText: 'Sat, Jan 10, 2026', time: '1:00 PM', date: null }];
  const [game] = YSBAScraper.attachGameDates(games);
  // 1:00 PM EST (UTC-5) => 18:00 UTC
  assert.strictEqual(game.date, '2026-01-10T18:00:00.000Z');
});

test('leaves date null when dateText is missing or a placeholder', () => {
  const games = [
    { dateText: '', time: '6:30 PM', date: null },
    { dateText: '-', time: '6:30 PM', date: null }
  ];
  const result = YSBAScraper.attachGameDates(games);
  assert.strictEqual(result[0].date, null);
  assert.strictEqual(result[1].date, null);
});

test('treats placeholder time as midnight ET', () => {
  const games = [{ dateText: 'Tue, May 12, 2026', time: '-', date: null }];
  const [game] = YSBAScraper.attachGameDates(games);
  assert.strictEqual(game.date, '2026-05-12T04:00:00.000Z');
});

test('dedupeGames drops repeated rows but keeps doubleheaders', () => {
  const gameA = { dateText: 'Sat, Jul 4', time: '10:00 AM', homeTeamCode: '1', awayTeamCode: '2' };
  const gameA2 = { ...gameA };
  const doubleheader = { ...gameA, time: '1:00 PM' };
  const result = YSBAScraper.dedupeGames([gameA, gameA2, doubleheader]);
  assert.strictEqual(result.length, 2);
});
