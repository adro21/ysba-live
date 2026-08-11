const { test } = require('node:test');
const assert = require('node:assert');
const YSBAScraper = require('../src/scraper/scraper');

// When the orchestrator times out a division, the underlying browser
// operation is still occupying the single-file session queue. resetSession
// must reject everything still waiting in the queue so stale work cannot
// starve subsequent divisions.

test('resetSession rejects queued (not yet started) operations', async () => {
  const scraper = new YSBAScraper();

  let releaseInflight;
  const inflight = scraper.withBrowserSession(
    () => new Promise(resolve => { releaseInflight = resolve; }),
    'slow-op'
  );

  // Queued behind the in-flight op; must never start after a reset.
  let queuedRan = false;
  const queued = scraper.withBrowserSession(async () => { queuedRan = true; }, 'queued-op');
  queued.catch(() => {}); // rejection asserted below

  await scraper.resetSession();

  await assert.rejects(queued, /session reset/i);
  assert.strictEqual(queuedRan, false, 'queued op must not run after reset');

  releaseInflight();
  await inflight;
});

test('withBrowserSession accepts new work after a reset', async () => {
  const scraper = new YSBAScraper();

  let releaseInflight;
  const inflight = scraper.withBrowserSession(
    () => new Promise(resolve => { releaseInflight = resolve; }),
    'slow-op'
  );
  const queued = scraper.withBrowserSession(async () => 'never', 'queued-op');
  queued.catch(() => {});

  await scraper.resetSession();
  releaseInflight();
  await inflight;

  const result = await scraper.withBrowserSession(async () => 'fresh', 'post-reset-op');
  assert.strictEqual(result, 'fresh');
});
