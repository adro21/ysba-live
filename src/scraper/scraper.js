const puppeteer = require('puppeteer');
const config = require('../../config');

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
        resolve(result);
      } catch (error) {
        console.error(`❌ Browser operation failed: ${operationName}:`, error.message);
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
        await page.goto(config.YSBA_URL, { 
          waitUntil: isProduction ? 'domcontentloaded' : 'networkidle2',
          timeout: config.REQUEST_TIMEOUT 
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

            // Extract team code from link
            const firstCellLink = cells[0].querySelector('a');
            const secondCellLink = cells[1] ? cells[1].querySelector('a') : null;
            let teamCode = null;
            
            if (firstCellLink) {
              const href = firstCellLink.getAttribute('href') || '';
              const codeMatch = href.match(/tmcd=(\d+)/);
              teamCode = codeMatch ? codeMatch[1] : null;
            }
            
            if (!teamCode && secondCellLink) {
              const href = secondCellLink.getAttribute('href') || '';
              const codeMatch = href.match(/tmcd=(\d+)/);
              teamCode = codeMatch ? codeMatch[1] : null;
            }
            
            if (!teamCode) {
              for (let i = 0; i < Math.min(cells.length, 3); i++) {
                const cellText = cells[i].textContent.trim();
                const textCodeMatch = cellText.match(/\b(5\d{5})\b/);
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
        const navigationTimeout = isProduction ? 45000 : config.REQUEST_TIMEOUT;
        
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

        // Check for pagination
        try {
          const page2Link = await page.$('a[href*="dgGrid$ctl104$ctl02"]');
          
          if (page2Link) {
            console.log('Found page 2, clicking to load more games...');
            await page2Link.click();
            await page.waitForSelector('#dgGrid', { timeout: 10000 });
            await this.sleep(isProduction ? 1000 : 2000);
            
            console.log('Extracting games from page 2...');
            const page2Games = await this.extractGamesFromPage(page);
            allGames = allGames.concat(page2Games);
          }
        } catch (paginationError) {
          console.log('Error handling pagination, continuing with page 1 data:', paginationError.message);
        }

        const processedGames = this.processAllGames(allGames);
        console.log(`✓ Successfully scraped ${allGames.length} games for ${division}/${tier}`);
        
        return processedGames;

      } finally {
        await page.close();
      }
    }, `scrape-schedule-${division}-${tier}`);
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

          let gameDate = null;
          try {
            if (dateText && dateText !== '-') {
              const currentYear = new Date().getFullYear();
              let fullDateText = dateText;
              
              if (!dateText.includes(currentYear.toString()) && !dateText.includes((currentYear+1).toString())) {
                fullDateText = `${dateText}, ${currentYear}`;
              }
              
              let tempDate = new Date(fullDateText);
              if (!isNaN(tempDate.getTime())) {
                if (timeText && timeText !== '-') {
                  try {
                    const fullDateTimeText = `${fullDateText} ${timeText}`;
                    gameDate = new Date(fullDateTimeText);
                    
                    if (isNaN(gameDate.getTime())) {
                      gameDate = tempDate;
                    }
                  } catch (e) {
                    gameDate = tempDate;
                  }
                } else {
                  gameDate = tempDate;
                }
              }
            }
          } catch (e) {
            console.warn('Error parsing date:', dateText, e.message);
          }

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