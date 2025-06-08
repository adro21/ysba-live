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

// API endpoint to serve standings data (from pre-generated JSON)
app.get('/api/standings', async (req, res) => {
  try {
    const { division = '9U-select', tier = 'all-tiers' } = req.query;
    
    // Try to serve from pre-generated optimized files first
    try {
      const standingsPath = path.join(__dirname, 'public', 'ysba-standings.json');
      const standingsData = JSON.parse(await fs.readFile(standingsPath, 'utf8'));
      
      // Extract the specific division/tier data
      const divisionData = standingsData.divisions[division.replace('-select', '').replace('-rep', '')];
      
      if (divisionData && divisionData.tiers) {
        const tierKey = division.includes('select') ? 'select-all-tiers' : 
                       division.includes('rep') ? `rep-${tier}` : tier;
        
        const tierData = divisionData.tiers[tierKey];
        
        if (tierData) {
          res.json({
            teams: tierData.teams.map(team => ({
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
            })),
            lastUpdated: standingsData.lastUpdated,
            source: 'GitHub Actions'
          });
          return;
        }
      }
    } catch (error) {
      console.log('Could not serve from optimized standings file:', error.message);
    }
    
    // Fallback: try individual division file
    try {
      const divisionPath = path.join(__dirname, 'public', 'divisions', `${division}-${tier}.json`);
      const divisionData = JSON.parse(await fs.readFile(divisionPath, 'utf8'));
      
      if (divisionData && divisionData.standings) {
        res.json(divisionData.standings);
        return;
      }
    } catch (error) {
      console.log('Could not serve from division file:', error.message);
    }
    
    // If no files found, return empty data
    res.json({
      teams: [],
      lastUpdated: new Date().toISOString(),
      source: 'No data available',
      error: `No data found for ${division}/${tier}`
    });
    
  } catch (error) {
    console.error('Error serving standings:', error);
    res.status(500).json({
      error: 'Failed to load standings data',
      message: error.message,
      teams: []
    });
  }
});

// API endpoint to get available divisions
app.get('/api/divisions', async (req, res) => {
  try {
    const indexPath = path.join(__dirname, 'public', 'ysba-index.json');
    const indexData = JSON.parse(await fs.readFile(indexPath, 'utf8'));
    
    res.json({
      divisions: indexData.divisions,
      lastUpdated: indexData.lastUpdated,
      totalDivisions: indexData.totalDivisions
    });
  } catch (error) {
    // Fallback to config-based divisions
    const divisions = Object.keys(config.DIVISIONS).map(key => ({
      key,
      ...config.DIVISIONS[key],
      tiers: Object.keys(config.DIVISIONS[key].tiers)
    }));
    
    res.json({
      divisions,
      lastUpdated: new Date().toISOString(),
      source: 'fallback'
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

// Serve main application
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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