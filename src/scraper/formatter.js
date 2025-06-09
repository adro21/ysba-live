const config = require('../../config');

class DataFormatter {
  constructor() {
    this.lastUpdated = new Date().toISOString();
  }

  // Format complete YSBA data structure for JSON output
  formatYSBAData(allDivisionData) {
    const formattedData = {
      metadata: {
        lastUpdated: this.lastUpdated,
        source: 'YSBA Website',
        scrapedBy: 'YSBA Background Worker',
        version: '1.0.0',
        totalDivisions: Object.keys(allDivisionData).length
      },
      divisions: {}
    };

    // Process each division/tier combination
    for (const [divisionKey, tierData] of Object.entries(allDivisionData)) {
      const [division, tier] = divisionKey.split('-');
      const reconstructedTier = divisionKey.substring(division.length + 1); // Handle multi-part tiers
      
      if (!formattedData.divisions[division]) {
        const divisionConfig = config.getDivisionConfig(division);
        formattedData.divisions[division] = {
          displayName: divisionConfig?.displayName || division,
          shortName: divisionConfig?.shortName || division,
          tiers: {}
        };
      }

      formattedData.divisions[division].tiers[reconstructedTier] = {
        standings: this.formatStandings(tierData.standings),
        schedule: this.formatSchedule(tierData.schedule),
        summary: this.generateDivisionSummary(tierData.standings, tierData.schedule)
      };
    }

    return formattedData;
  }

  // Format standings data
  formatStandings(standingsData) {
    if (!standingsData || !standingsData.teams) {
      return {
        teams: [],
        lastUpdated: this.lastUpdated,
        error: 'No standings data available'
      };
    }

    return {
      teams: standingsData.teams.map(team => ({
        position: team.position,
        team: team.team,
        teamCode: team.teamCode,
        record: {
          gamesPlayed: team.gamesPlayed,
          wins: team.wins,
          losses: team.losses,
          ties: team.ties,
          winPercentage: team.winPercentage
        },
        stats: {
          points: team.points,
          runsFor: team.runsFor,
          runsAgainst: team.runsAgainst,
          runDifferential: team.runsFor - team.runsAgainst
        }
      })),
      lastUpdated: standingsData.lastUpdated || this.lastUpdated,
      totalTeams: standingsData.teams.length
    };
  }

  // Format schedule data
  formatSchedule(scheduleData) {
    if (!scheduleData || !scheduleData.teamGames) {
      return {
        teamSchedules: {},
        allGames: [],
        lastUpdated: this.lastUpdated,
        error: 'No schedule data available'
      };
    }

    const formattedTeamSchedules = {};
    
    // Format individual team schedules
    for (const [teamCode, teamSchedule] of Object.entries(scheduleData.teamGames)) {
      formattedTeamSchedules[teamCode] = {
        teamCode: teamCode,
        totalGames: teamSchedule.allGames.length,
        playedGames: teamSchedule.playedGames.length,
        upcomingGames: teamSchedule.upcomingGames.length,
        recentGames: this.formatGames(teamSchedule.playedGames.slice(-5)), // Last 5 games
        nextGames: this.formatGames(teamSchedule.upcomingGames.slice(0, 5)), // Next 5 games
        lastUpdated: teamSchedule.lastUpdated
      };
    }

    return {
      teamSchedules: formattedTeamSchedules,
      allGames: this.formatGames(scheduleData.allGames),
      recentGames: this.getRecentGames(scheduleData.allGames, 10),
      upcomingGames: this.getUpcomingGames(scheduleData.allGames, 10),
      lastUpdated: scheduleData.lastUpdated || this.lastUpdated,
      totalGames: scheduleData.allGames.length
    };
  }

  // Format individual games
  formatGames(games) {
    if (!games || !Array.isArray(games)) return [];

    return games.map(game => ({
      date: game.date,
      dateText: game.dateText,
      time: game.time,
      homeTeam: game.homeTeam,
      homeTeamCode: game.homeTeamCode,
      awayTeam: game.awayTeam,
      awayTeamCode: game.awayTeamCode,
      location: game.location,
      isCompleted: game.isCompleted,
      score: game.isCompleted ? {
        home: game.homeScore,
        away: game.awayScore,
        scoreText: game.scoreText
      } : null
    }));
  }

  // Get recent completed games
  getRecentGames(allGames, limit = 10) {
    const now = new Date();
    return allGames
      .filter(game => game.isCompleted || (game.date && new Date(game.date) < now))
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .slice(0, limit)
      .map(game => this.formatGames([game])[0]);
  }

  // Get upcoming games
  getUpcomingGames(allGames, limit = 10) {
    const now = new Date();
    return allGames
      .filter(game => {
        // Only show games with future dates, regardless of completion status
        return game.date && new Date(game.date) >= now;
      })
      .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0))
      .slice(0, limit)
      .map(game => this.formatGames([game])[0]);
  }

  // Generate summary statistics for a division
  generateDivisionSummary(standingsData, scheduleData) {
    const summary = {
      totalTeams: 0,
      totalGames: 0,
      completedGames: 0,
      upcomingGames: 0,
      topTeam: null,
      highestScoringGame: null,
      lastUpdated: this.lastUpdated
    };

    // Standings summary
    if (standingsData && standingsData.teams) {
      summary.totalTeams = standingsData.teams.length;
      
      // Find top team (highest win percentage)
      const topTeam = standingsData.teams
        .sort((a, b) => parseFloat(b.winPercentage) - parseFloat(a.winPercentage))[0];
      
      if (topTeam) {
        summary.topTeam = {
          team: topTeam.team,
          teamCode: topTeam.teamCode,
          wins: topTeam.wins,
          losses: topTeam.losses,
          winPercentage: topTeam.winPercentage
        };
      }
    }

    // Schedule summary
    if (scheduleData && scheduleData.allGames) {
      summary.totalGames = scheduleData.allGames.length;
      summary.completedGames = scheduleData.allGames.filter(game => game.isCompleted).length;
      summary.upcomingGames = summary.totalGames - summary.completedGames;

      // Find highest scoring game
      const completedGames = scheduleData.allGames.filter(game => game.isCompleted);
      if (completedGames.length > 0) {
        const highestScoring = completedGames
          .map(game => ({
            ...game,
            totalRuns: (game.homeScore || 0) + (game.awayScore || 0)
          }))
          .sort((a, b) => b.totalRuns - a.totalRuns)[0];

        if (highestScoring && highestScoring.totalRuns > 0) {
          summary.highestScoringGame = {
            homeTeam: highestScoring.homeTeam,
            awayTeam: highestScoring.awayTeam,
            homeScore: highestScoring.homeScore,
            awayScore: highestScoring.awayScore,
            totalRuns: highestScoring.totalRuns,
            date: highestScoring.dateText,
            location: highestScoring.location
          };
        }
      }
    }

    return summary;
  }

  // Format data for quick API consumption (lighter format)
  formatForAPI(allDivisionData) {
    const apiData = {
      lastUpdated: this.lastUpdated,
      divisions: {}
    };

    for (const [divisionKey, tierData] of Object.entries(allDivisionData)) {
      const [division, tier] = divisionKey.split('-');
      const reconstructedTier = divisionKey.substring(division.length + 1);
      
      if (!apiData.divisions[division]) {
        apiData.divisions[division] = {};
      }

      // Simplified format for API
      apiData.divisions[division][reconstructedTier] = {
        standings: tierData.standings?.teams?.map(team => ({
          pos: team.position,
          team: team.team,
          code: team.teamCode,
          w: team.wins,
          l: team.losses,
          t: team.ties,
          pct: team.winPercentage,
          rf: team.runsFor,
          ra: team.runsAgainst
        })) || [],
        recentGames: this.getRecentGames(tierData.schedule?.allGames || [], 5),
        nextGames: this.getUpcomingGames(tierData.schedule?.allGames || [], 5)
      };
    }

    return apiData;
  }

  // Generate a compact summary for dashboard
  generateDashboardSummary(allDivisionData) {
    const totalTeams = Object.values(allDivisionData)
      .reduce((sum, tierData) => sum + (tierData.standings?.teams?.length || 0), 0);
    
    const totalGames = Object.values(allDivisionData)
      .reduce((sum, tierData) => sum + (tierData.schedule?.allGames?.length || 0), 0);

    const allGames = Object.values(allDivisionData)
      .flatMap(tierData => tierData.schedule?.allGames || []);

    const completedGames = allGames.filter(game => game.isCompleted).length;

    return {
      lastUpdated: this.lastUpdated,
      totals: {
        divisions: Object.keys(allDivisionData).length,
        teams: totalTeams,
        games: totalGames,
        completed: completedGames,
        upcoming: totalGames - completedGames
      },
      recentActivity: this.getRecentGames(allGames, 5),
      upcomingGames: this.getUpcomingGames(allGames, 5)
    };
  }
}

module.exports = DataFormatter;