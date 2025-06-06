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
    
    // Multi-division caching
    this.cachedDataByDivision = {}; // Cache data per division/tier combination
    this.scrapingPromises = {}; // Track ongoing scraping promises per division
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

  // New multi-division scraping method
  async scrapeStandingsForDivision(division, tier, forceRefresh = false) {
    const cacheKey = `${division}-${tier}`;
    
    try {
      // Check cache first unless forced refresh
      if (!forceRefresh && this.cachedDataByDivision[cacheKey]) {
        const cachedEntry = this.cachedDataByDivision[cacheKey];
        const cacheAge = Date.now() - cachedEntry.timestamp;
        if (cacheAge < this.CACHE_DURATION) {
          console.log(`Returning cached data for ${cacheKey} (age: ${Math.floor(cacheAge / 1000)}s)`);
          return cachedEntry.data;
        } else {
          console.log(`Cache expired for ${cacheKey} (age: ${Math.floor(cacheAge / 1000)}s > ${this.CACHE_DURATION / 1000}s), refreshing...`);
        }
      }

      // Prevent concurrent scraping for the same division/tier
      if (this.scrapingPromises[cacheKey]) {
        console.log(`Scraping already in progress for ${cacheKey}, waiting for completion...`);
        return await this.scrapingPromises[cacheKey];
      }

      console.log(`Starting fresh scrape for ${cacheKey} (forceRefresh: ${forceRefresh})`);
      
      // Get division configuration
      const divisionConfig = config.getDivisionConfig(division, tier);
      if (!divisionConfig) {
        throw new Error(`Invalid division/tier combination: ${division}/${tier}`);
      }

      // Create scraping promise
      this.scrapingPromises[cacheKey] = this.performDivisionScrapeWithCleanup(
        divisionConfig.ysbaParams.division, 
        divisionConfig.ysbaParams.tier, 
        division, 
        tier, 
        forceRefresh
      );
      
      const result = await this.scrapingPromises[cacheKey];
      return result;

    } catch (error) {
      console.error(`Error scraping standings for ${cacheKey}:`, error.message);
      
      // Return cached data if available, even if stale
      if (this.cachedDataByDivision[cacheKey]) {
        console.log(`Returning stale cached data for ${cacheKey} due to scraping error`);
        return this.cachedDataByDivision[cacheKey].data;
      }
      
      throw error;
    } finally {
      delete this.scrapingPromises[cacheKey];
    }
  }

  // Legacy single-division method (for backwards compatibility)
  async scrapeStandings(forceRefresh = false) {
    // Default to 9U-select all-tiers for backwards compatibility
    return await this.scrapeStandingsForDivision('9U-select', 'all-tiers', forceRefresh);
  }

  async performDivisionScrapeWithCleanup(ysbaDiv, ysbaTier, divisionKey, tierKey, forceRefresh) {
    try {
      console.log(`Attempting to scrape YSBA standings for ${divisionKey}/${tierKey} (YSBA: ${ysbaDiv}/${ysbaTier})`);
      const standingsData = await this.performDivisionScrape(ysbaDiv, ysbaTier, divisionKey);
      
      // Cache the standings data per division/tier
      const cacheKey = `${divisionKey}-${tierKey}`;
      this.cachedDataByDivision[cacheKey] = {
        data: standingsData,
        timestamp: Date.now()
      };
      
      // Also cache for legacy compatibility if this is 9U-select
      if (divisionKey === '9U-select' && tierKey === 'all-tiers') {
        this.cachedData = standingsData;
        this.cacheTimestamp = Date.now();
      }
      
      console.log(`Successfully scraped ${standingsData.teams.length} teams for ${divisionKey}/${tierKey}`);
      
      return standingsData;
    } catch (error) {
      console.error(`Error in performDivisionScrapeWithCleanup for ${divisionKey}/${tierKey}:`, error.message);
      throw error;
    }
  }

  // Legacy method for backwards compatibility
  async performScrapeWithCleanup(forceRefresh) {
    return await this.performDivisionScrapeWithCleanup(
      config.DIVISION_VALUE, 
      config.TIER_VALUE, 
      '9U-select', 
      'all-tiers', 
      forceRefresh
    );
  }



  // New multi-division scraping method
  async performDivisionScrape(ysbaDiv, ysbaTier, divisionKey) {
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

      // Select the specified division
      console.log(`Selecting division: ${ysbaDiv}...`);
      await page.select('select[name="ddlDivision"]', ysbaDiv);

      // Wait a bit for the tier dropdown to update
      await this.sleep(1000);

      // Select the specified tier
      console.log(`Selecting tier: ${ysbaTier}...`);
      await page.select('select[name="ddlTier"]', ysbaTier);

      // Click the search button
      console.log('Clicking search button...');
      await page.click('#cmdSearch');

      // Wait for the results table to appear
      await page.waitForSelector('#dgGrid', { timeout: 15000 });

      // Extract the standings data
      console.log('Extracting standings data...');
      
      // Use the proper team name mapping (not division mapping)
      const teamMapping = TEAM_NAME_MAPPING;
      
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
          }

          console.log(`Team: ${teamName}, Code: ${teamCode}, W-L-T: ${wins}-${losses}-${ties}, PCT: ${winPercentage}`);

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

        console.log('=== EXTRACTION COMPLETE ===');
        console.log(`Successfully extracted ${teams.length} teams`);

        return {
          teams,
          lastUpdated: new Date().toISOString(),
          source: 'YSBA Website'
        };
      }, JSON.stringify(teamMapping));

      // Close the page
      await page.close();

      return standingsData;
    } catch (error) {
      console.error('Error in performDivisionScrape:', error);
      await page.close();
      throw error;
    }
  }

  // Legacy method for backwards compatibility
  async performScrape() {
    return await this.performDivisionScrape(config.DIVISION_VALUE, config.TIER_VALUE, '9U-select');
  }

  // New comprehensive schedule scraping method
  async scrapeAllGamesSchedule(forceRefresh = false, division = '9U-select', tier = 'all-tiers') {
    try {
      console.log(`Scraping comprehensive schedule from YSBA schedule page for ${division}/${tier}...`);
      
      // Get division configuration to get the YSBA values
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
      
      // Create a cache key for this specific division/tier combination
      const cacheKey = `schedule-${division}-${tier}`;
      
      // Check cache first (only skip cache if explicitly forced to refresh)
      if (!forceRefresh && this.allGamesCache && this.allGamesCache[cacheKey]) {
        const cacheAge = Date.now() - this.allGamesCache[cacheKey].timestamp;
        const maxAge = 30 * 60 * 1000; // 30 minutes
        
        if (cacheAge < maxAge) {
          console.log(`✓ Returning cached schedule for ${division}/${tier} (age: ${Math.floor(cacheAge / 1000)}s, cache hit)`);
          return this.allGamesCache[cacheKey].data;
        } else {
          console.log(`Cache expired for ${division}/${tier} (age: ${Math.floor(cacheAge / 1000)}s), fetching fresh data...`);
        }
      } else if (forceRefresh) {
        console.log(`Force refresh requested for ${division}/${tier}, bypassing cache...`);
      } else {
        console.log(`No cache available for ${division}/${tier}, fetching fresh data...`);
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

        console.log(`Selecting ${division} division (YSBA value: ${ysbaDiv})...`);
        await page.select('select[name="ddlDivision"]', ysbaDiv);

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

        // Initialize cache object if it doesn't exist
        if (!this.allGamesCache) {
          this.allGamesCache = {};
        }

        // Cache the result for this division/tier
        this.allGamesCache[cacheKey] = {
          data: processedGames,
          timestamp: Date.now()
        };

        console.log(`✓ Successfully scraped ${allGames.length} games for ${division}/${tier}`);
        return processedGames;

      } finally {
        await page.close();
      }

    } catch (error) {
      console.error(`Error scraping schedule for ${division}/${tier}:`, error.message);
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

          // Parse game date and time more accurately
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
              
              // Parse the date first
              let tempDate = new Date(fullDateText);
              if (!isNaN(tempDate.getTime())) {
                // If we have a time, combine it with the date
                if (timeText && timeText !== '-') {
                  try {
                    // Create a date string that includes both date and time
                    // Format: "Jun 6, 2025 6:00 PM" -> proper date object
                    const fullDateTimeText = `${fullDateText} ${timeText}`;
                    gameDate = new Date(fullDateTimeText);
                    
                    // If parsing with time failed, fall back to date only
                    if (isNaN(gameDate.getTime())) {
                      gameDate = tempDate;
                    }
                  } catch (e) {
                    gameDate = tempDate; // Fall back to date only
                  }
                } else {
                  gameDate = tempDate;
                }
              }
              
              if (isNaN(gameDate.getTime())) {
                console.warn('Could not parse date:', dateText, timeText);
                gameDate = null;
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

  async scrapeTeamScheduleForDivision(teamCode, division = '9U-select', tier = 'all-tiers') {
    try {
      console.log(`Getting schedule for team ${teamCode} from ${division}/${tier} schedule...`);
      
      // Use the division-aware comprehensive schedule method
      const allScheduleData = await this.scrapeAllGamesSchedule(false, division, tier); // false = use cache if available
      
      if (allScheduleData.teamGames[teamCode]) {
        const cacheKey = `schedule-${division}-${tier}`;
        const fromCache = this.allGamesCache && this.allGamesCache[cacheKey];
        console.log(`✓ Schedule data found for team ${teamCode} in ${division}/${tier} (from cache: ${!!fromCache})`);
        return allScheduleData.teamGames[teamCode];
      } else {
        console.warn(`No schedule data found for team ${teamCode} in ${division}/${tier}`);
        return {
          allGames: [],
          playedGames: [],
          upcomingGames: [],
          teamCode: teamCode,
          lastUpdated: new Date().toISOString(),
          error: `No schedule data found for this team in ${division}/${tier}`
        };
      }

    } catch (error) {
      console.error(`Error getting schedule for team ${teamCode} in ${division}/${tier}:`, error.message);
      
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

  async scrapeTeamSchedule(teamCode) {
    try {
      console.log(`Getting schedule for team ${teamCode} from comprehensive schedule...`);
      
      // Use the new comprehensive schedule method with explicit cache preference
      // Default to 9U-select for backward compatibility
      const allScheduleData = await this.scrapeAllGamesSchedule(false, '9U-select', 'all-tiers'); // false = use cache if available
      
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