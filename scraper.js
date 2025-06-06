const puppeteer = require('puppeteer');
const config = require('./config');

// Team name mapping for 9U Select teams based on YSBA team listings
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
  '518965': 'Vaughan Vikings 8U DS', // Sometimes 8U teams play up
  '518966': 'Vaughan Vikings 9U DS'
};



class YSBAScraper {
  constructor() {
    this.cachedData = null;
    this.cacheTimestamp = null;
    this.CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
    this.allGamesCache = null; // For comprehensive schedule cache
    this.browser = null;
    this.isScraping = false; // Add flag to prevent concurrent scraping
    this.scrapePromise = null; // Store ongoing scrape promise
  }

  async initBrowser() {
    if (!this.browser || !this.browser.connected) {
      console.log('Creating new browser instance...');
      
      // Configure browser options for cloud environment
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

      // Add additional args from environment variable if set
      if (process.env.PUPPETEER_ARGS) {
        const envArgs = process.env.PUPPETEER_ARGS.split(',');
        browserOptions.args.push(...envArgs);
      }

      console.log('Browser options:', browserOptions);
      this.browser = await puppeteer.launch(browserOptions);
    }
    return this.browser;
  }

  async scrapeStandings(forceRefresh = false) {
    try {
      // Check cache first unless forced refresh
      if (!forceRefresh && this.cachedData && this.cacheTimestamp) {
        const cacheAge = Date.now() - this.cacheTimestamp;
        if (cacheAge < this.CACHE_DURATION) {
          console.log(`Returning cached data (age: ${Math.floor(cacheAge / 1000)}s)`);
          return this.cachedData;
        } else {
          console.log(`Cache expired (age: ${Math.floor(cacheAge / 1000)}s > ${this.CACHE_DURATION / 1000}s), refreshing...`);
        }
      }

      // Prevent concurrent scraping
      if (this.isScraping && this.scrapePromise) {
        console.log('Scraping already in progress, waiting for completion...');
        return await this.scrapePromise;
      }

      // Set scraping flag and create promise
      this.isScraping = true;
      console.log(`Starting fresh scrape (forceRefresh: ${forceRefresh})`);
      this.scrapePromise = this.performScrapeWithCleanup(forceRefresh);
      
      return await this.scrapePromise;

    } catch (error) {
      console.error('Error scraping standings:', error.message);
      
      // Return cached data if available, even if stale
      if (this.cachedData) {
        console.log('Returning stale cached data due to scraping error');
        return this.cachedData;
      }
      
      throw error;
    } finally {
      this.isScraping = false;
      this.scrapePromise = null;
    }
  }

  async performScrapeWithCleanup(forceRefresh) {
    try {
      console.log(`Attempting to scrape YSBA standings (attempt 1)`);
      const standingsData = await this.performScrape();
      
      // Cache the standings data
      this.cachedData = standingsData;
      this.cacheTimestamp = Date.now();
      
      // Clear old schedule cache when refreshing standings
      if (forceRefresh) {
        console.log('Clearing schedule cache due to forced refresh...');
        this.allGamesCache = null; // Clear comprehensive cache
      }
      
      // Cache comprehensive schedule in background (used by modal for instant loading)
      // If this was a forced refresh, also force refresh the schedule cache
      console.log(`Starting background comprehensive schedule caching (forceRefresh: ${forceRefresh})...`);
      this.scrapeAllGamesSchedule(forceRefresh).then(() => {
        console.log('✓ Background comprehensive schedule caching completed');
      }).catch(err => {
        console.log('✗ Background comprehensive schedule cache failed:', err.message);
      });
      
      console.log(`Successfully scraped ${standingsData.teams.length} teams`);
      
      return standingsData;
    } catch (error) {
      console.error('Error in performScrapeWithCleanup:', error.message);
      throw error;
    }
  }



  async performScrape() {
    const browser = await this.initBrowser();
    const page = await browser.newPage();

    try {
      // Set user agent and viewport for better stealth
      await page.setUserAgent(config.USER_AGENT);
      await page.setViewport({ width: 1366, height: 768 });

      // Navigate to the standings page
      console.log('Navigating to YSBA standings page...');
      await page.goto(config.YSBA_URL, { 
        waitUntil: 'networkidle2',
        timeout: config.REQUEST_TIMEOUT 
      });

      // Wait for the division dropdown to be available
      await page.waitForSelector('select[name="ddlDivision"]', { timeout: 10000 });

      // Select the 9U Select division
      console.log('Selecting 9U Select division...');
      await page.select('select[name="ddlDivision"]', config.DIVISION_VALUE);

      // Wait a bit for the tier dropdown to update
      await this.sleep(1000);

      // Select All Tiers
      console.log('Selecting All Tiers...');
      await page.select('select[name="ddlTier"]', config.TIER_VALUE);

      // Click the search button
      console.log('Clicking search button...');
      await page.click('#cmdSearch');

      // Wait for the results table to appear
      await page.waitForSelector('#dgGrid', { timeout: 15000 });

      // Extract the standings data
      console.log('Extracting standings data...');
      const standingsData = await page.evaluate((teamMappingJson) => {
        // Parse the team mapping JSON string
        const teamMapping = JSON.parse(teamMappingJson);
        
        const table = document.getElementById('dgGrid');
        if (!table) {
          throw new Error('Standings table not found');
        }

        const rows = Array.from(table.querySelectorAll('tr'));
        if (rows.length === 0) {
          throw new Error('No data rows found in standings table');
        }

        console.log('=== TABLE ANALYSIS ===');
        console.log('Total rows found:', rows.length);

        // Find ALL header rows and log them
        rows.forEach((row, index) => {
          const cells = Array.from(row.querySelectorAll('th, td'));
          const cellTexts = cells.map(cell => cell.textContent.trim());
          
          // Check if this looks like a header row
          const hasHeaders = cellTexts.some(text => 
            text.toLowerCase().includes('team') ||
            text.toLowerCase().includes('name') ||
            text.toLowerCase().includes('gp') ||
            text.toLowerCase().includes('wins') ||
            text.toLowerCase().includes('w') ||
            text.toLowerCase().includes('pts')
          );
          
          if (hasHeaders || index < 3) {
            console.log(`Row ${index} (${hasHeaders ? 'HEADER' : 'potential header'}):`, cellTexts);
          }
        });

        // Find the actual header row
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

        const headers = Array.from(headerRow.querySelectorAll('th, td')).map(th => 
          th.textContent.trim()
        );

        console.log('=== FINAL HEADERS ===');
        console.log('Headers:', headers);

        // Extract data rows (skip header rows)
        const dataRows = rows.filter(row => {
          const firstCell = row.querySelector('td');
          if (!firstCell) return false;
          
          const cellText = firstCell.textContent.trim();
          // Skip if it's a header or empty
          return cellText && !cellText.toLowerCase().includes('team') && 
                 !cellText.toLowerCase().includes('name') &&
                 !cellText.toLowerCase().includes('standing');
        });

        console.log('=== DATA ROWS ===');
        console.log(`Found ${dataRows.length} data rows`);

        const teams = dataRows.map((row, index) => {
          const cells = Array.from(row.querySelectorAll('td'));
          const cellTexts = cells.map(cell => cell.textContent.trim());
          
          console.log(`Row ${index + 1}:`, cellTexts);

          if (cells.length < 7) {
            console.log(`Skipping row ${index + 1} - insufficient cells (${cells.length})`);
            return null;
          }

          // Extract team code from the link in any cell
          const firstCellLink = cells[0].querySelector('a');
          const secondCellLink = cells[1] ? cells[1].querySelector('a') : null;
          let teamCode = null;
          
          // Try first cell link
          if (firstCellLink) {
            const href = firstCellLink.getAttribute('href') || '';
            console.log(`First cell link href: ${href}`);
            const codeMatch = href.match(/tmcd=(\d+)/);
            teamCode = codeMatch ? codeMatch[1] : null;
          }
          
          // Try second cell link if first didn't work
          if (!teamCode && secondCellLink) {
            const href = secondCellLink.getAttribute('href') || '';
            console.log(`Second cell link href: ${href}`);
            const codeMatch = href.match(/tmcd=(\d+)/);
            teamCode = codeMatch ? codeMatch[1] : null;
          }
          
          // If still no team code, try other patterns or extract from text
          if (!teamCode) {
            // Check if any cell contains a team code pattern
            for (let i = 0; i < Math.min(cells.length, 3); i++) {
              const cellText = cells[i].textContent.trim();
              // Look for 6-digit team codes in text
              const textCodeMatch = cellText.match(/\b(5\d{5})\b/);
              if (textCodeMatch) {
                teamCode = textCodeMatch[1];
                console.log(`Found team code in cell ${i} text: ${teamCode}`);
                break;
              }
            }
          }

          // Get team name - prefer mapping over cell text
          let teamName = teamCode && teamMapping[teamCode] ? teamMapping[teamCode] : null;
          
          if (!teamName) {
            // Fallback to cell text
            teamName = cells[1] ? cells[1].textContent.trim() : 
                      cells[0] ? cells[0].textContent.trim() : 
                      `Team ${teamCode || index + 1}`;
          }

          // Parse numerical values (GP, W, L, T, Pts, RF, RA)
          const cellValues = cellTexts.slice(2, 9).map(text => {
            const num = parseInt(text);
            return isNaN(num) ? 0 : num;
          });

          const gamesPlayed = cellValues[0] || 0;
          const wins = parseInt(cellValues[1]) || 0;
          const losses = parseInt(cellValues[2]) || 0;
          const ties = parseInt(cellValues[3]) || 0;
          
          // Calculate win percentage for leagues that allow ties
          // Formula: PCT = (Wins + 0.5 * Ties) / Games Played
          let winPercentage = '.000';
          const totalGames = wins + losses + ties;
          
          if (totalGames > 0) {
            // Use total games (W+L+T) as denominator since GP might be 0
            // Account for ties: each tie counts as 0.5 wins
            const percentage = ((wins + 0.5 * ties) / totalGames) * 100;
            winPercentage = (percentage / 100).toFixed(3);
          } else if (gamesPlayed > 0) {
            // Fallback to GP if available
            const percentage = ((wins + 0.5 * ties) / gamesPlayed) * 100;
            winPercentage = (percentage / 100).toFixed(3);
          }

          return {
            position: index + 1,
            team: teamName,
            teamCode: teamCode,
            gamesPlayed: gamesPlayed,
            wins: wins,
            losses: losses,
            ties: ties,
            points: parseInt(cellValues[4]) || 0,
            runsFor: parseInt(cellValues[5]) || 0,
            runsAgainst: parseInt(cellValues[6]) || 0,
            winPercentage: winPercentage
          };
        }).filter(team => team && team.team);

        console.log('=== FINAL RESULTS ===');
        teams.slice(0, 3).forEach(team => {
          console.log(`${team.position}. ${team.team} (${team.teamCode}) - ${team.wins}W-${team.losses}L-${team.ties}T, Win%: ${team.winPercentage}`);
        });

        return {
          teams,
          lastUpdated: new Date().toISOString(),
          division: '9U Select',
          tier: 'All Tiers'
        };
      }, JSON.stringify(TEAM_NAME_MAPPING));

      return standingsData;

    } finally {
      await page.close();
    }
  }

  // New comprehensive schedule scraping method
  async scrapeAllGamesSchedule(forceRefresh = false) {
    try {
      console.log('Scraping comprehensive schedule from YSBA schedule page...');
      
      // Check cache first (only skip cache if explicitly forced to refresh)
      if (!forceRefresh && this.allGamesCache) {
        const cacheAge = Date.now() - this.allGamesCache.timestamp;
        const maxAge = 30 * 60 * 1000; // 30 minutes
        
        if (cacheAge < maxAge) {
          console.log(`✓ Returning cached all-games schedule (age: ${Math.floor(cacheAge / 1000)}s, cache hit)`);
          return this.allGamesCache.data;
        } else {
          console.log(`Cache expired (age: ${Math.floor(cacheAge / 1000)}s), fetching fresh data...`);
        }
      } else if (forceRefresh) {
        console.log(`Force refresh requested, bypassing cache...`);
      } else {
        console.log(`No cache available, fetching fresh data...`);
      }

      const browser = await this.initBrowser();
      const page = await browser.newPage();

      try {
        // Set user agent and viewport
        await page.setUserAgent(config.USER_AGENT);
        await page.setViewport({ width: 1366, height: 768 });

        console.log('Navigating to YSBA schedule page...');
        await page.goto('https://www.yorksimcoebaseball.com/Club/xScheduleMM.aspx', { 
          waitUntil: 'networkidle2',
          timeout: config.REQUEST_TIMEOUT 
        });

        // Wait for dropdowns to be available
        await page.waitForSelector('select[name="ddlDivision"]', { timeout: 10000 });

        console.log('Selecting 9U Select division...');
        await page.select('select[name="ddlDivision"]', '13'); // [Sel] 9U

        await this.sleep(1000);

        console.log('Selecting Regular category...');
        await page.select('select[name="ddlCategory"]', '1'); // Regular

        await this.sleep(1000);

        // Click search to load the schedule
        console.log('Clicking search button...');
        await page.click('#cmdSearch');

        // Wait for results table
        await page.waitForSelector('#dgGrid', { timeout: 15000 });

        // Extract all games from page 1
        console.log('Extracting games from page 1...');
        let allGames = await this.extractGamesFromPage(page);

        // Check for pagination and get page 2
        try {
          console.log('Looking for page 2 link...');
          const page2Link = await page.$('a[href*="dgGrid$ctl104$ctl02"]');
          
          if (page2Link) {
            console.log('Found page 2, clicking to load more games...');
            await page2Link.click();
            await page.waitForSelector('#dgGrid', { timeout: 10000 });
            await this.sleep(2000); // Wait for page to fully load
            
            console.log('Extracting games from page 2...');
            const page2Games = await this.extractGamesFromPage(page);
            allGames = allGames.concat(page2Games);
            console.log(`Total games extracted: ${allGames.length}`);
          } else {
            console.log('No page 2 found, continuing with page 1 data');
          }
        } catch (paginationError) {
          console.log('Error handling pagination, continuing with page 1 data:', paginationError.message);
        }

        // Process and organize games
        const processedGames = this.processAllGames(allGames);

        // Cache the result
        this.allGamesCache = {
          data: processedGames,
          timestamp: Date.now()
        };

        console.log(`✓ Successfully scraped ${allGames.length} total games from schedule page`);
        return processedGames;

      } finally {
        await page.close();
      }

    } catch (error) {
      console.error('Error scraping comprehensive schedule:', error.message);
      throw error;
    }
  }

  async extractGamesFromPage(page) {
    return await page.evaluate(() => {
      const games = [];
      
      const table = document.getElementById('dgGrid');
      if (!table) return games;

      const rows = Array.from(table.querySelectorAll('tr'));
      
      rows.forEach((row, index) => {
        if (index === 0) return; // Skip header
        
        const cells = Array.from(row.querySelectorAll('td'));
        if (cells.length < 8) return;

        try {
          // Parse the schedule row format (based on real table structure):
          // Date | Time | Division | Game Tier | Team(visitor) | Team(home) | Location | Result | Empty
          const dateText = cells[0] ? cells[0].textContent.trim() : '';
          const timeText = cells[1] ? cells[1].textContent.trim() : '';
          const division = cells[2] ? cells[2].textContent.trim() : '';
          const gameTier = cells[3] ? cells[3].textContent.trim() : '';
          const awayTeamText = cells[4] ? cells[4].textContent.trim() : '';
          const homeTeamText = cells[5] ? cells[5].textContent.trim() : '';
          const location = cells[6] ? cells[6].textContent.trim() : '';
          const scoreText = cells[7] ? cells[7].textContent.trim() : '';

          // Extract team codes from the format "(511108) Bradford Tigers 9U DS"
          const extractTeamCodeAndName = (teamText) => {
            const match = teamText.match(/^\((\d+)\)\s+(.+)$/);
            if (match) {
              return { code: match[1], name: match[2] };
            }
            return { code: teamText, name: teamText };
          };

          const awayTeamInfo = extractTeamCodeAndName(awayTeamText);
          const homeTeamInfo = extractTeamCodeAndName(homeTeamText);

          // Skip if missing essential data
          if (!dateText || !awayTeamInfo.code || !homeTeamInfo.code) return;

          // Parse date and time
          let gameDate = null;
          try {
            if (dateText && dateText !== '-') {
              // Handle formats like "Sat, May 3" - need to add year
              const currentYear = new Date().getFullYear();
              let fullDateText = dateText;
              
              // If no year specified, add current year
              if (!dateText.includes(currentYear.toString()) && !dateText.includes((currentYear+1).toString())) {
                fullDateText = `${dateText}, ${currentYear}`;
              }
              
              gameDate = new Date(fullDateText);
              if (isNaN(gameDate.getTime())) {
                console.warn('Could not parse date:', dateText);
              }
            }
          } catch (e) {
            console.warn('Error parsing date:', dateText, e.message);
          }

          // Parse score if game is completed (format: "9-18" where first is away score)
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
            date: gameDate ? gameDate.toISOString() : null,
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
  }

  processAllGames(allGames) {
    const now = new Date();
    const teamGames = {};

    // Group games by team
    allGames.forEach(game => {
      const homeCode = game.homeTeamCode;
      const awayCode = game.awayTeamCode;

      // Add game to home team's list
      if (!teamGames[homeCode]) teamGames[homeCode] = [];
      teamGames[homeCode].push({
        ...game,
        opponent: game.awayTeam,
        opponentCode: game.awayTeamCode,
        isHome: true,
        teamScore: game.homeScore,
        opponentScore: game.awayScore
      });

      // Add game to away team's list
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

    // Sort and categorize games for each team
    Object.keys(teamGames).forEach(teamCode => {
      const games = teamGames[teamCode];
      
      // Sort by date
      games.sort((a, b) => {
        if (!a.date || !b.date) return 0;
        return new Date(a.date) - new Date(b.date);
      });

      // Separate games into categories
      // Played games include both completed games AND games with past dates (regardless of result status)
      const playedGames = games.filter(game => {
        if (game.isCompleted) return true; // Definitely completed
        if (game.date && new Date(game.date) < now) return true; // Past date, should be in played
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

  async scrapeTeamSchedule(teamCode) {
    try {
      console.log(`Getting schedule for team ${teamCode} from comprehensive schedule...`);
      
      // Use the new comprehensive schedule method with explicit cache preference
      const allScheduleData = await this.scrapeAllGamesSchedule(false); // false = use cache if available
      
      if (allScheduleData.teamGames[teamCode]) {
        console.log(`✓ Schedule data found for team ${teamCode} (from cache: ${!!this.allGamesCache})`);
        return allScheduleData.teamGames[teamCode];
      } else {
        console.warn(`No schedule data found for team ${teamCode}`);
        return {
          allGames: [],
          playedGames: [],
          upcomingGames: [],
          teamCode: teamCode,
          lastUpdated: new Date().toISOString(),
          error: 'No schedule data found for this team'
        };
      }

    } catch (error) {
      console.error(`Error getting schedule for team ${teamCode}:`, error.message);
      
      // Return a basic error response instead of throwing
      return {
        allGames: [],
        playedGames: [],
        upcomingGames: [],
        teamCode: teamCode,
        lastUpdated: new Date().toISOString(),
        error: `Unable to load schedule: ${error.message}`
      };
    }
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async cleanup() {
    console.log('Cleaning up scraper resources...');
    
    // Close browser if it exists
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