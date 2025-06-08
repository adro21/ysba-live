const fs = require('fs').promises;
const path = require('path');

class DataOptimizer {
  constructor() {
    this.dataDir = path.join(__dirname, '../../data');
  }

  // Create optimized versions focusing on divisions with actual data
  async createOptimizedFiles() {
    console.log('🔧 Creating optimized data files...');
    
    try {
      // Read the full data
      const fullData = JSON.parse(
        await fs.readFile(path.join(this.dataDir, 'ysba.json'), 'utf8')
      );

      // Filter to only divisions with teams
      const activeDivisions = this.filterActiveDivisions(fullData);
      
      // Create different optimized versions
      await Promise.all([
        this.createActiveOnlyFile(activeDivisions),
        this.createQuickStandingsFile(activeDivisions),
        this.createRecentGamesFile(activeDivisions),
        this.createDivisionIndex(activeDivisions)
      ]);

      console.log('✅ Optimized files created successfully');
      
    } catch (error) {
      console.error('❌ Error creating optimized files:', error.message);
      throw error;
    }
  }

  // Filter to only divisions that have teams
  filterActiveDivisions(fullData) {
    const activeDivisions = {
      metadata: fullData.metadata,
      divisions: {}
    };

    let totalActiveTeams = 0;
    let activeDivisionCount = 0;

    for (const [divisionKey, division] of Object.entries(fullData.divisions)) {
      const activeTiers = {};
      
      for (const [tierKey, tier] of Object.entries(division.tiers)) {
        if (tier.standings.teams && tier.standings.teams.length > 0) {
          activeTiers[tierKey] = tier;
          totalActiveTeams += tier.standings.teams.length;
        }
      }
      
      if (Object.keys(activeTiers).length > 0) {
        activeDivisions.divisions[divisionKey] = {
          ...division,
          tiers: activeTiers
        };
        activeDivisionCount++;
      }
    }

    activeDivisions.metadata.activeDivisions = activeDivisionCount;
    activeDivisions.metadata.totalActiveTeams = totalActiveTeams;
    activeDivisions.metadata.filteredAt = new Date().toISOString();

    console.log(`📊 Found ${activeDivisionCount} active divisions with ${totalActiveTeams} teams`);
    
    return activeDivisions;
  }

  // Create file with only active divisions (much smaller)
  async createActiveOnlyFile(activeDivisions) {
    const outputPath = path.join(this.dataDir, 'ysba-active.json');
    const publicPath = path.join(this.dataDir, '../public/ysba-active.json');
    
    const data = JSON.stringify(activeDivisions, null, 2);
    
    await fs.writeFile(outputPath, data, 'utf8');
    await fs.writeFile(publicPath, data, 'utf8');
    
    const stats = await fs.stat(outputPath);
    const fileSizeKB = (stats.size / 1024).toFixed(2);
    
    console.log(`✓ Active divisions file: ${fileSizeKB} KB`);
    return { outputPath, size: fileSizeKB };
  }

  // Create quick standings file (positions and records only)
  async createQuickStandingsFile(activeDivisions) {
    const quickData = {
      lastUpdated: activeDivisions.metadata.lastUpdated,
      divisions: {}
    };

    for (const [divisionKey, division] of Object.entries(activeDivisions.divisions)) {
      quickData.divisions[divisionKey] = {
        displayName: division.displayName,
        tiers: {}
      };
      
      for (const [tierKey, tier] of Object.entries(division.tiers)) {
        quickData.divisions[divisionKey].tiers[tierKey] = {
          teams: tier.standings.teams.map(team => ({
            pos: team.position,
            team: team.team,
            w: team.record.wins,
            l: team.record.losses,
            t: team.record.ties,
            pct: team.record.winPercentage,
            rf: team.stats.runsFor,
            ra: team.stats.runsAgainst
          }))
        };
      }
    }

    const outputPath = path.join(this.dataDir, 'ysba-standings.json');
    const publicPath = path.join(this.dataDir, '../public/ysba-standings.json');
    
    const data = JSON.stringify(quickData, null, 0); // No formatting for smaller size
    
    await fs.writeFile(outputPath, data, 'utf8');
    await fs.writeFile(publicPath, data, 'utf8');
    
    const stats = await fs.stat(outputPath);
    const fileSizeKB = (stats.size / 1024).toFixed(2);
    
    console.log(`✓ Quick standings file: ${fileSizeKB} KB`);
    return { outputPath, size: fileSizeKB };
  }

  // Create recent games file (for scoreboard/activity feed)
  async createRecentGamesFile(activeDivisions) {
    const recentGames = [];

    for (const [divisionKey, division] of Object.entries(activeDivisions.divisions)) {
      for (const [tierKey, tier] of Object.entries(division.tiers)) {
        if (tier.schedule.recentGames) {
          tier.schedule.recentGames.forEach(game => {
            recentGames.push({
              ...game,
              division: divisionKey,
              tier: tierKey
            });
          });
        }
      }
    }

    // Sort by date, most recent first
    recentGames.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    const recentData = {
      lastUpdated: activeDivisions.metadata.lastUpdated,
      totalGames: recentGames.length,
      games: recentGames.slice(0, 50) // Keep latest 50 games
    };

    const outputPath = path.join(this.dataDir, 'ysba-recent.json');
    const publicPath = path.join(this.dataDir, '../public/ysba-recent.json');
    
    const data = JSON.stringify(recentData, null, 2);
    
    await fs.writeFile(outputPath, data, 'utf8');
    await fs.writeFile(publicPath, data, 'utf8');
    
    const stats = await fs.stat(outputPath);
    const fileSizeKB = (stats.size / 1024).toFixed(2);
    
    console.log(`✓ Recent games file: ${fileSizeKB} KB`);
    return { outputPath, size: fileSizeKB };
  }

  // Create division index (for navigation/discovery)
  async createDivisionIndex(activeDivisions) {
    const index = {
      lastUpdated: activeDivisions.metadata.lastUpdated,
      totalDivisions: Object.keys(activeDivisions.divisions).length,
      divisions: {}
    };

    for (const [divisionKey, division] of Object.entries(activeDivisions.divisions)) {
      index.divisions[divisionKey] = {
        displayName: division.displayName,
        shortName: division.shortName,
        tiers: Object.keys(division.tiers).map(tierKey => ({
          key: tierKey,
          teams: division.tiers[tierKey].standings.totalTeams || 0,
          games: division.tiers[tierKey].schedule.totalGames || 0
        }))
      };
    }

    const outputPath = path.join(this.dataDir, 'ysba-index.json');
    const publicPath = path.join(this.dataDir, '../public/ysba-index.json');
    
    const data = JSON.stringify(index, null, 2);
    
    await fs.writeFile(outputPath, data, 'utf8');
    await fs.writeFile(publicPath, data, 'utf8');
    
    const stats = await fs.stat(outputPath);
    const fileSizeKB = (stats.size / 1024).toFixed(2);
    
    console.log(`✓ Division index file: ${fileSizeKB} KB`);
    return { outputPath, size: fileSizeKB };
  }

  // Get summary of all files
  async getFileSummary() {
    const files = [
      'ysba.json',
      'ysba-active.json', 
      'ysba-standings.json',
      'ysba-recent.json',
      'ysba-index.json',
      'dashboard.json'
    ];

    const summary = [];
    
    for (const filename of files) {
      try {
        const filePath = path.join(this.dataDir, filename);
        const stats = await fs.stat(filePath);
        const sizeKB = (stats.size / 1024).toFixed(2);
        
        summary.push({
          file: filename,
          size: sizeKB + ' KB',
          purpose: this.getFilePurpose(filename)
        });
      } catch (error) {
        // File doesn't exist
        summary.push({
          file: filename,
          size: 'Not found',
          purpose: this.getFilePurpose(filename)
        });
      }
    }
    
    return summary;
  }

  getFilePurpose(filename) {
    const purposes = {
      'ysba.json': 'Complete data (all divisions, large file)',
      'ysba-active.json': 'Only divisions with teams (recommended)',
      'ysba-standings.json': 'Standings only (fast loading)',
      'ysba-recent.json': 'Recent games feed',
      'ysba-index.json': 'Navigation/discovery',
      'dashboard.json': 'Summary statistics'
    };
    
    return purposes[filename] || 'Unknown';
  }
}

module.exports = DataOptimizer;