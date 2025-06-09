// Load environment variables first
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const EmailService = require('./email-service');
const config = require('./config');
const fs = require('fs').promises;

const app = express();
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
        fileStats[file] = { exists: false };
      }
    }

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      dataSource: 'GitHub Actions (every 30 minutes)',
      files: fileStats,
      server: 'YSBA Live - Optimized for JSON serving',
      uptime: process.uptime()
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
      // Handle tier mapping: remove redundant prefixes
      let cleanTier = targetTier;
      if (targetDivision.endsWith('-rep') && targetTier.startsWith('rep-')) {
        cleanTier = targetTier.substring(4); // Remove "rep-" prefix
      } else if (targetDivision.endsWith('-select') && targetTier.startsWith('select-')) {
        cleanTier = targetTier.substring(7); // Remove "select-" prefix
      }
      
      const fileName = `${targetDivision}-${cleanTier}.json`;
      
      const divisionPath = path.join(__dirname, 'public', 'divisions', fileName);
      console.log(`Looking for division file: ${divisionPath}`);
      const divisionData = JSON.parse(await fs.readFile(divisionPath, 'utf8'));
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
          winPercentage: team.record?.winPercentage || "0.000"
        }));
        
        res.json({
          success: true,
          data: {
            teams,
            lastUpdated: divisionData.lastUpdated || new Date().toISOString(),
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
      
      // Parse division name (remove -select/-rep suffix for lookup)
      let divisionKey = targetDivision.replace('-select', '').replace('-rep', '');
      let tierKey = targetTier;
      
      // Handle special cases for tier mapping
      if (targetDivision.includes('select')) {
        tierKey = 'select-all-tiers';
      } else if (targetDivision.includes('rep')) {
        tierKey = `rep-${targetTier}`;
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
          winPercentage: team.pct
        }));
        
        res.json({
          success: true,
          data: {
            teams,
            lastUpdated: standingsData.lastUpdated,
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
      
      // Convert to frontend-expected format
      const divisions = {};
      Object.entries(indexData.divisions).forEach(([key, division]) => {
        // Convert tier array to tier object for frontend compatibility
        const tiers = {};
        if (division.tiers && Array.isArray(division.tiers)) {
          division.tiers.forEach(tier => {
            tiers[tier.key] = {
              displayName: tier.key.split('-').map(word => 
                word.charAt(0).toUpperCase() + word.slice(1)
              ).join(' '),
              teams: tier.teams,
              games: tier.games
            };
          });
        }
        
        // Skip empty divisions if filtering is requested
        if (filterEmpty && Object.keys(tiers).length === 0) {
          return;
        }
        
        // Add division type suffixes for proper routing
        const repDivision = Object.keys(tiers).some(t => t.includes('rep'));
        const selectDivision = Object.keys(tiers).some(t => t.includes('select'));
        
        if (repDivision) {
          divisions[`${key}-rep`] = {
            displayName: `${division.displayName} Rep`,
            theme: division.theme || { primary: '#024220' },
            tiers,
            features: {
              divisionFilter: false,
              emailNotifications: true,
              schedules: true
            }
          };
        }
        
        if (selectDivision) {
          divisions[`${key}-select`] = {
            displayName: `${division.displayName} Select`,
            theme: division.theme || { primary: '#15803d' },
            tiers: Object.fromEntries(
              Object.entries(tiers).filter(([tierKey]) => tierKey.includes('select'))
            ),
            features: {
              divisionFilter: false,
              emailNotifications: true,
              schedules: true
            }
          };
        }
      });
      
      res.json({
        success: true,
        divisions,
        lastUpdated: indexData.lastUpdated,
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
        }
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

// API endpoint to get last YSBA update time
app.get('/api/last-ysba-update', async (req, res) => {
  try {
    // Try to get the last update time from the standings data
    try {
      const standingsPath = path.join(__dirname, 'public', 'ysba-standings.json');
      const standingsData = JSON.parse(await fs.readFile(standingsPath, 'utf8'));
      
      res.json({
        success: true,
        lastYsbaUpdate: standingsData.lastUpdated,
        formattedDate: new Date(standingsData.lastUpdated).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        })
      });
    } catch (error) {
      // Fallback to current date if no data available
      const currentDate = new Date();
      res.json({
        success: true,
        lastYsbaUpdate: currentDate.toISOString(),
        formattedDate: currentDate.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric'
        })
      });
    }
  } catch (error) {
    console.error('Error getting last YSBA update time:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get YSBA update time',
      formattedDate: 'Unknown'
    });
  }
});

// API endpoint to get team schedule
app.get('/api/team/:teamCode/schedule', async (req, res) => {
  try {
    const { teamCode } = req.params;
    const { division = '9U-select', tier = 'all-tiers' } = req.query;
    
    // Try to get from individual division file
    try {
      const divisionPath = path.join(__dirname, 'public', 'divisions', `${division}-${tier}.json`);
      const divisionData = JSON.parse(await fs.readFile(divisionPath, 'utf8'));
      
      if (divisionData.schedule && divisionData.schedule.teamSchedules && divisionData.schedule.teamSchedules[teamCode]) {
        res.json(divisionData.schedule.teamSchedules[teamCode]);
        return;
      }
    } catch (error) {
      console.log('Could not load team schedule from division file:', error.message);
    }
    
    res.json({
      allGames: [],
      playedGames: [],
      upcomingGames: [],
      teamCode,
      lastUpdated: new Date().toISOString(),
      error: 'No schedule data available'
    });
    
  } catch (error) {
    console.error('Error serving team schedule:', error);
    res.status(500).json({
      error: 'Failed to load team schedule',
      message: error.message,
      allGames: [],
      playedGames: [],
      upcomingGames: [],
      teamCode: req.params.teamCode
    });
  }
});

// Email subscription endpoints (keep existing functionality)
app.post('/api/subscribe', async (req, res) => {
  try {
    const { email, divisions } = req.body;
    
    if (!email || !email.includes('@')) {
      return res.status(400).json({ 
        success: false, 
        message: 'Valid email address is required' 
      });
    }

    const result = await emailService.addSubscriber(email, divisions);
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
      '/api/unsubscribe-token'
    ]
  });
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
const server = app.listen(PORT, () => {
  console.log(`🚀 YSBA Live server running on port ${PORT}`);
  console.log(`📊 Serving pre-generated JSON files (updated every 30 minutes)`);
  console.log(`⚡ No live scraping - optimized for speed!`);
  console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
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

module.exports = app;