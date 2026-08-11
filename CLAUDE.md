# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
npm run dev        # Start development server with nodemon (uses server-optimized.js)
npm start          # Start production server (uses server-optimized.js)
npm run dev-worker # Start worker in development mode with nodemon
npm run build      # Update cache version for CSS/JS files
```

### Background Worker
```bash
npm run start-worker  # Start background scraper worker
npm run test-worker   # Test worker locally (same as start-worker)
```

### Testing & Debugging
```bash
# Run the unit test suite (node:test, no framework deps)
npm test

# Test API endpoints
curl "http://localhost:3000/api/status"
curl "http://localhost:3000/api/divisions?filterEmpty=true"
curl "http://localhost:3000/api/standings?division=9U-select&tier=all-tiers"

# Enable debug mode in browser console
localStorage.setItem('debugMode', 'true')

# Targeted local scraper run (see warning below about .env keys)
SENDGRID_API_KEY= OPENAI_API_KEY= NODE_ENV=production \
  SCRAPER_ONLY_DIVISIONS="8U-rep,10U-interlock" \
  node scripts/github-action-scraper.js
```

**⚠️ Local scraper runs**: `.env` contains real SendGrid/OpenAI keys. Always blank
them (`SENDGRID_API_KEY= OPENAI_API_KEY=`) when running the scraper locally —
a stale local dataset makes the change detector see huge standings "changes"
and it will email real subscribers. Env knobs: `SCRAPER_ONLY_DIVISIONS`
(comma-separated division filter) and `SCRAPER_TIMEOUT_MS` (script budget;
useful because macOS throttles backgrounded processes and can stretch
wall-clock time far past the default 12-minute cap).

## Architecture Overview

This is a Node.js web application that displays real-time baseball standings for York Simcoe Baseball Association (YSBA). The application uses Express for the server, vanilla JavaScript for the frontend, and relies entirely on pre-generated JSON files from GitHub Actions for data (no in-app scraping).

### Background Worker System

The application now includes a background worker system (`src/scraper/`) that:
- Runs independently as a background service via GitHub Actions every 30 minutes
- Scrapes all YSBA divisions and detects changes
- Generates structured JSON files (`data/ysba.json`, `public/ysba.json`)
- Sends email notifications when significant standings changes occur
- Generates new homepage stories when story-worthy events happen (first wins, hot streaks, undefeated runs, etc.)
- Provides clean API data that the frontend can consume quickly

### Key Components

**`server-optimized.js`** - Main Express server handling all routes, API endpoints (serves cached JSON files only, no scraping)

**`scripts/github-action-scraper.js`** - GitHub Actions worker that orchestrates scraping, change detection, emails, and story generation

**`src/scraper/scraper.js`** - Modular Puppeteer-based scraping engine (extracted from original scraper.js). Two invariants worth knowing:
- Game timestamps are attached **in Node** by `YSBAScraper.attachGameDates` (ET-anchored via `buildEasternDate`) after `page.evaluate` extraction — helpers defined in Node scope do not exist inside the browser context, and calling them there fails silently (this once nulled every game date for months).
- The schedule is an ASP.NET DataGrid paged at 100 rows; `gotoSchedulePage` walks every numeric pager link with proper `waitForNavigation` (each click is a full postback), and `dedupeGames` drops exact repeats. Never hardcode pager control IDs like `dgGrid$ctl104$ctl02`.

**`src/scraper/interlock-scraper.js`** - HTTP-only scraper for the Toronto Baseball Association "Rep Interlock" league. Mirrors `YSBAScraper`'s public interface (`scrapeStandingsForDivision`, `scrapeScheduleForDivision`) but reads from the TeamSnap Tournaments public JSON API instead of driving Puppeteer. Selected automatically by `github-action-scraper.js` and `worker.js` whenever a division has `source: 'interlock'` in `config.js`.

**`src/scraper/formatter.js`** - Data formatting and structuring for clean JSON output

**`src/scraper/writer.js`** - File writing operations for JSON output to data/ and public/ directories

**`config.js`** - Multi-division configuration defining all divisions, tiers, and their settings

**`public/js/app.js`** - Frontend application logic handling standings display, team schedules, and user interactions

**`email-service.js`** - SendGrid-powered email notification system with GitHub Gist backup for subscriber data

**`ai-story-service.js`** - OpenAI-powered story generation system for homepage news content

### Multi-Division System

The application supports multiple divisions with dynamic routing:
- **Rep Divisions**: 8U through 22U and Senior (with A/AA/AAA tiers) — scraped from YSBA via Puppeteer
- **Select Divisions**: 9U, 11U, 13U, 15U (all teams) — scraped from YSBA via Puppeteer
- **Interlock Divisions**: 10U AA, 11U AAA — pulled from the Toronto Baseball Association TeamSnap Tournaments API (`events.teamsnap.com/events/48913`). The page at `torontobaseball.ca/schedules-standings/schedule/` is just an iframe over that SPA; scraping the iframe's `divisionSelect` dropdown would be brittle, so we hit the underlying public JSON API directly using the API key extracted from the SPA bundle (stored in `config.INTERLOCK_TEAMSNAP`).
- **URL structure**: `/{division}/{tier}` (e.g., `/13U-rep/A`, `/9U-select/all-tiers`, `/10U-interlock/all-tiers`, `/11U-interlock/all-tiers`)

Division configuration is centralized in `config.js` using `getDivisionConfig(division, tier)`. Interlock divisions are flagged with `source: 'interlock'` and `tsDivisionId: <id>`; the GitHub Actions worker dispatches to `InterlockScraper` for those, and to `YSBAScraper` (Puppeteer) for everything else.

### Caching Strategy

Three-level caching system with 30-minute duration:
1. **Division cache**: `cachedDataByDivision[division-tier]` - Main standings data
2. **Team schedule cache**: `teamScheduleCache[teamCode-division-tier]` - Individual team schedules  
3. **Comprehensive schedule cache**: `allGamesCache[schedule-division-tier]` - All games for background loading

### Browser Session Management

Scraping operations use `withBrowserSession()` to coordinate Puppeteer instances and prevent conflicts. Only one browser session runs at a time.

### Email Notification System

- **Primary storage**: GitHub Gist (unlimited capacity, automatic backup)
- **Fallback**: Environment variables (4KB limit)
- **Change detection**: Compares standings between scraping cycles
- **Token-based unsubscribe**: Secure subscriber management

### Application vs Background Worker

**Application Server** (`server-optimized.js`):
- Serves cached JSON files only
- No scraping or Puppeteer operations
- Fast API responses from pre-generated data
- Handles email subscriptions and serves pre-generated stories

**Background Worker** (`scripts/github-action-scraper.js`):
- Runs independently via GitHub Actions every 30 minutes
- Performs all Puppeteer scraping operations
- Detects significant changes in standings
- Sends email notifications for standings changes
- Generates new stories when story-worthy events occur (first wins, hot streaks, etc.)
- Generates JSON files that the application serves
- **Merge-on-write (never wipe)**: freshly scraped data is merged over the
  previously committed dataset (`GitHubActionScraper.mergeFormattedData` /
  `mergeAPIData`). Divisions that fail or are skipped keep their
  last-known-good standings and schedules; a tier whose standings succeeded
  but whose schedule scrape failed keeps its previous schedule. A partial run
  can therefore never remove divisions from the site.
- **Session reset on failure**: the orchestrator's `withTimeout` abandons but
  cannot cancel a Puppeteer operation, and `YSBAScraper.withBrowserSession`
  runs a single-file queue — so an abandoned op would otherwise starve every
  later division into 45s timeouts (a cascade that trips the circuit
  breaker). After any division/schedule failure the orchestrator calls
  `scraper.resetSession()`, which rejects queued ops and kills the browser.
- **Circuit breaker**: After 3 consecutive scrape failures, assumes the YSBA site is down and exits gracefully (code 0) to avoid GitHub Actions failure emails. Previous data files remain valid.

## Key API Endpoints

- `GET /api/standings?division=X&tier=Y` - Get standings data
- `GET /api/divisions?filterEmpty=true` - Get available divisions
- `GET /api/team/:teamCode/schedule?division=X&tier=Y` - Get team schedule
- `GET /api/stories` - Get pre-generated homepage stories
- `GET /api/status` - Application health check
- `POST /api/subscribe` - Email subscription
- `POST /api/unsubscribe-token` - Token-based unsubscribe
- `POST /api/stories/generate` - Manually trigger story generation (testing only)

## Common Development Tasks

### Adding New Division
1. Update `config.js` - add division to appropriate section (rep/select)
2. Test with `/?division=NEW-DIVISION&tier=TIER`
3. Verify scraping works via `/api/standings` endpoint

### Modifying Scraping Logic
1. Update `src/scraper/scraper.js` - modify Puppeteer selectors/logic
2. Run `npm test`, then do a targeted live run with `SCRAPER_ONLY_DIVISIONS` (blank the `.env` keys — see Testing & Debugging above)
3. Push to main — the workflow has a push trigger on `src/scraper/**`, so a full CI scrape starts immediately and commits regenerated data

### Frontend Changes
1. Main logic in `public/js/app.js`
2. Styles in `public/css/styles.css`
3. Use `npm run build` to update cache version for deployment

### Email System Changes
1. Modify `email-service.js` for email logic
2. Use `/api/subscribers/export` for testing subscriber data
3. GitHub Gist backup happens automatically on deployment