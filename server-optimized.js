// Load environment variables first
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const EmailService = require('./email-service');
const AIStoryService = require('./ai-story-service');
const config = require('./config');
const fs = require('fs').promises;

const app = express();
const emailService = new EmailService();
const aiStoryService = new AIStoryService();

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
        "'unsafe-inline'",
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
      ]
    }
  } : false
}));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://ysbalive.com', 'https://www.ysbalive.com'] 
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve static files with cache headers
app.use(express.static('public', {
  maxAge: process.env.NODE_ENV === 'production' ? '1h' : '0',
  etag: true,
  lastModified: true
}));

// Health check endpoint
app.get('/api/status', async (req, res) => {
  try {
    // Check if JSON files exist and get their timestamps
    const files = ['ysba-standings.json', 'ysba-recent.json', 'ysba-index.json'];
    const fileStats = {};
    let allFilesExist = true;
    
    for (const file of files) {
      try {
        const filePath = path.join(__dirname, 'public', file);
        const stats = await fs.stat(filePath);
        fileStats[file] = {
          exists: true,
          lastModified: stats.mtime,
          size: stats.size
        };
      } catch (error) {
        fileStats[file] = { 
          exists: false,
          error: error.message 
        };
        allFilesExist = false;
      }
    }

    res.json({
      status: allFilesExist ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      dataSource: 'GitHub Actions (every 30 minutes)',
      files: fileStats,
      server: 'YSBA Live - Optimized for JSON serving',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      port: process.env.PORT || 3000,
      pid: process.pid
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API endpoint to serve standings data (backwards compatible with old frontend)
app.get('/api/standings', async (req, res) => {
  try {
    const { division = '9U-select', tier = 'all-tiers', refresh } = req.query;
    
    // Default to 9U-select if no division specified (for backwards compatibility)
    const targetDivision = division || '9U-select';
    const targetTier = tier || 'all-tiers';
    
    // Try individual division file first (most specific)
    try {
      // Normalize tier key - remove redundant prefixes if they exist
      let normalizedTier = targetTier;
      if (targetDivision.endsWith('-rep') && targetTier.startsWith('rep-')) {
        normalizedTier = targetTier.substring(4); // Remove "rep-" prefix
      } else if (targetDivision.endsWith('-select') && targetTier.startsWith('select-')) {
        normalizedTier = targetTier.substring(7); // Remove "select-" prefix  
      }
      
      // Division files use clean naming: 8U-rep-tier-3.json, 9U-select-all-tiers.json
      const fileName = `${targetDivision}-${normalizedTier}.json`;
      
      const divisionPath = path.join(__dirname, 'public', 'divisions', fileName);
      console.log(`Looking for division file: ${divisionPath}`);
      
      const divisionData = JSON.parse(await fs.readFile(divisionPath, 'utf8'));
      
      // Division files don't have lastUpdated, so get it from the main standings file
      let fileModTime = new Date().toISOString();
      try {
        const standingsData = JSON.parse(await fs.readFile(path.join(__dirname, 'public', 'ysba-standings.json'), 'utf8'));
        fileModTime = standingsData.lastUpdated || fileModTime;
      } catch (e) {
        console.log('Could not get lastUpdated from standings file:', e.message);
      }
      console.log(`Found division data with ${divisionData?.standings?.teams?.length || 0} teams`);
      
      if (divisionData && divisionData.standings && divisionData.standings.teams) {
        // Convert the nested structure to the expected flat structure
        const teams = divisionData.standings.teams.map(team => ({
          position: team.position,
          team: team.team,
          teamCode: team.teamCode,
          gamesPlayed: team.record?.gamesPlayed || 0,
          wins: team.record?.wins || 0,
          losses: team.record?.losses || 0,
          ties: team.record?.ties || 0,
          points: team.stats?.points || 0,
          runsFor: team.stats?.runsFor || 0,
          runsAgainst: team.stats?.runsAgainst || 0,
          runDifferential: (team.stats?.runsFor || 0) - (team.stats?.runsAgainst || 0),
          winPercentage: team.record?.winPercentage || "0.000"
        }));
        
        // Sort teams by YSBA criteria: Points desc, Games Played asc, Win% desc, Run Differential desc
        teams.sort((a, b) => {
          // 1. Points (descending)
          if (b.points !== a.points) return b.points - a.points;
          
          // 2. Games Played (descending - more games = higher rank)
          if (b.gamesPlayed !== a.gamesPlayed) return b.gamesPlayed - a.gamesPlayed;
          
          // 3. Win Percentage (descending)
          const aWinPct = parseFloat(a.winPercentage);
          const bWinPct = parseFloat(b.winPercentage);
          if (bWinPct !== aWinPct) return bWinPct - aWinPct;
          
          // 4. Run Differential (descending)
          return b.runDifferential - a.runDifferential;
        });
        
        // Reassign positions based on correct sort order
        teams.forEach((team, index) => {
          team.position = index + 1;
        });
        
        res.json({
          success: true,
          data: {
            teams,
            lastUpdated: fileModTime,
            source: 'GitHub Actions'
          }
        });
        return;
      }
    } catch (error) {
      console.log('Could not load from division file:', error.message);
    }
    
    // Fallback: try optimized standings file and extract division
    try {
      const standingsPath = path.join(__dirname, 'public', 'ysba-standings.json');
      
      const standingsData = JSON.parse(await fs.readFile(standingsPath, 'utf8'));
      
      // Use the lastUpdated from JSON content (more reliable than file mtime after git operations)
      const standingsFileModTime = standingsData.lastUpdated || new Date().toISOString();
      
      // Parse division name (remove -select/-rep suffix for lookup)
      let divisionKey = targetDivision.replace('-select', '').replace('-rep', '');
      let tierKey = targetTier;
      
      // Handle special cases for tier mapping - ensure we use the correct keys for data lookup
      if (targetDivision.includes('select')) {
        tierKey = 'select-all-tiers';
      } else if (targetDivision.includes('rep')) {
        // For rep divisions, check if the tier already has rep- prefix, if not add it for data lookup
        if (!targetTier.startsWith('rep-') && targetTier !== 'no-tier') {
          tierKey = `rep-${targetTier}`;
        } else {
          tierKey = targetTier;
        }
      }
      
      const divisionData = standingsData.divisions[divisionKey];
      
      if (divisionData && divisionData.tiers && divisionData.tiers[tierKey]) {
        const tierData = divisionData.tiers[tierKey];
        
        // Convert optimized format back to old format for backwards compatibility
        const teams = tierData.teams.map(team => ({
          position: team.pos,
          team: team.team,
          teamCode: team.teamCode || `team-${team.pos}`,
          gamesPlayed: (team.w + team.l + team.t) || 0,
          wins: team.w,
          losses: team.l,
          ties: team.t,
          points: team.points || (team.w * 2 + team.t),
          runsFor: team.rf,
          runsAgainst: team.ra,
          runDifferential: (team.rf || 0) - (team.ra || 0),
          winPercentage: team.pct
        }));
        
        // Sort teams by YSBA criteria: Points desc, Win% desc, Wins desc, Run Differential desc
        teams.sort((a, b) => {
          // 1. Points (descending)
          if (b.points !== a.points) return b.points - a.points;
          
          // 2. Win Percentage (descending)
          const aWinPct = parseFloat(a.winPercentage);
          const bWinPct = parseFloat(b.winPercentage);
          if (bWinPct !== aWinPct) return bWinPct - aWinPct;
          
          // 3. Wins (descending)
          if (b.wins !== a.wins) return b.wins - a.wins;
          
          // 4. Run Differential (descending)
          return b.runDifferential - a.runDifferential;
        });
        
        // Reassign positions based on correct sort order
        teams.forEach((team, index) => {
          team.position = index + 1;
        });
        
        res.json({
          success: true,
          data: {
            teams,
            lastUpdated: standingsFileModTime,
            source: 'GitHub Actions'
          }
        });
        return;
      }
    } catch (error) {
      console.log('Could not serve from optimized standings file:', error.message);
    }
    
    // If no data found, return empty response (but still valid)
    res.json({
      success: false,
      message: `No data found for ${targetDivision}/${targetTier}. Available divisions can be found at /api/divisions`,
      data: {
        teams: [],
        lastUpdated: new Date().toISOString(),
        source: 'No data available'
      }
    });
    
  } catch (error) {
    console.error('Error serving standings:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to load standings data',
      data: {
        teams: [],
        lastUpdated: new Date().toISOString(),
        source: 'Error'
      }
    });
  }
});

// API endpoint to get available divisions
app.get('/api/divisions', async (req, res) => {
  try {
    const { filterEmpty } = req.query;
    const indexPath = path.join(__dirname, 'public', 'ysba-index.json');
    
    try {
      const indexData = JSON.parse(await fs.readFile(indexPath, 'utf8'));
      
      // Use the lastUpdated from JSON content (more reliable than file mtime after git operations)
      const indexFileModTime = indexData.lastUpdated || new Date().toISOString();
      
      // Convert to frontend-expected format
      const divisions = {};
      Object.entries(indexData.divisions).forEach(([key, division]) => {
        // Convert tier array to tier object for frontend compatibility
        const tiers = {};
        if (division.tiers && Array.isArray(division.tiers)) {
          division.tiers.forEach(tier => {
            // Improve display names for better UX
            let displayName;
            if (tier.key === 'select-all-tiers') {
              displayName = 'All Teams'; // More friendly than "All Tiers" for select
            } else {
              // Remove redundant rep/select prefixes from tier display names
              let cleanKey = tier.key;
              if (cleanKey.startsWith('rep-')) {
                cleanKey = cleanKey.substring(4); // Remove "rep-" prefix
              } else if (cleanKey.startsWith('select-')) {
                cleanKey = cleanKey.substring(7); // Remove "select-" prefix
              }
              
              displayName = cleanKey.split('-').map(word => 
                word.charAt(0).toUpperCase() + word.slice(1)
              ).join(' ');
            }
            
            // Generate clean tier key for API response (remove redundant prefixes)
            let cleanTierKey = tier.key;
            if (cleanTierKey.startsWith('rep-')) {
              cleanTierKey = cleanTierKey.substring(4); // Remove "rep-" prefix
            } else if (cleanTierKey.startsWith('select-')) {
              cleanTierKey = cleanTierKey.substring(7); // Remove "select-" prefix
            }
            
            tiers[cleanTierKey] = {
              displayName,
              teams: tier.teams,
              games: tier.games,
              originalKey: tier.key // Keep original key for internal mapping if needed
            };
          });
        }
        
        // Skip empty divisions if filtering is requested
        if (filterEmpty && Object.keys(tiers).length === 0) {
          return;
        }
        
        // Add division type suffixes for proper routing
        const repDivision = division.tiers && Array.isArray(division.tiers) && division.tiers.some(t => t.key.includes('rep'));
        const selectDivision = division.tiers && Array.isArray(division.tiers) && division.tiers.some(t => t.key.includes('select'));
        
        if (repDivision) {
          divisions[`${key}-rep`] = {
            displayName: `${division.displayName} Rep`,
            theme: {
              primary: '#024220',
              secondary: '#015c2a',
              accent: '#facc15'
            },
            tiers: Object.fromEntries(
              Object.entries(tiers).filter(([tierKey, tierData]) => 
                tierData.originalKey && tierData.originalKey.includes('rep')
              )
            ),
            features: {
              divisionFilter: false,
              emailNotifications: true,
              schedules: true
            }
          };
        }
        
        if (selectDivision) {
          // Get the config division for this key to access features and divisionMapping
          const configDivision = config.DIVISIONS[`${key}-select`];
          
          divisions[`${key}-select`] = {
            displayName: `${division.displayName} Select`,
            theme: {
              primary: '#024220',
              secondary: '#015c2a',
              accent: '#facc15'
            },
            tiers: Object.fromEntries(
              Object.entries(tiers).filter(([tierKey, tierData]) => 
                tierData.originalKey && tierData.originalKey.includes('select')
              )
            ),
            features: configDivision?.features || {
              divisionFilter: false,
              emailNotifications: true,
              schedules: true
            },
            divisionMapping: configDivision?.divisionMapping || {}
          };
        }
      });
      
      res.json({
        success: true,
        divisions,
        lastUpdated: indexFileModTime,
        totalDivisions: Object.keys(divisions).length
      });
    } catch (error) {
      console.log('Could not load from index file, using config fallback:', error.message);
      throw error; // Continue to fallback
    }
  } catch (error) {
    // Fallback to config-based divisions
    const divisions = {};
    Object.entries(config.DIVISIONS).forEach(([key, division]) => {
      divisions[key] = {
        displayName: division.displayName,
        theme: division.theme || { primary: '#024220' },
        tiers: division.tiers || {},
        features: division.features || {
          divisionFilter: false,
          emailNotifications: true,
          schedules: true
        },
        divisionMapping: division.divisionMapping || {}
      };
    });
    
    res.json({
      success: true,
      divisions,
      lastUpdated: new Date().toISOString(),
      source: 'fallback',
      totalDivisions: Object.keys(divisions).length
    });
  }
});

// Get the timestamp of the last YSBA update based on GitHub Actions scraper metadata
app.get('/api/last-ysba-update', async (req, res) => {
  try {
    // Try to read the actual GitHub Actions metadata for the real sync time
    const metadataPath = path.join(__dirname, 'public', 'metadata.json');
    
    let ysbaUpdateDate;
    let source = 'cached JSON';
    
    try {
      const metadataContent = await fs.readFile(metadataPath, 'utf8');
      const metadata = JSON.parse(metadataContent);
      
      if (metadata.generatedAt) {
        ysbaUpdateDate = new Date(metadata.generatedAt);
        source = `GitHub Actions (${metadata.source})`;
        console.log(`Using GitHub Actions sync time: ${ysbaUpdateDate.toISOString()}`);
      } else {
        throw new Error('No generatedAt timestamp in metadata');
      }
    } catch (metadataError) {
      console.warn('Could not read GitHub Actions metadata, using fallback:', metadataError.message);
      // Fallback to a recent reasonable date if metadata is not available
      ysbaUpdateDate = new Date(2025, 5, 9); // June 9, 2025 (month is 0-based)
      source = 'fallback estimate';
    }
    
    res.json({
      success: true,
      lastYsbaUpdate: ysbaUpdateDate.toISOString(),
      formattedDate: ysbaUpdateDate.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      }),
      source: source
    });
  } catch (error) {
    console.error('Error getting last YSBA update time:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get YSBA update time',
      formattedDate: 'Unknown' // More honest fallback
    });
  }
});

// API endpoint to get team schedule
app.get('/api/team/:teamCode/schedule', async (req, res) => {
  try {
    const { teamCode } = req.params;
    const { division = '9U-select', tier = 'all-tiers' } = req.query;
    
    // Use same path construction logic as standings
    const targetDivision = division || '9U-select';
    const targetTier = tier || 'all-tiers';
    
    // Normalize tier key - remove redundant prefixes if they exist
    let normalizedTier = targetTier;
    if (targetDivision.endsWith('-rep') && targetTier.startsWith('rep-')) {
      normalizedTier = targetTier.substring(4); // Remove "rep-" prefix
    } else if (targetDivision.endsWith('-select') && targetTier.startsWith('select-')) {
      normalizedTier = targetTier.substring(7); // Remove "select-" prefix  
    }
    
    // Division files use clean naming: 8U-rep-tier-3.json, 9U-select-all-tiers.json
    const fileName = `${targetDivision}-${normalizedTier}.json`;
    
    // Try to get from individual division file
    try {
      const divisionPath = path.join(__dirname, 'public', 'divisions', fileName);
      console.log(`Looking for schedule in: ${divisionPath}`);
      const divisionData = JSON.parse(await fs.readFile(divisionPath, 'utf8'));
      
      if (divisionData.schedule && divisionData.schedule.teamSchedules && divisionData.schedule.teamSchedules[teamCode]) {
        const scheduleData = divisionData.schedule.teamSchedules[teamCode];
        
        // Process and fix game data
        const processGame = (game) => {
          // Determine opponent based on whether this team is home or away
          const isHomeTeam = game.homeTeamCode === teamCode;
          const opponent = isHomeTeam ? game.awayTeam : game.homeTeam;
          const opponentCode = isHomeTeam ? game.awayTeamCode : game.homeTeamCode;
          
          // Fix score text to be from this team's perspective (team score - opponent score)
          let scoreText = null;
          if (game.score && game.isCompleted) {
            const teamScore = isHomeTeam ? game.score.home : game.score.away;
            const opponentScore = isHomeTeam ? game.score.away : game.score.home;
            scoreText = `${teamScore}-${opponentScore}`;
          }
          
          return {
            ...game,
            opponent,
            opponentCode,
            isHome: isHomeTeam,
            scoreText,
            teamScore: game.score && isHomeTeam ? game.score.home : game.score?.away,
            opponentScore: game.score && isHomeTeam ? game.score.away : game.score?.home
          };
        };
        
        // Get ALL games for this team from the division's complete game list
        let allTeamGames = [];
        
        if (divisionData.schedule.allGames) {
          // Filter division's allGames for games involving this team
          allTeamGames = divisionData.schedule.allGames
            .filter(game => game.homeTeamCode === teamCode || game.awayTeamCode === teamCode)
            .map(processGame);
        } else {
          // Fallback to team's individual game lists if allGames not available
          allTeamGames = [
            ...(scheduleData.recentGames || []),
            ...(scheduleData.nextGames || [])
          ].map(processGame);
        }
        
        // Sort games by date
        allTeamGames.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Filter into played and upcoming based on proper date logic
        const now = new Date();
        const playedGames = allTeamGames.filter(game => {
          // Games are considered played if they have a completion status OR if the date is in the past
          if (game.isCompleted) return true;
          if (game.date && new Date(game.date) < now) return true;
          return false;
        });
        const upcomingGames = allTeamGames.filter(game => {
          // Only show games with future dates, regardless of completion status
          return game.date && new Date(game.date) >= now;
        });
        
        console.log(`Team ${teamCode}: ${allTeamGames.length} total games, ${playedGames.length} played, ${upcomingGames.length} upcoming`);
        
        res.json({
          success: true,
          data: {
            allGames: allTeamGames,
            playedGames,
            upcomingGames,
            teamCode,
            totalGames: allTeamGames.length,
            lastUpdated: divisionData.lastUpdated || new Date().toISOString()
          }
        });
        return;
      }
    } catch (error) {
      console.log('Could not load team schedule from division file:', error.message);
    }
    
    res.json({
      success: false,
      message: 'No schedule data available',
      data: {
        allGames: [],
        playedGames: [],
        upcomingGames: [],
        teamCode,
        lastUpdated: new Date().toISOString()
      }
    });
    
  } catch (error) {
    console.error('Error serving team schedule:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to load team schedule',
      data: {
        allGames: [],
        playedGames: [],
        upcomingGames: [],
        teamCode: req.params.teamCode,
        lastUpdated: new Date().toISOString()
      }
    });
  }
});

// Email subscription endpoints (keep existing functionality)
app.post('/api/subscribe', async (req, res) => {
  try {
    const { email, name, divisionPreferences, divisions } = req.body;
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid email address is required' 
      });
    }

    // Support both new format (divisionPreferences) and legacy format (divisions)
    const prefs = divisionPreferences || divisions;
    
    const result = await emailService.addSubscriber(email, name, prefs);
    res.json(result);
  } catch (error) {
    console.error('Subscription error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to process subscription',
      error: error.message 
    });
  }
});

// API endpoint to get subscriber count for a division
app.get('/api/subscribers/count', async (req, res) => {
  try {
    const { division, tier } = req.query;
    
    // For now, return a mock count since we don't have subscriber data loaded
    // In a real implementation, this would query the actual subscriber database
    res.json({
      success: true,
      count: 0,
      division,
      tier
    });
  } catch (error) {
    console.error('Error getting subscriber count:', error);
    res.status(500).json({
      success: false,
      count: 0,
      error: error.message
    });
  }
});

app.post('/api/unsubscribe-token', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ 
        success: false, 
        message: 'Unsubscribe token is required' 
      });
    }

    const result = await emailService.unsubscribeByToken(token);
    res.json(result);
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to process unsubscribe request',
      error: error.message 
    });
  }
});

// Get subscriber info by token (for manage page)
app.get('/api/subscriber/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const subscriber = await emailService.getSubscriberByToken(token);
    
    if (!subscriber) {
      return res.status(404).json({
        success: false,
        error: 'Subscriber not found or invalid token'
      });
    }

    res.json({
      success: true,
      email: subscriber.email,
      name: subscriber.name || '',
      divisionPreferences: subscriber.divisionPreferences || [],
      subscribedAt: subscriber.subscribedAt
    });
  } catch (error) {
    console.error('Get subscriber error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load subscriber information'
    });
  }
});

// Update subscriber preferences
app.put('/api/subscriber/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { name, email, divisionPreferences } = req.body;

    // If email is being changed, validate it and check for duplicates
    if (email) {
      // Basic email validation
      if (!email.includes('@')) {
        return res.status(400).json({
          success: false,
          error: 'Valid email address is required'
        });
      }

      // Check if email is already used by another subscriber
      const currentSubscriber = await emailService.getSubscriberByToken(token);
      if (!currentSubscriber) {
        return res.status(404).json({
          success: false,
          error: 'Subscriber not found'
        });
      }

      // Only check for duplicates if the email is actually changing
      if (email.toLowerCase() !== currentSubscriber.email.toLowerCase()) {
        const existingSubscriber = await emailService.getSubscriberByEmail(email);
        if (existingSubscriber && existingSubscriber.active) {
          return res.status(400).json({
            success: false,
            error: 'This email address is already subscribed'
          });
        }
      }
    }

    const result = await emailService.updateSubscriber(token, {
      name,
      email,
      divisionPreferences
    });

    res.json(result);
  } catch (error) {
    console.error('Update subscriber error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update subscriber preferences'
    });
  }
});

// Get available divisions for subscription
app.get('/api/available-divisions', (req, res) => {
  try {
    const divisions = emailService.getAvailableDivisions();
    res.json({
      success: true,
      divisions: divisions
    });
  } catch (error) {
    console.error('Get available divisions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load available divisions'
    });
  }
});

// Get AI-generated stories for homepage
app.get('/api/stories', async (req, res) => {
  try {
    const stories = await aiStoryService.getStoriesForDisplay();
    
    res.json({
      success: true,
      stories: stories,
      lastUpdated: stories.length > 0 ? stories[0].generatedAt : null,
      provider: aiStoryService.aiProvider
    });
  } catch (error) {
    console.error('Get stories error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load stories',
      stories: []
    });
  }
});

// Manually trigger story generation (for testing)
app.post('/api/stories/generate', async (req, res) => {
  try {
    const stories = await aiStoryService.generateStories();
    
    res.json({
      success: true,
      stories: stories || [],
      message: 'Stories generated successfully'
    });
  } catch (error) {
    console.error('Generate stories error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate stories'
    });
  }
});

// Catch-all for unknown API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    message: `The endpoint ${req.path} does not exist`,
    availableEndpoints: [
      '/api/status',
      '/api/standings',
      '/api/divisions',
      '/api/team/:teamCode/schedule',
      '/api/subscribe',
      '/api/unsubscribe-token',
      '/api/stories',
      '/api/stories/generate',
      '/api/test-email/:division',
      '/api/subscribers/export'
    ]
  });
});

// Export subscribers (for testing/debugging)
app.get('/api/subscribers/export', async (req, res) => {
  try {
    const subscribers = await emailService.loadSubscribers();
    res.json({
      success: true,
      count: subscribers.length,
      subscribers: subscribers.map(sub => ({
        email: sub.email,
        name: sub.name || '',
        divisionPreferences: sub.divisionPreferences || [],
        subscribedAt: sub.subscribedAt
      }))
    });
  } catch (error) {
    console.error('Export subscribers error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export subscribers'
    });
  }
});

// Test email endpoint for development
app.post('/api/test-email/:division', async (req, res) => {
  try {
    const { division } = req.params;
    const { testEmail } = req.body;
    
    if (!emailService.isConfigured) {
      return res.status(500).json({ 
        error: 'Email service not configured',
        message: 'SendGrid API key not set'
      });
    }

    // Generate mock standings data for testing
    const mockStandings = [
      { team: 'Test Team 1', wins: 5, losses: 2, winPercentage: '.714', position: 1 },
      { team: 'Test Team 2', wins: 4, losses: 3, winPercentage: '.571', position: 2 },
      { team: 'Test Team 3', wins: 3, losses: 4, winPercentage: '.429', position: 3 }
    ];

    const mockChanges = ['Test Team 1 moved up to #1 (was #2)', 'Test Team 2 dropped to #2 (was #1)'];

    if (testEmail) {
      // Send to specific email for testing
      const result = await emailService.sendTestEmail(testEmail);
      res.json({ 
        success: true, 
        message: `Test email sent to ${testEmail}`,
        division 
      });
    } else {
      // Send to actual subscribers for this division
      const result = await emailService.sendDivisionStandingsUpdate(division, mockStandings, mockChanges);
      res.json({ 
        success: result.sent, 
        count: result.count,
        division: result.divisionDisplay || division,
        message: result.sent 
          ? `Test notification sent to ${result.count} subscribers`
          : result.reason || 'No subscribers found'
      });
    }
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({ 
      error: 'Failed to send test email',
      message: error.message 
    });
  }
});

// Serve main application with proper routing
app.get('*', (req, res) => {
  const requestPath = req.path;
  
  // Check if this is a division/tier route (e.g., /8U-rep/rep-tier-3)
  const divisionRoutePattern = /^\/\d+U-(rep|select)\/[^\/]+$/;
  
  if (divisionRoutePattern.test(requestPath)) {
    // Serve standings.html for division pages
    res.sendFile(path.join(__dirname, 'public', 'standings.html'));
  } else {
    // Serve index.html for homepage and other routes
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// Start server
const PORT = process.env.PORT || 3000;
const HOST = process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost';

const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 YSBA Live server running on ${HOST}:${PORT}`);
  console.log(`📊 Serving pre-generated JSON files (updated every 30 minutes)`);
  console.log(`⚡ No live scraping - optimized for speed!`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔧 Process ID: ${process.pid}`);
});

// Add error handling for server startup
server.on('error', (error) => {
  if (error.syscall !== 'listen') {
    throw error;
  }

  const bind = typeof PORT === 'string' ? 'Pipe ' + PORT : 'Port ' + PORT;

  switch (error.code) {
    case 'EACCES':
      console.error(`❌ ${bind} requires elevated privileges`);
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(`❌ ${bind} is already in use`);
      process.exit(1);
      break;
    default:
      console.error(`❌ Server error:`, error);
      throw error;
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process in production, just log the error
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  console.log('🛑 Shutting down due to uncaught exception...');
  server.close(() => {
    process.exit(1);
  });
});

module.exports = app;