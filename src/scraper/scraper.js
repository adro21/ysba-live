const puppeteer = require('puppeteer');
const config = require('../../config');

/**
 * Construct a UTC Date for an Eastern-Time wall-clock moment.
 * Handles EDT (UTC-4) / EST (UTC-5) automatically via Intl.
 * The scraper runs on GitHub Actions in UTC, so naïve
 * `new Date("May 12, 2026 6:00 PM")` produces a UTC-anchored time
 * instead of the ET-anchored time YSBA actually publishes.
 */
const MONTH_INDEX = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
function etOffsetMinutes(year, monthIdx, day) {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Toronto',
      timeZoneName: 'short',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric'
    });
    const parts = fmt.formatToParts(new Date(Date.UTC(year, monthIdx, day, 16)));
    const tz = parts.find(p => p.type === 'timeZoneName')?.value;
    return tz === 'EST' ? 300 : 240;
  } catch { return 240; }
}
function buildEasternDate(dateText, timeText) {
  // dateText is something like "Thu, May 12, 2026" (year may already be appended).
  // timeText is something like "6:30 PM".
  if (!dateText) return null;
  const md = dateText.match(/([A-Z][a-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?/);
  if (!md) return null;
  const monthIdx = MONTH_INDEX[md[1].slice(0, 3)];
  const day = parseInt(md[2], 10);
  const year = md[3] ? parseInt(md[3], 10) : new Date().getUTCFullYear();
  if (!Number.isFinite(monthIdx) || !Number.isFinite(day)) return null;

  let hh = 0, mm = 0;
  if (timeText) {
    const tm = timeText.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (tm) {
      hh = parseInt(tm[1], 10);
      mm = parseInt(tm[2], 10);
      const isPM = tm[3].toUpperCase() === 'PM';
      if (hh === 12) hh = 0;
      if (isPM) hh += 12;
    }
  }
  const offset = etOffsetMinutes(year, monthIdx, day);
  return new Date(Date.UTC(year, monthIdx, day, hh, mm) + offset * 60 * 1000);
}

// Team name mapping for teams based on YSBA team listings
const TEAM_NAME_MAPPING = {
  '511105': 'Midland Penetang Twins 9U DS',
  '511106': 'Aurora-King Jays 9U DS',
  '511107': 'Barrie Baycats 9U DS', 
  '511108': 'Bradford Tigers 9U DS',
  '511109': 'Collingwood Jays 9U DS',
  '511110': 'Innisfil Cardinals 9U DS',
  '511111': 'Markham Mariners 9U DS',
  '511112': 'Newmarket Hawks 9U DS',
  '511113': 'Richmond Hill Phoenix 9U DS',
  '511114': 'Thornhill Reds 9U DS',
  '511115': 'TNT Thunder 9U DS',
  '511116': 'Caledon Nationals 9U HS',
  '518965': 'Vaughan Vikings 8U DS',
  '518966': 'Vaughan Vikings 9U DS'
};

class YSBAScraper {
  constructor() {
    this.browser = null;
    this.isBrowserBusy = false;
    this.browserOperationQueue = [];
    this.consecutiveBrowserErrors = 0;
    this.maxConsecutiveErrors = 2;
  }

  // Anchor scraped wall-clock date/time strings to America/Toronto and
  // attach ISO timestamps. Runs in Node (page.evaluate can't see
  // buildEasternDate, so date parsing must happen after extraction).
  static attachGameDates(games) {
    const currentYear = new Date().getFullYear();
    return games.map(game => {
      const dateText = game.dateText;
      if (!dateText || dateText === '-') {
        return { ...game, date: null };
      }

      let fullDateText = dateText;
      if (!dateText.includes(String(currentYear)) && !dateText.includes(String(currentYear + 1))) {
        fullDateText = `${dateText}, ${currentYear}`;
      }

      const timeText = game.time && game.time !== '-' ? game.time : null;
      let gameDate = buildEasternDate(fullDateText, timeText);
      if (!gameDate || isNaN(gameDate.getTime())) {
        // Permissive fallback so we don't drop the game outright
        const fallback = new Date(fullDateText);
        gameDate = isNaN(fallback.getTime()) ? null : fallback;
      }

      return { ...game, date: gameDate ? gameDate.toISOString() : null };
    });
  }

  // Drop exact repeats (same date, time, and matchup) that can appear if a
  // pager postback races the extraction. Doubleheaders differ by time and
  // are kept.
  static dedupeGames(games) {
    const seen = new Set();
    return games.filter(game => {
      const key = [game.dateText, game.time, game.homeTeamCode, game.awayTeamCode].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Reject everything still waiting in the session queue and drop the
  // browser. Called by the orchestrator when it abandons a timed-out
  // operation: the stale op still occupies the single-file queue, and
  // without a reset every later division would starve behind it.
  async resetSession(reason = 'timeout') {
    const pending = this.browserOperationQueue.splice(0, this.browserOperationQueue.length);
    for (const entry of pending) {
      entry.reject(new Error(`Browser session reset (${reason}): ${entry.operationName} cancelled`));
    }
    if (pending.length > 0) {
      console.log(`🔄 Session reset: cancelled ${pending.length} queued operation(s)`);
    }
    if (this.browser) {
      const browser = this.browser;
      this.browser = null;
      try {
        // close() can wedge behind a stuck navigation; don't let the reset
        // itself stall the run.
        await Promise.race([
          browser.close().catch(() => {}),
          new Promise(resolve => setTimeout(resolve, 5000))
        ]);
      } catch (e) {
        // Ignore close errors
      }
      try {
        browser.process()?.kill('SIGKILL');
      } catch (e) {
        // Already gone
      }
    }
    this.consecutiveBrowserErrors = 0;
  }

  // Force restart the browser if it's in a bad state
  async restartBrowser() {
    console.log('🔄 Restarting browser due to errors...');
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (e) {
        // Ignore close errors
      }
      this.browser = null;
    }
    this.consecutiveBrowserErrors = 0;
    return await this.initBrowser();
  }

  async initBrowser() {
    if (!this.browser || !this.browser.connected) {
      console.log('Creating new browser instance...');
      
      const browserOptions = {
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
        ],
        timeout: config.REQUEST_TIMEOUT
      };

      if (process.env.PUPPETEER_ARGS) {
        const envArgs = process.env.PUPPETEER_ARGS.split(',');
        browserOptions.args.push(...envArgs);
      }

      this.browser = await puppeteer.launch(browserOptions);
    }
    return this.browser;
  }

  async withBrowserSession(operation, operationName = 'browser operation') {
    return new Promise((resolve, reject) => {
      this.browserOperationQueue.push({
        operation,
        operationName,
        resolve,
        reject
      });
      
      this.processBrowserQueue();
    });
  }
  
  async processBrowserQueue() {
    if (this.isBrowserBusy || this.browserOperationQueue.length === 0) {
      return;
    }

    this.isBrowserBusy = true;

    while (this.browserOperationQueue.length > 0) {
      const { operation, operationName, resolve, reject } = this.browserOperationQueue.shift();

      try {
        console.log(`🔄 Executing browser operation: ${operationName}`);
        const result = await operation();
        this.consecutiveBrowserErrors = 0; // Reset on success
        resolve(result);
      } catch (error) {
        console.error(`❌ Browser operation failed: ${operationName}:`, error.message);
        this.consecutiveBrowserErrors++;

        // If we've had too many consecutive errors, restart browser for next operation
        if (this.consecutiveBrowserErrors >= this.maxConsecutiveErrors) {
          console.log(`⚠️  ${this.consecutiveBrowserErrors} consecutive browser errors - will restart browser`);
          try {
            await this.restartBrowser();
          } catch (restartError) {
            console.error('Failed to restart browser:', restartError.message);
          }
        }

        reject(error);
      }
    }

    this.isBrowserBusy = false;
  }

  async scrapeStandingsForDivision(division, tier) {
    const divisionConfig = config.getDivisionConfig(division, tier);
    if (!divisionConfig) {
      throw new Error(`Invalid division/tier combination: ${division}/${tier}`);
    }

    console.log(`Scraping standings for ${division}/${tier} (YSBA: ${divisionConfig.ysbaParams.division}/${divisionConfig.ysbaParams.tier})`);
    
    return await this.performDivisionScrape(
      divisionConfig.ysbaParams.division, 
      divisionConfig.ysbaParams.tier, 
      division
    );
  }

  async performDivisionScrape(ysbaDiv, ysbaTier, divisionKey) {
    return await this.withBrowserSession(async () => {
      const browser = await this.initBrowser();
      const page = await browser.newPage();

      try {
        await page.setUserAgent(config.USER_AGENT);
        await page.setViewport({ width: 1366, height: 768 });

        // Optimize for production
        const isProduction = process.env.NODE_ENV === 'production';
        if (isProduction) {
          await page.setRequestInterception(true);
          page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (['image', 'stylesheet', 'font'].includes(resourceType)) {
              req.abort();
            } else {
              req.continue();
            }
          });
        }

        console.log('Navigating to YSBA standings page...');
        // Use shorter timeout - YSBA is either responsive (< 15s) or completely down
        const navigationTimeout = isProduction ? 30000 : config.REQUEST_TIMEOUT;
        await page.goto(config.YSBA_URL, {
          waitUntil: isProduction ? 'domcontentloaded' : 'networkidle2',
          timeout: navigationTimeout
        });

        await page.waitForSelector('select[name="ddlDivision"]', { timeout: 10000 });

        console.log(`Selecting division: ${ysbaDiv}...`);
        await page.select('select[name="ddlDivision"]', ysbaDiv);

        await this.sleep(1000);

        console.log(`Selecting tier: ${ysbaTier}...`);
        await page.select('select[name="ddlTier"]', ysbaTier);

        console.log('Clicking search button...');
        await page.click('#cmdSearch');

        await page.waitForSelector('#dgGrid', { timeout: 15000 });

        console.log('Extracting standings data...');
        const standingsData = await page.evaluate((teamMappingJson) => {
          const teamMapping = JSON.parse(teamMappingJson);
          
          const table = document.getElementById('dgGrid');
          if (!table) {
            throw new Error('Standings table not found');
          }

          const rows = Array.from(table.querySelectorAll('tr'));
          if (rows.length === 0) {
            throw new Error('No data rows found in standings table');
          }

          const headerRow = rows.find(row => {
            const cells = row.querySelectorAll('th, td');
            return Array.from(cells).some(cell => 
              cell.textContent.trim().toLowerCase().includes('team') ||
              cell.textContent.trim().toLowerCase().includes('gp') ||
              cell.textContent.trim().toLowerCase().includes('wins') ||
              cell.textContent.trim().toLowerCase().includes('name')
            );
          });

          if (!headerRow) {
            throw new Error('Header row not found');
          }

          const dataRows = rows.filter(row => {
            const firstCell = row.querySelector('td');
            if (!firstCell) return false;
            
            const cellText = firstCell.textContent.trim();
            return cellText && !cellText.toLowerCase().includes('team') && 
                   !cellText.toLowerCase().includes('name') &&
                   !cellText.toLowerCase().includes('standing');
          });

          const teams = dataRows.map((row, index) => {
            const cells = Array.from(row.querySelectorAll('td'));
            const cellTexts = cells.map(cell => cell.textContent.trim());

            if (cells.length < 7) {
              return null;
            }

            // Team code extraction. As of mid-2026 the YSBA standings page
            // renders the code as plain text in cell[0] (the cell anchor is a
            // sort postback, not a team link). Cell[1] also carries it on the
            // mobile popover anchor via data-content. Older formats had the
            // code in a tmcd= query string, so we keep that as a fallback.
            let teamCode = null;

            const firstCellText = cells[0].textContent.trim();
            if (/^\d{4,8}$/.test(firstCellText)) {
              teamCode = firstCellText;
            }

            if (!teamCode && cells[1]) {
              const popover = cells[1].querySelector('a[data-content]');
              const dataContent = popover && popover.getAttribute('data-content');
              if (dataContent && /^\d{4,8}$/.test(dataContent.trim())) {
                teamCode = dataContent.trim();
              }
            }

            if (!teamCode) {
              const tmcdLink = row.querySelector('a[href*="tmcd="]');
              if (tmcdLink) {
                const codeMatch = (tmcdLink.getAttribute('href') || '').match(/tmcd=(\d+)/);
                if (codeMatch) teamCode = codeMatch[1];
              }
            }

            if (!teamCode) {
              for (let i = 0; i < Math.min(cells.length, 3); i++) {
                const cellText = cells[i].textContent.trim();
                const textCodeMatch = cellText.match(/\b(\d{5,7})\b/);
                if (textCodeMatch) {
                  teamCode = textCodeMatch[1];
                  break;
                }
              }
            }

            let teamName = teamCode && teamMapping[teamCode] ? teamMapping[teamCode] : null;
            
            if (!teamName) {
              teamName = cells[1] ? cells[1].textContent.trim() : 
                        cells[0] ? cells[0].textContent.trim() : 
                        `Team ${teamCode || index + 1}`;
            }

            const cellValues = cellTexts.slice(2, 9).map(text => {
              const num = parseInt(text);
              return isNaN(num) ? 0 : num;
            });

            const gamesPlayed = cellValues[0] || 0;
            const wins = parseInt(cellValues[1]) || 0;
            const losses = parseInt(cellValues[2]) || 0;
            const ties = parseInt(cellValues[3]) || 0;
            
            let winPercentage = '.000';
            const totalGames = wins + losses + ties;
            
            if (totalGames > 0) {
              const percentage = ((wins + 0.5 * ties) / totalGames) * 100;
              winPercentage = (percentage / 100).toFixed(3);
            }

            return {
              position: index + 1,
              team: teamName,
              teamCode: teamCode || `unknown-${index + 1}`,
              gamesPlayed,
              wins,
              losses,
              ties,
              points: cellValues[4] || 0,
              runsFor: cellValues[5] || 0,
              runsAgainst: cellValues[6] || 0,
              winPercentage
            };
          }).filter(team => team !== null);

          return {
            teams,
            lastUpdated: new Date().toISOString(),
            source: 'YSBA Website'
          };
        }, JSON.stringify(TEAM_NAME_MAPPING));

        await page.close();
        return standingsData;
      } catch (error) {
        console.error('Error in performDivisionScrape:', error);
        await page.close();
        throw error;
      }
    }, `scrape-${divisionKey}-${ysbaDiv}-${ysbaTier}`);
  }

  async scrapeScheduleForDivision(division, tier) {
    const divisionConfig = config.getDivisionConfig(division);
    if (!divisionConfig) {
      throw new Error(`Division '${division}' is not supported.`);
    }

    const tierConfig = divisionConfig.tiers[tier];
    if (!tierConfig) {
      throw new Error(`Tier '${tier}' is not supported for division '${division}'.`);
    }

    const ysbaDiv = divisionConfig.ysbaValue;
    const ysbaTier = tierConfig.ysbaValue;
    
    console.log(`Scraping schedule for ${division}/${tier} (YSBA: ${ysbaDiv}/${ysbaTier})`);

    return await this.withBrowserSession(async () => {
      const browser = await this.initBrowser();
      const page = await browser.newPage();

      try {
        const isProduction = process.env.NODE_ENV === 'production';
        
        if (isProduction) {
          await page.setRequestInterception(true);
          page.on('request', (req) => {
            const resourceType = req.resourceType();
            if (['image', 'stylesheet', 'font'].includes(resourceType)) {
              req.abort();
            } else {
              req.continue();
            }
          });
        }
        
        await page.setUserAgent(config.USER_AGENT);
        await page.setViewport({ width: 1366, height: 768 });

        console.log('Navigating to YSBA schedule page...');
        // Use shorter timeout - YSBA is either responsive (< 15s) or completely down
        const navigationTimeout = isProduction ? 25000 : config.REQUEST_TIMEOUT;

        await page.goto('https://www.yorksimcoebaseball.com/Club/xScheduleMM.aspx', {
          waitUntil: isProduction ? 'domcontentloaded' : 'networkidle2',
          timeout: navigationTimeout
        });

        await page.waitForSelector('select[name="ddlDivision"]', { timeout: 10000 });

        console.log(`Selecting division (YSBA value: ${ysbaDiv})...`);
        await page.select('select[name="ddlDivision"]', ysbaDiv);

        await this.sleep(isProduction ? 500 : 1000);

        console.log('Selecting Regular category...');
        await page.select('select[name="ddlCategory"]', '1');

        await this.sleep(isProduction ? 500 : 1000);

        console.log('Clicking search button...');
        await page.click('#cmdSearch');

        const waitTimeout = isProduction ? 20000 : 15000;
        await page.waitForSelector('#dgGrid', { timeout: waitTimeout });

        console.log('Extracting games from page 1...');
        let allGames = await this.extractGamesFromPage(page);

        // The schedule is an ASP.NET DataGrid paged at 100 rows. Walk every
        // numeric pager link (each click is a full postback) instead of the
        // old hardcoded page-2 control, which silently truncated divisions
        // with 200+ games and raced the postback.
        const MAX_SCHEDULE_PAGES = 12;
        try {
          for (let nextPage = 2; nextPage <= MAX_SCHEDULE_PAGES; nextPage++) {
            const advanced = await this.gotoSchedulePage(page, nextPage);
            if (!advanced) break;

            console.log(`Extracting games from page ${nextPage}...`);
            allGames = allGames.concat(await this.extractGamesFromPage(page));
          }
        } catch (paginationError) {
          console.log(`Error handling pagination, continuing with ${allGames.length} games:`, paginationError.message);
        }

        allGames = YSBAScraper.dedupeGames(allGames);

        const processedGames = this.processAllGames(allGames);
        console.log(`✓ Successfully scraped ${allGames.length} games for ${division}/${tier}`);
        
        return processedGames;

      } finally {
        await page.close();
      }
    }, `scrape-schedule-${division}-${tier}`);
  }

  // Click the numeric pager link for pageNumber inside #dgGrid and wait for
  // the resulting postback navigation. Returns false when the link doesn't
  // exist (i.e. we're past the last page).
  async gotoSchedulePage(page, pageNumber) {
    const handle = await page.evaluateHandle((target) => {
      const table = document.getElementById('dgGrid');
      if (!table) return null;
      const links = Array.from(table.querySelectorAll('a[href*="__doPostBack"]'));
      return links.find(a => a.textContent.trim() === String(target)) || null;
    }, pageNumber);

    const element = handle.asElement();
    if (!element) {
      await handle.dispose();
      return false;
    }

    console.log(`Found page ${pageNumber}, clicking to load more games...`);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
      element.click()
    ]);
    await page.waitForSelector('#dgGrid', { timeout: 10000 });
    return true;
  }

  async extractGamesFromPage(page) {
    const rawGames = await page.evaluate(() => {
      const games = [];
      
      const table = document.getElementById('dgGrid');
      if (!table) return games;

      const rows = Array.from(table.querySelectorAll('tr'));
      
      rows.forEach((row, index) => {
        if (index === 0) return; // Skip header
        
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length < 8) return;

        try {
          const dateText = cells[0] ? cells[0].textContent.trim() : '';
          const timeText = cells[1] ? cells[1].textContent.trim() : '';
          const division = cells[2] ? cells[2].textContent.trim() : '';
          const gameTier = cells[3] ? cells[3].textContent.trim() : '';
          const awayTeamText = cells[4] ? cells[4].textContent.trim() : '';
          const homeTeamText = cells[5] ? cells[5].textContent.trim() : '';
          const location = cells[6] ? cells[6].textContent.trim() : '';
          const scoreText = cells[7] ? cells[7].textContent.trim() : '';

          const extractTeamCodeAndName = (teamText) => {
            const match = teamText.match(/^\((\d+)\)\s+(.+)$/);
            if (match) {
              return { code: match[1], name: match[2] };
            }
            return { code: teamText, name: teamText };
          };

          const awayTeamInfo = extractTeamCodeAndName(awayTeamText);
          const homeTeamInfo = extractTeamCodeAndName(homeTeamText);

          if (!dateText || !awayTeamInfo.code || !homeTeamInfo.code) return;

          let homeScore = null;
          let awayScore = null;
          let isCompleted = false;
          
          if (scoreText && scoreText !== '-' && scoreText.includes('-')) {
            const scoreParts = scoreText.split('-');
            if (scoreParts.length === 2) {
              awayScore = parseInt(scoreParts[0].trim());
              homeScore = parseInt(scoreParts[1].trim());
              isCompleted = !isNaN(homeScore) && !isNaN(awayScore);
            }
          }

          games.push({
            date: null, // attached in Node by attachGameDates()
            dateText: dateText,
            time: timeText,
            homeTeam: homeTeamInfo.name,
            homeTeamCode: homeTeamInfo.code,
            awayTeam: awayTeamInfo.name,
            awayTeamCode: awayTeamInfo.code,
            homeScore: homeScore,
            awayScore: awayScore,
            location: location,
            division: division,
            gameTier: gameTier,
            isCompleted: isCompleted,
            scoreText: scoreText
          });

        } catch (error) {
          console.warn('Error parsing game row:', error);
        }
      });

      return games;
    });

    // Timestamps are anchored to America/Toronto here in Node —
    // buildEasternDate doesn't exist inside the browser context.
    return YSBAScraper.attachGameDates(rawGames);
  }

  processAllGames(allGames) {
    const now = new Date();
    const teamGames = {};

    allGames.forEach(game => {
      const homeCode = game.homeTeamCode;
      const awayCode = game.awayTeamCode;

      if (!teamGames[homeCode]) teamGames[homeCode] = [];
      teamGames[homeCode].push({
        ...game,
        opponent: game.awayTeam,
        opponentCode: game.awayTeamCode,
        isHome: true,
        teamScore: game.homeScore,
        opponentScore: game.awayScore
      });

      if (!teamGames[awayCode]) teamGames[awayCode] = [];
      teamGames[awayCode].push({
        ...game,
        opponent: game.homeTeam,
        opponentCode: game.homeTeamCode,
        isHome: false,
        teamScore: game.awayScore,
        opponentScore: game.homeScore
      });
    });

    Object.keys(teamGames).forEach(teamCode => {
      const games = teamGames[teamCode];
      
      games.sort((a, b) => {
        if (!a.date || !b.date) return 0;
        return new Date(a.date) - new Date(b.date);
      });

      const playedGames = games.filter(game => {
        if (game.isCompleted) return true;
        if (game.date && new Date(game.date) < now) return true;
        return false;
      });
      
      const upcomingGames = games.filter(game => !game.isCompleted && game.date && new Date(game.date) >= now);

      teamGames[teamCode] = {
        allGames: games,
        playedGames: playedGames,
        upcomingGames: upcomingGames,
        teamCode: teamCode,
        lastUpdated: new Date().toISOString()
      };
    });

    return {
      teamGames: teamGames,
      allGames: allGames,
      lastUpdated: new Date().toISOString()
    };
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async cleanup() {
    console.log('Cleaning up scraper resources...');
    
    if (this.browser) {
      try {
        if (this.browser.connected) {
          await this.browser.close();
        }
        console.log('Browser closed successfully');
      } catch (error) {
        console.error('Error closing browser:', error.message);
      } finally {
        this.browser = null;
      }
    }
  }
}

module.exports = YSBAScraper;