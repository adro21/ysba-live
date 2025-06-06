// Load environment variables first
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const cron = require('node-cron');
const YSBAScraper = require('./scraper');
const EmailService = require('./email-service');
const config = require('./config');
const fs = require('fs');

const app = express();
const scraper = new YSBAScraper();
const emailService = new EmailService();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: process.env.NODE_ENV === 'production' ? {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: [
        "'self'", 
        "'unsafe-inline'", 
        "https://cdn.jsdelivr.net",
        "https://fonts.googleapis.com",
        "https://cdnjs.cloudflare.com"
      ],
      scriptSrc: [
        "'self'", 
        "https://cdn.jsdelivr.net"
      ],
      fontSrc: [
        "'self'", 
        "https://cdn.jsdelivr.net",
        "https://fonts.gstatic.com",
        "https://cdnjs.cloudflare.com",
        "data:"
      ],
      imgSrc: [
        "'self'", 
        "data:", 
        "https:"
      ],
      connectSrc: [
        "'self'",
        "https://cdn.jsdelivr.net",
        "https://fonts.googleapis.com",
        "https://fonts.gstatic.com",
        "https://cdnjs.cloudflare.com"
      ],
    },
  } : false, // Disable CSP in development for mobile testing
}));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : true,
  credentials: true
}));

app.use(express.json());

// Add cache control headers
app.use((req, res, next) => {
  const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1';
  
  // Don't cache main page or API responses
  if (req.path === '/' || req.path.endsWith('.html') || req.path.startsWith('/api/')) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  } else if (req.path.endsWith('.css') || req.path.endsWith('.js') || 
             req.path.includes('/icons/') || req.path.includes('favicon')) {
    if (isLocalhost) {
      // In development, don't cache CSS/JS/icons files at all
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    } else {
      // In production, force revalidation for CSS/JS/icons files to ensure fresh content
      res.set('Cache-Control', 'no-cache, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('ETag', Date.now().toString()); // Force different ETag each time
    }
  }
  next();
});

// Serve static files with normal browser caching
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    // Don't cache HTML files
    if (filePath.endsWith('.html')) {
      res.set({
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
    }
    // Allow normal caching for other static assets
  }
}));

// API Routes (must come before dynamic routes)

// Known working division/tier combinations (to avoid unnecessary scraping)
const KNOWN_WORKING_DIVISIONS = {
  // Select divisions (we know these work)
  '9U-select': ['all-tiers'],
  '11U-select': ['all-tiers'], 
  '13U-select': ['all-tiers'],
  '15U-select': ['all-tiers'],
  
  // Rep divisions that we've seen have teams in the logs
  '8U-rep': ['all-tiers', 'tier-3'], // Had 15+ teams in logs
  '9U-rep': ['tier-3'], // Had teams
  '10U-rep': ['all-tiers'], // Had 19 teams  
  '18U-rep': ['all-tiers'], // Had 19 teams
  
  // Add more as we discover them - this avoids scraping everything on startup
};

// Get all available divisions (with optional filtering for non-empty ones)
app.get('/api/divisions', async (req, res) => {
  try {
    const filterEmpty = req.query.filterEmpty === 'true';
    
    if (filterEmpty) {
      // Use smart filtering - check cache first, then known working divisions, avoid unnecessary scrapes
      const filteredDivisions = {};
      
      for (const [divisionKey, division] of Object.entries(config.DIVISIONS)) {
        const filteredTiers = {};
        
        for (const [tierKey, tier] of Object.entries(division.tiers)) {
          const cacheKey = `${divisionKey}-${tierKey}`;
          let includeThisTier = false;
          
          // 1. Check if already cached (fast)
          if (scraper.cachedDataByDivision && scraper.cachedDataByDivision[cacheKey]) {
            const cachedData = scraper.cachedDataByDivision[cacheKey];
            includeThisTier = cachedData.data?.teams?.length > 0;
          }
          // 2. Check if it's in our known working list (fast)
          else if (KNOWN_WORKING_DIVISIONS[divisionKey]?.includes(tierKey)) {
            includeThisTier = true;
          }
          // 3. For unknown combinations, include them but let them be discovered lazily
          //    This prevents the long startup delay
          else {
            // Skip unknown combinations for now - they'll be discovered when users click them
            includeThisTier = false;
            console.log(`Skipping unknown division/tier combination: ${divisionKey}/${tierKey} (will be discovered on-demand)`);
          }
          
          if (includeThisTier) {
            filteredTiers[tierKey] = tier;
          }
        }
        
        // Only include the division if it has at least one tier with teams
        if (Object.keys(filteredTiers).length > 0) {
          filteredDivisions[divisionKey] = {
            ...division,
            tiers: filteredTiers
          };
        }
      }
      
      console.log(`Filtered divisions returned: ${Object.keys(filteredDivisions).length} divisions with teams`);
      
      res.json({
        success: true,
        divisions: filteredDivisions,
        filtered: true,
        note: 'Some divisions may be discovered on-demand to avoid startup delays'
      });
    } else {
      // Return all divisions without filtering
      res.json({
        success: true,
        divisions: config.DIVISIONS,
        filtered: false
      });
    }
  } catch (error) {
    console.error('Error fetching divisions:', error);
    res.status(500).json({
      error: 'Failed to fetch divisions',
      message: error.message
    });
  }
});

// Get standings for a specific division and tier
app.get('/api/standings', async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const division = req.query.division || '9U-select'; // Default fallback
    const tier = req.query.tier || 'all-tiers';
    
    console.log(`API request for standings - Division: ${division}, Tier: ${tier} (force refresh: ${forceRefresh})`);
    
    // Get division configuration
    const divisionConfig = config.getDivisionConfig(division);
    if (!divisionConfig) {
      return res.status(400).json({
        error: 'Invalid division',
        message: `Division '${division}' is not supported.`
      });
    }
    
    const tierConfig = divisionConfig.tiers[tier];
    if (!tierConfig) {
      return res.status(400).json({
        error: 'Invalid tier',
        message: `Tier '${tier}' is not supported for division '${division}'.`
      });
    }
    
    // Check if scraper has cached data for this division/tier and the cache is fresh
    const cacheKey = `${division}-${tier}`;
    if (!forceRefresh && scraper.cachedDataByDivision && scraper.cachedDataByDivision[cacheKey]) {
      const cachedEntry = scraper.cachedDataByDivision[cacheKey];
      const cacheAge = Date.now() - cachedEntry.timestamp;
      if (cacheAge < config.CACHE_DURATION) {
        console.log(`Returning cached data for ${cacheKey} (age: ${Math.floor(cacheAge / 1000)}s)`);
        return res.json({
          success: true,
          data: cachedEntry.data,
          division: division,
          tier: tier,
          cached: true,
          cacheAge: Math.floor(cacheAge / 1000),
          cacheDuration: config.CACHE_DURATION / 1000
        });
      }
    }
    
    // Proceed with scraping for this specific division/tier
    const data = await scraper.scrapeStandingsForDivision(division, tier, forceRefresh);
    
    if (!data) {
      return res.status(503).json({
        error: 'Standings data not available',
        message: `Unable to fetch standings for ${divisionConfig.displayName} ${tierConfig.displayName} at this time. Please try again later.`
      });
    }

    // Auto-discover working division/tier combinations for future optimization
    if (data.teams && data.teams.length > 0) {
      if (!KNOWN_WORKING_DIVISIONS[division]) {
        KNOWN_WORKING_DIVISIONS[division] = [];
      }
      if (!KNOWN_WORKING_DIVISIONS[division].includes(tier)) {
        KNOWN_WORKING_DIVISIONS[division].push(tier);
        console.log(`✅ Auto-discovered working combination: ${division}/${tier} (${data.teams.length} teams)`);
      }
    }

    res.json({
      success: true,
      data: data,
      division: division,
      tier: tier,
      cached: false,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error fetching standings:', error);
    res.status(500).json({
      error: 'Failed to fetch standings',
      message: error.message
    });
  }
});

app.get('/api/status', (req, res) => {
  const now = Date.now();
  const lastScrape = scraper.cacheTimestamp;
  const nextScrapeIn = lastScrape ? 
    Math.max(0, (config.SCRAPE_INTERVAL_MINUTES * 60 * 1000) - (now - lastScrape)) : 0;

  // Count cached schedules (legacy individual team cache)
  const cachedScheduleCount = scraper.teamScheduleCache ? Object.keys(scraper.teamScheduleCache).length : 0;
  
  // Get comprehensive schedule status
  const allGamesCache = scraper.allGamesCache;
  const comprehensiveScheduleStatus = allGamesCache ? {
    isActive: true,
    totalGames: allGamesCache.data?.games?.length || 0,
    lastUpdated: allGamesCache.timestamp ? new Date(allGamesCache.timestamp).toISOString() : null,
    cacheAge: allGamesCache.timestamp ? Math.round((now - allGamesCache.timestamp) / 1000) : null
  } : {
    isActive: false,
    totalGames: 0,
    lastUpdated: null,
    cacheAge: null
  };

  // Multi-division cache status
  const divisionCacheStatus = {};
  if (scraper.cachedDataByDivision) {
    Object.entries(scraper.cachedDataByDivision).forEach(([cacheKey, cachedEntry]) => {
      const cacheAge = Math.round((now - cachedEntry.timestamp) / 1000);
      divisionCacheStatus[cacheKey] = {
        teamCount: cachedEntry.data?.teams?.length || 0,
        lastUpdated: new Date(cachedEntry.timestamp).toISOString(),
        cacheAge: cacheAge
      };
    });
  }

  res.json({
    status: 'online',
    lastScrapeTime: lastScrape ? new Date(lastScrape).toISOString() : null,
    nextScrapeIn: Math.round(nextScrapeIn / 1000),
    cacheAge: lastScrape ? Math.round((now - lastScrape) / 1000) : null,
    comprehensiveSchedule: comprehensiveScheduleStatus,
    scheduleCacheStatus: {
      isScheduleCachingInProgress: scraper.isScheduleCachingInProgress || false,
      cachedTeamCount: cachedScheduleCount,
      totalTeamCount: scraper.cachedData?.teams?.length || 0
    },
    multiDivisionCache: {
      divisionsCount: Object.keys(divisionCacheStatus).length,
      divisions: divisionCacheStatus
    }
  });
});

// Get team schedule
app.get('/api/team/:teamCode/schedule', async (req, res) => {
    try {
        const { teamCode } = req.params;
        console.log(`API request for team ${teamCode} schedule`);

        // Validate team code
        if (!teamCode || teamCode.trim() === '') {
            return res.status(400).json({
                success: false,
                message: 'Team code is required'
            });
        }

        const scheduleData = await scraper.scrapeTeamSchedule(teamCode);
        
        res.json({
            success: true,
            data: scheduleData
        });

    } catch (error) {
        console.error(`Error fetching team schedule for ${req.params.teamCode}:`, error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch team schedule',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
            teamCode: req.params.teamCode
        });
    }
});

// Get comprehensive schedule for all teams
app.get('/api/schedule/all', async (req, res) => {
    try {
        console.log('API request for comprehensive schedule');
        
        const forceRefresh = req.query.refresh === 'true';
        const scheduleData = await scraper.scrapeAllGamesSchedule(forceRefresh);
        
        res.json({
            success: true,
            data: scheduleData
        });

    } catch (error) {
        console.error('Error fetching comprehensive schedule:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch comprehensive schedule',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Subscribe to email notifications
app.post('/api/subscribe', async (req, res) => {
    try {
        const { email, name } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const result = await emailService.addSubscriber(email, name);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Subscription error:', error);
        res.status(500).json({ error: 'Failed to subscribe' });
    }
});

// Subscribe with team preference (legacy endpoint - now simplified)
app.post('/api/subscribe-team', async (req, res) => {
    try {
        const { email, name } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const result = await emailService.addSubscriber(email, name);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Subscription error:', error);
        res.status(500).json({ error: 'Failed to subscribe' });
    }
});

// Get subscriber info by token
app.get('/api/subscriber/:token', async (req, res) => {
    try {
        const { token } = req.params;

        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }

        const subscriber = await emailService.getSubscriberById(token);
        
        if (!subscriber) {
            return res.status(404).json({ error: 'Subscriber not found' });
        }

        // Return subscriber info (teamFilter removed from response as it's always 'all')
        res.json({
            id: subscriber.id,
            email: subscriber.email,
            name: subscriber.name,
            subscribedAt: subscriber.subscribedAt,
            updatedAt: subscriber.updatedAt,
            active: subscriber.active
        });

    } catch (error) {
        console.error('Get subscriber error:', error);
        res.status(500).json({ error: 'Failed to get subscriber info' });
    }
});

// Update subscriber preferences
app.put('/api/subscriber/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const { name } = req.body;

        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }

        const updates = {};
        if (name !== undefined) updates.name = name;

        const result = await emailService.updateSubscriber(token, updates);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Update subscriber error:', error);
        res.status(500).json({ error: 'Failed to update subscriber' });
    }
});

// Unsubscribe by token (for email links)
app.post('/api/unsubscribe-token', async (req, res) => {
    try {
        const { token } = req.body;
        
        if (!token) {
            return res.status(400).json({ error: 'Token is required' });
        }

        const result = await emailService.unsubscribeById(token);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Unsubscribe error:', error);
        res.status(500).json({ error: 'Failed to unsubscribe' });
    }
});

// Unsubscribe from email notifications (legacy endpoint)
app.post('/api/unsubscribe', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const result = await emailService.removeSubscriber(email);
        
        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('Unsubscribe error:', error);
        res.status(500).json({ error: 'Failed to unsubscribe' });
    }
});

app.get('/api/subscribers/count', async (req, res) => {
    try {
        const subscribers = await emailService.loadSubscribers();
        const activeCount = subscribers.filter(sub => sub.active).length;
        res.json({
            total: subscribers.length,
            active: activeCount
        });
    } catch (error) {
        console.error('Error getting subscriber count:', error);
        res.status(500).json({ error: 'Failed to get subscriber count' });
    }
});

// Export subscriber data for environment variable backup (admin endpoint)
app.get('/api/subscribers/export', async (req, res) => {
    try {
        const subscribers = await emailService.loadSubscribers();
        const envData = JSON.stringify(subscribers);
        const gistInfo = await emailService.getGistInfo();
        
        res.json({
            subscriberData: subscribers,
            envVariableFormat: envData,
            totalSubscribers: subscribers.length,
            activeSubscribers: subscribers.filter(sub => sub.active).length,
            dataSize: `${(envData.length / 1024).toFixed(2)}KB`,
            timestamp: new Date().toISOString(),
            gistInfo: gistInfo,
            setupInstructions: {
                githubGist: {
                    required: ['GITHUB_TOKEN', 'GIST_ID (optional - will be created)'],
                    benefits: ['Automatic backup', 'No size limits', 'No manual updates needed', 'Version history'],
                    setup: [
                        '1. Create GitHub Personal Access Token with "gist" permission',
                        '2. Set GITHUB_TOKEN environment variable',
                        '3. GIST_ID will be created automatically on first save',
                        '4. Backups happen automatically on every subscriber change'
                    ]
                },
                environmentVariable: {
                    required: ['SUBSCRIBERS_DATA'],
                    limitations: ['Manual updates required', '4KB size limit', 'No version history'],
                    setup: [
                        '1. Copy envVariableFormat from response',
                        '2. Set SUBSCRIBERS_DATA environment variable',
                        '3. Update manually before each deployment'
                    ]
                }
            }
        });
    } catch (error) {
        console.error('Error exporting subscriber data:', error);
        res.status(500).json({ error: 'Failed to export subscriber data' });
    }
});

// Get GitHub Gist backup status (admin endpoint)
app.get('/api/backup/gist-status', async (req, res) => {
    try {
        const gistInfo = await emailService.getGistInfo();
        res.json(gistInfo);
    } catch (error) {
        console.error('Error getting gist status:', error);
        res.status(500).json({ 
            configured: false,
            error: 'Failed to check gist status'
        });
    }
});

// Force sync to GitHub Gist (admin endpoint)
app.post('/api/backup/sync-to-gist', async (req, res) => {
    try {
        const subscribers = await emailService.loadSubscribers();
        const success = await emailService.saveToGist(subscribers);
        
        if (success) {
            res.json({
                success: true,
                message: 'Successfully synced to GitHub Gist',
                subscriberCount: subscribers.length,
                gistId: emailService.gistId
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to sync to GitHub Gist'
            });
        }
    } catch (error) {
        console.error('Error syncing to gist:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to sync to GitHub Gist'
        });
    }
});

// Send test email
app.post('/api/test-email', async (req, res) => {
    try {
        const { to } = req.body;
        
        if (!to) {
            return res.status(400).json({ error: 'Email address is required' });
        }

        await emailService.sendTestEmail(to);
        res.json({ success: true, message: 'Test email sent successfully!' });
    } catch (error) {
        console.error('Test email error:', error);
        res.status(500).json({ error: 'Failed to send test email' });
    }
});

// Test team-specific email
app.post('/api/test-team-email', async (req, res) => {
    try {
        const { teamCode, changes } = req.body;
        
        if (!teamCode) {
            return res.status(400).json({ error: 'Team code is required' });
        }

        const result = await emailService.sendTeamTestEmail(teamCode, changes || [`Test change for team ${teamCode}`]);
        
        if (result && result.success) {
            res.json({ 
                success: true, 
                message: `Test email sent to ${result.subscribers} subscribers for team ${result.teamCode}`,
                subscribers: result.subscribers,
                teamCode: result.teamCode
            });
        } else {
            res.json({ 
                success: true, 
                message: `No subscribers found for team ${teamCode}`,
                subscribers: 0,
                teamCode: teamCode
            });
        }
    } catch (error) {
        console.error('Team test email error:', error);
        res.status(500).json({ error: 'Failed to send team test email' });
    }
});

// Test with real standings data
app.post('/api/test-real-email', async (req, res) => {
    try {
        const { teamCode } = req.body;
        
        const result = await emailService.sendRealDataTestEmail(teamCode || 'all', scraper);
        
        if (result.success) {
            res.json({ 
                success: true, 
                message: `Real data test email sent to ${result.subscribers} subscribers for ${result.teamName}`,
                subscribers: result.subscribers,
                teamCode: result.teamCode,
                teamName: result.teamName,
                standingsCount: result.standingsCount
            });
        } else {
            res.json({ 
                success: false, 
                message: result.reason,
                teamName: result.teamName
            });
        }
    } catch (error) {
        console.error('Real data test email error:', error);
        res.status(500).json({ error: 'Failed to send real data test email' });
    }
});

// List available subscriber backup files
app.get('/api/subscriber-backups', (req, res) => {
    try {
        const fs = require('fs');
        const path = require('path');
        const backupDir = path.join(__dirname, 'backup');
        
        if (!fs.existsSync(backupDir)) {
            return res.json({ success: true, backups: [] });
        }
        
        const files = fs.readdirSync(backupDir)
            .filter(file => file.startsWith('subscribers-') && file.endsWith('.json'))
            .map(file => {
                const filePath = path.join(backupDir, file);
                const stats = fs.statSync(filePath);
                const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                const activeCount = content.filter(sub => sub.active).length;
                
                return {
                    filename: file,
                    created: stats.ctime.toISOString(),
                    totalSubscribers: content.length,
                    activeSubscribers: activeCount,
                    size: stats.size
                };
            })
            .sort((a, b) => new Date(b.created) - new Date(a.created));
        
        res.json({ success: true, backups: files });
    } catch (error) {
        console.error('Error listing backups:', error);
        res.status(500).json({ error: 'Failed to list backup files' });
    }
});

// Restore subscribers from backup
app.post('/api/restore-subscribers', async (req, res) => {
    try {
        const { backupFilename, confirmRestore } = req.body;
        
        if (!backupFilename) {
            return res.status(400).json({ error: 'Backup filename is required' });
        }
        
        if (!confirmRestore) {
            return res.status(400).json({ error: 'Confirmation required for restore operation' });
        }
        
        const fs = require('fs');
        const path = require('path');
        const backupPath = path.join(__dirname, 'backup', backupFilename);
        
        if (!fs.existsSync(backupPath)) {
            return res.status(404).json({ error: 'Backup file not found' });
        }
        
        // Load backup data
        const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
        
        // Get current subscriber count for comparison
        const currentSubscribers = await emailService.loadSubscribers();
        const currentActiveCount = currentSubscribers.filter(sub => sub.active).length;
        const backupActiveCount = backupData.filter(sub => sub.active).length;
        
        // Save backup data as current subscribers
        await emailService.saveSubscribers(backupData);
        
        console.log(`📧 Subscribers restored from backup: ${backupFilename}`);
        console.log(`📧 Active subscribers: ${currentActiveCount} → ${backupActiveCount}`);
        
        res.json({
            success: true,
            message: `Subscribers restored from ${backupFilename}`,
            previousActiveCount: currentActiveCount,
            restoredActiveCount: backupActiveCount,
            totalRestored: backupData.length
        });
        
    } catch (error) {
        console.error('Error restoring subscribers:', error);
        res.status(500).json({ error: 'Failed to restore subscribers from backup' });
    }
});

// Bulk reactivate subscribers (for fixing accidental deactivations)
app.post('/api/reactivate-subscribers', async (req, res) => {
    try {
        const { emails, dryRun = false, confirm = false } = req.body;
        
        if (!confirm) {
            return res.status(400).json({ error: 'Confirmation required for reactivation operation' });
        }
        
        const result = await emailService.bulkReactivateSubscribers(emails, dryRun);
        
        res.json({
            success: true,
            message: dryRun ? 
                `Dry run: Would reactivate ${result.reactivatedCount} subscribers` :
                `Successfully reactivated ${result.reactivatedCount} subscribers`,
            ...result
        });
        
    } catch (error) {
        console.error('Error reactivating subscribers:', error);
        res.status(500).json({ error: 'Failed to reactivate subscribers' });
    }
});

// Manual notification trigger (production-ready)
app.post('/api/check-for-changes', async (req, res) => {
    try {
        console.log('Manual change detection triggered...');
        await performScheduledScrapeWithNotifications();
        
        res.json({
            success: true,
            message: 'Change detection completed - check server logs for results'
        });
    } catch (error) {
        console.error('Manual change detection error:', error);
        res.status(500).json({ error: 'Failed to check for changes' });
    }
});

// Initialize previous standings (for first deployment)
app.post('/api/initialize-standings', async (req, res) => {
    try {
        console.log('Initializing previous standings with current data...');
        
        // Scrape current standings
        const currentData = await scraper.scrapeStandings(true); // Force refresh
        
        if (!currentData || !currentData.teams) {
            return res.status(500).json({ error: 'Failed to get current standings data' });
        }

        // Save as previous standings
        await savePreviousStandings(currentData.teams);
        
        res.json({
            success: true,
            message: `Initialized previous standings with ${currentData.teams.length} teams`,
            teamsCount: currentData.teams.length
        });
    } catch (error) {
        console.error('Initialize standings error:', error);
        res.status(500).json({ error: 'Failed to initialize standings' });
    }
});

// Get the timestamp of the last YSBA update based on when the YSBA standings were actually updated
app.get('/api/last-ysba-update', async (req, res) => {
  try {
    // This date represents when YSBA actually updated their site data
    // This is not a fallback but the actual update date from YSBA
    const ysbaUpdateDate = new Date(2025, 5, 1); // June 1, 2025 (month is 0-based)
    
    res.json({
      success: true,
      lastYsbaUpdate: ysbaUpdateDate.toISOString(),
      formattedDate: ysbaUpdateDate.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })
    });
  } catch (error) {
    console.error('Error getting last YSBA update time:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get YSBA update time',
      formattedDate: 'June 1, 2025' // Provide the date even in case of error
    });
  }
});

// Serve the main page with cache busting
app.get('/', (req, res) => {
  const htmlPath = path.join(__dirname, 'public', 'index.html');
  let htmlContent = fs.readFileSync(htmlPath, 'utf8');
  
  // Replace CSS and JS references with cache-busted versions
  htmlContent = htmlContent.replace('/css/styles.css?v=1', `/css/styles.css?v=${appVersion}`);
  htmlContent = htmlContent.replace('/js/app.js?v=1', `/js/app.js?v=${appVersion}`);
  htmlContent = htmlContent.replace('/js/app.js', `/js/app.js?v=${appVersion}`);
  htmlContent = htmlContent.replace('/js/dev-utils.js', `/js/dev-utils.js?v=${appVersion}`);
  htmlContent = htmlContent.replace('/js/simplyCountdown.umd.js', `/js/simplyCountdown.umd.js?v=${appVersion}`);
  
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Content-Type': 'text/html',
    'Last-Modified': new Date().toUTCString(),
    'ETag': `"${appVersion}"`,
    'Vary': 'Accept-Encoding'
  });
  
  res.send(htmlContent);
});

// Serve subscription management page
app.get('/manage', (req, res) => {
    const htmlPath = path.join(__dirname, 'public', 'manage.html');
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    // Replace CSS and JS references with cache-busted versions
    htmlContent = htmlContent.replace('/css/styles.css?v=1', `/css/styles.css?v=${appVersion}`);
    htmlContent = htmlContent.replace('/js/manage.js', `/js/manage.js?v=${appVersion}`);
    
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Content-Type': 'text/html',
      'Last-Modified': new Date().toUTCString(),
      'ETag': `"${appVersion}"`,
      'Vary': 'Accept-Encoding'
    });
    
    res.send(htmlContent);
});

// Serve unsubscribe page
app.get('/unsubscribe', (req, res) => {
    const htmlPath = path.join(__dirname, 'public', 'unsubscribe.html');
    let htmlContent = fs.readFileSync(htmlPath, 'utf8');
    
    // Replace CSS references with cache-busted versions
    htmlContent = htmlContent.replace('/css/styles.css?v=1', `/css/styles.css?v=${appVersion}`);
    
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Content-Type': 'text/html',
      'Last-Modified': new Date().toUTCString(),
      'ETag': `"${appVersion}"`,
      'Vary': 'Accept-Encoding'
    });
    
    res.send(htmlContent);
});

// Multi-division routing - handle /{division}/{tier} URLs (must come after API routes)
app.get('/:division/:tier', (req, res) => {
  const { division, tier } = req.params;
  
  // Validate division and tier
  const divisionConfig = config.getDivisionConfig(division, tier);
  if (!divisionConfig) {
    return res.status(404).sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  
  // Serve the standings template
  res.sendFile(path.join(__dirname, 'public', 'standings.html'));
});

// Schedule automatic scraping with change detection
const cronExpression = `*/${config.SCRAPE_INTERVAL_MINUTES} * * * *`;
console.log(`Scheduling automatic scraping every ${config.SCRAPE_INTERVAL_MINUTES} minutes`);

cron.schedule(cronExpression, async () => {
  try {
    console.log('Running scheduled scrape with change detection...');
    await performScheduledScrapeWithNotifications();
  } catch (error) {
    console.error('Scheduled scraping failed:', error);
  }
});

// Function to perform scraping with change detection and notifications
async function performScheduledScrapeWithNotifications() {
  try {
    console.log('Running scheduled scrape with change detection...');
    
    // Load previous standings if they exist
    const previousData = await loadPreviousStandings();
    // previousData can be either the teams array (old format) or the array within the object (new format)
    const previousStandings = Array.isArray(previousData) ? previousData : previousData?.teams;
   
    // Force refresh to get the latest data 
    // This will update the scraper's cache with fresh data
    console.log('Performing scheduled force refresh of standings...');
    const currentData = await scraper.scrapeStandings(true);
    
    if (!currentData || !currentData.teams) {
      console.error('Failed to get current standings data');
      return;
    }

    console.log(`✅ Successfully updated cache with latest standings (${currentData.teams.length} teams)`);

    // If we have previous data, check for changes
    if (previousStandings && previousStandings.length > 0) {
      console.log(`Comparing with previous standings (${previousStandings.length} teams)...`);
      const result = await emailService.sendChangeNotifications(previousStandings, currentData.teams);
      
      if (result.sent) {
        console.log(`📧 Notifications sent for ${result.changes} changes`);
      } else {
        console.log(`📧 ${result.reason}`);
      }
    } else {
      console.log('No previous standings found - storing current data for future comparison');
    }

    // Store current standings as "previous" for next time
    await savePreviousStandings(currentData.teams);
    
  } catch (error) {
    console.error('Error in scheduled scrape with notifications:', error);
  }
}

// Load previous standings from file
async function loadPreviousStandings() {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const filePath = path.join(__dirname, 'previous-standings.json');
    
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    
    // Handle both new format (with teams property) and old format (just array)
    return parsed.teams || parsed;
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File doesn't exist yet - this is normal for first run
      return null;
    }
    console.error('Error loading previous standings:', error);
    return null;
  }
}

// Save current standings as previous for next comparison
async function savePreviousStandings(teams) {
  try {
    const fs = require('fs').promises;
    const path = require('path');
    const filePath = path.join(__dirname, 'previous-standings.json');
    
    // Add a timestamp to track when YSBA data was updated
    const data = {
      teams,
      lastUpdated: new Date().toISOString()
    };
    
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
    console.log(`Saved ${teams.length} teams to previous standings file`);
  } catch (error) {
    console.error('Error saving previous standings:', error);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  await scraper.cleanup();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await scraper.cleanup();
  process.exit(0);
});

// Error handling
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: 'Something went wrong on our end'
  });
});

const PORT = config.PORT;
app.listen(PORT, () => {
  console.log(`YSBA Standings server running on port ${PORT}`);
  console.log(`Visit http://localhost:${PORT} to view the leaderboard`);
  console.log(`📱 Mobile: http://10.0.0.148:${PORT} (from your phone)`);
  
  // Initial scrape on startup - populate both standings and schedule caches
  setTimeout(async () => {
    try {
      const isDev = process.env.NODE_ENV !== 'production';
      const hasRecentData = scraper.cacheTimestamp && 
                           (Date.now() - scraper.cacheTimestamp) < (5 * 60 * 1000); // 5 minutes
      
      if (isDev && hasRecentData) {
        console.log('Skipping initial scrape - recent data available');
        return;
      }
      
      console.log('Performing initial scrape (standings + comprehensive schedule)...');
      
      // Populate standings cache
      await scraper.scrapeStandings(true);
      
      // Populate comprehensive schedule cache for instant modal loading
      console.log('Pre-populating comprehensive schedule cache...');
      await scraper.scrapeAllGamesSchedule(true);
      console.log('✓ All caches populated - schedule modals will load instantly');
      
    } catch (error) {
      console.error('Initial scraping failed:', error);
    }
  }, 2000);
}); 