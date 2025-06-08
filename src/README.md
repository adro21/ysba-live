# YSBA Background Worker System

This directory contains the background worker system that automatically scrapes YSBA standings and schedule data.

## Architecture

```
src/scraper/
├── worker.js      # Main worker with cron scheduling
├── scraper.js     # Puppeteer scraping logic
├── formatter.js   # Data formatting for JSON output
└── writer.js      # File writing operations
```

## How It Works

1. **Worker** (`worker.js`) runs every 30 minutes via cron
2. **Scraper** (`scraper.js`) fetches data from YSBA website using Puppeteer
3. **Formatter** (`formatter.js`) structures the raw data into clean JSON
4. **Writer** (`writer.js`) saves files to both `data/` and `public/` directories

## Output Files

- `data/ysba.json` - Main comprehensive data file
- `public/ysba.json` - Public-facing copy for web access
- `data/ysba-api.json` - Optimized API version (smaller)
- `data/dashboard.json` - Summary data for dashboards
- `data/divisions/[division-tier].json` - Individual division files
- `data/metadata.json` - Worker run information
- `data/errors/` - Error logs (automatically cleaned)

## Local Development

```bash
# Test the worker
npm run test-worker

# Run in development mode
npm run dev-worker

# Check generated files
ls -la data/
ls -la public/
```

## Deployment

The worker runs as a separate Render background service defined in `render.yaml`:

```yaml
- type: worker
  name: ysba-scraper-worker
  startCommand: npm run start-worker
```

## Features

- **Retry Logic**: 3 attempts with exponential backoff
- **Error Handling**: Detailed error logging and recovery
- **Performance**: Optimized for speed with production settings
- **Multi-Division**: Scrapes all 52 division/tier combinations
- **Browser Coordination**: Prevents conflicts with session management
- **Resource Cleanup**: Automatic browser cleanup and memory management

## Data Structure

Generated JSON follows this structure:

```json
{
  "metadata": {
    "lastUpdated": "2025-06-08T01:54:07.353Z",
    "source": "YSBA Website",
    "totalDivisions": 52
  },
  "divisions": {
    "9U": {
      "displayName": "9U Select",
      "tiers": {
        "select-all-tiers": {
          "standings": { ... },
          "schedule": { ... },
          "summary": { ... }
        }
      }
    }
  }
}
```

## Monitoring

The worker provides status information and logs:

- Console output shows progress for each division
- Metadata includes run statistics and timing
- Error logs are preserved for debugging
- File size and performance metrics are tracked