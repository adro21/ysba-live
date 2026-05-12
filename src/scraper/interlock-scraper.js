const config = require('../../config');

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// The TeamSnap public API rejects requests that don't carry the SPA's
// fingerprint headers, even for "/public/..." endpoints. These are copied
// straight from the running app — no creds.
function buildHeaders() {
  const cfg = config.INTERLOCK_TEAMSNAP;
  return {
    accept: 'application/json',
    api_key: cfg.apiKey,
    authorization: 'Basic',
    'content-type': 'application/json',
    origin: cfg.referer.replace(/\/$/, ''),
    referer: cfg.referer,
    app_version_info: 'events.teamsnap.com',
    'user-agent': DEFAULT_USER_AGENT
  };
}

class InterlockScraper {
  constructor() {
    // Cache bulk JSON keyed by eventId so we don't re-download for each
    // tier in the same run. Currently only one event but easy to extend.
    this.eventCache = new Map();
  }

  // Public API mirrors YSBAScraper, so github-action-scraper.js can invoke
  // them interchangeably.
  async scrapeStandingsForDivision(division, tier) {
    const cfg = this._resolveDivision(division);
    const event = await this._loadEvent(cfg.eventId);
    return this._buildStandings(cfg, event);
  }

  async scrapeScheduleForDivision(division, tier) {
    const cfg = this._resolveDivision(division);
    const event = await this._loadEvent(cfg.eventId);
    return this._buildSchedule(cfg, event);
  }

  // Nothing to clean up — we only use fetch().
  async cleanup() {
    this.eventCache.clear();
  }

  _resolveDivision(division) {
    const divisionConfig = config.getDivisionConfig(division);
    if (!divisionConfig) {
      throw new Error(`Unknown interlock division: ${division}`);
    }
    if (!divisionConfig.tsDivisionId) {
      throw new Error(`Division ${division} is missing tsDivisionId in config`);
    }
    return {
      key: division,
      tsDivisionId: divisionConfig.tsDivisionId,
      eventId: config.INTERLOCK_TEAMSNAP.eventId,
      displayName: divisionConfig.displayName
    };
  }

  async _loadEvent(eventId) {
    if (this.eventCache.has(eventId)) {
      return this.eventCache.get(eventId);
    }

    console.log(`Fetching TeamSnap event ${eventId} payloads...`);
    const fetchPath = (suffix) => this._fetchJson(
      `${config.INTERLOCK_TEAMSNAP.apiBase}${suffix}`
    );

    const [
      participants,
      matches,
      matchParticipants,
      matchResults,
      scheduleItems,
      venues
    ] = await Promise.all([
      fetchPath(`/events/${eventId}/participants?lastUpdate=0&updatesOnly=1`),
      fetchPath(`/events/${eventId}/matches?lastUpdate=0&updatesOnly=1`),
      fetchPath(`/events/${eventId}/match-participants?lastUpdate=0&updatesOnly=1`),
      fetchPath(`/events/${eventId}/match-results?lastUpdate=0&updatesOnly=1`),
      fetchPath(`/events/${eventId}/schedule-items?lastUpdate=0&updatesOnly=1`),
      fetchPath(`/events/${eventId}/venues?lastUpdate=0`)
    ]);

    const venuesById = new Map(venues.map(v => [v.id, v]));
    const subvenuesById = new Map();
    venues.forEach(v => (v.subvenues || []).forEach(sv => subvenuesById.set(sv.id, sv)));

    const matchPartsByMatchId = new Map();
    matchParticipants.forEach(mp => {
      if (mp.deleted) return;
      const list = matchPartsByMatchId.get(mp.matchId) || [];
      list.push(mp);
      matchPartsByMatchId.set(mp.matchId, list);
    });

    const resultsByMatchId = new Map();
    matchResults.forEach(r => {
      if (r.deleted) return;
      const list = resultsByMatchId.get(r.matchId) || [];
      list.push(r);
      resultsByMatchId.set(r.matchId, list);
    });

    const scheduleByMatchId = new Map();
    scheduleItems.forEach(item => {
      if (item.deleted || !item.matchId) return;
      // A match may have multiple items if rescheduled — take the latest.
      const existing = scheduleByMatchId.get(item.matchId);
      if (!existing || (item.updatedAt || 0) > (existing.updatedAt || 0)) {
        scheduleByMatchId.set(item.matchId, item);
      }
    });

    const event = {
      participants,
      matches,
      venuesById,
      subvenuesById,
      matchPartsByMatchId,
      resultsByMatchId,
      scheduleByMatchId
    };
    this.eventCache.set(eventId, event);
    return event;
  }

  async _fetchJson(url) {
    const headers = buildHeaders();
    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`TeamSnap API ${response.status} for ${url}`);
    }
    const body = await response.json();
    if (body.error) {
      throw new Error(`TeamSnap API error for ${url}: ${body.error}`);
    }
    return Array.isArray(body.data) ? body.data : [];
  }

  _buildStandings(cfg, event) {
    const divisionParticipants = event.participants
      .filter(p => p.divisionId === cfg.tsDivisionId && !p.deleted);

    if (divisionParticipants.length === 0) {
      throw new Error(`No participants found for tsDivisionId=${cfg.tsDivisionId}`);
    }

    const teams = divisionParticipants
      .map(p => {
        const wins = p.win || 0;
        const losses = p.loss || 0;
        const ties = p.tie || 0;
        const totalGames = wins + losses + ties;
        const winPercentage = totalGames > 0
          ? (((wins + 0.5 * ties) / totalGames)).toFixed(3)
          : '.000';
        const teamName = p.nameWithIdentifier || p.team?.name || `Team ${p.id}`;
        const points = (typeof p.points === 'number') ? p.points : (wins * 2 + ties);
        return {
          // divisionRank from TeamSnap is the canonical standings position;
          // server-optimized.js re-sorts and re-numbers anyway, so this is
          // just a hint.
          position: p.divisionRank || 0,
          team: teamName,
          teamCode: String(p.id),
          gamesPlayed: totalGames,
          wins,
          losses,
          ties,
          points,
          runsFor: p.pointsFor || 0,
          runsAgainst: p.pointsAgainst || 0,
          winPercentage
        };
      })
      // Sort by divisionRank so the initial output is deterministic.
      .sort((a, b) => (a.position || 999) - (b.position || 999))
      .map((t, idx) => ({ ...t, position: t.position || idx + 1 }));

    return {
      teams,
      lastUpdated: new Date().toISOString(),
      source: 'TeamSnap (Toronto Baseball Association — Rep Interlock)'
    };
  }

  _buildSchedule(cfg, event) {
    const divisionMatches = event.matches.filter(
      m => m.divisionId === cfg.tsDivisionId && !m.deleted
    );

    const allGames = [];
    for (const match of divisionMatches) {
      const game = this._matchToGame(match, event);
      if (game) allGames.push(game);
    }

    return this._processAllGames(allGames);
  }

  _matchToGame(match, event) {
    const competitors = (event.matchPartsByMatchId.get(match.id) || [])
      .filter(mp => mp.type === 'competitor')
      .sort((a, b) => (a.number || 0) - (b.number || 0));

    if (competitors.length < 2) {
      // Bracket placeholder match without assigned teams yet — skip silently.
      return null;
    }

    // Convention: competitor #1 is the away team, #2 is home. This matches
    // the column order on the TeamSnap public results page (Team 1 vs Team 2,
    // with Team 2 listed as the host) and how the YSBA scraper labels things.
    const [away, home] = competitors;
    const awayParticipant = event.participants.find(p => p.id === away.participantId);
    const homeParticipant = event.participants.find(p => p.id === home.participantId);
    if (!awayParticipant || !homeParticipant) return null;

    const results = event.resultsByMatchId.get(match.id) || [];
    const awayResult = results.find(r => r.participantId === away.participantId);
    const homeResult = results.find(r => r.participantId === home.participantId);
    const isCompleted = !!match.completed && awayResult != null && homeResult != null;
    const awayScore = isCompleted ? (awayResult.score ?? null) : null;
    const homeScore = isCompleted ? (homeResult.score ?? null) : null;
    const scoreText = isCompleted && awayScore != null && homeScore != null
      ? `${awayScore}-${homeScore}`
      : '';

    const scheduleItem = event.scheduleByMatchId.get(match.id);
    const date = parseGameDate(scheduleItem);
    const dateText = formatDateText(scheduleItem, date);
    const timeText = formatTimeText(scheduleItem);
    const location = formatLocation(scheduleItem, event);

    const homeName = homeParticipant.nameWithIdentifier || homeParticipant.team?.name || `Team ${homeParticipant.id}`;
    const awayName = awayParticipant.nameWithIdentifier || awayParticipant.team?.name || `Team ${awayParticipant.id}`;

    return {
      date: date ? date.toISOString() : null,
      dateText,
      time: timeText,
      homeTeam: homeName,
      homeTeamCode: String(homeParticipant.id),
      awayTeam: awayName,
      awayTeamCode: String(awayParticipant.id),
      homeScore,
      awayScore,
      location,
      division: '10U AA',
      gameTier: match.gameType || '',
      isCompleted,
      scoreText
    };
  }

  // Mirrors YSBAScraper.processAllGames so formatter.js consumes identical shape.
  _processAllGames(allGames) {
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
      const playedGames = games.filter(g => g.isCompleted || (g.date && new Date(g.date) < now));
      const upcomingGames = games.filter(g => !g.isCompleted && g.date && new Date(g.date) >= now);
      teamGames[teamCode] = {
        allGames: games,
        playedGames,
        upcomingGames,
        teamCode,
        lastUpdated: new Date().toISOString()
      };
    });

    return {
      teamGames,
      allGames,
      lastUpdated: new Date().toISOString()
    };
  }
}

function parseGameDate(scheduleItem) {
  if (!scheduleItem || !scheduleItem.startDate) return null;
  // startDate is "YYYY-MM-DD" and startTime is "HH:MM:SS" in Eastern (venue-local).
  // Build a UTC timestamp anchored to America/Toronto, since this script may run
  // on a non-ET host (GitHub Actions = UTC).
  const time = scheduleItem.startTime || '00:00:00';
  const m = scheduleItem.startDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = time.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m || !t) {
    const fallback = new Date(`${scheduleItem.startDate}T${time}`);
    return isNaN(fallback.getTime()) ? null : fallback;
  }
  const year = parseInt(m[1], 10);
  const monthIdx = parseInt(m[2], 10) - 1;
  const day = parseInt(m[3], 10);
  const hh = parseInt(t[1], 10);
  const mm = parseInt(t[2], 10);
  const ss = t[3] ? parseInt(t[3], 10) : 0;
  // Get ET offset for this date (handles EDT/EST)
  let offset = 240;
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Toronto',
      timeZoneName: 'short',
      year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric'
    });
    const parts = fmt.formatToParts(new Date(Date.UTC(year, monthIdx, day, 16)));
    const tz = parts.find(p => p.type === 'timeZoneName')?.value;
    if (tz === 'EST') offset = 300;
  } catch {}
  const utcMs = Date.UTC(year, monthIdx, day, hh, mm, ss) + offset * 60 * 1000;
  const dt = new Date(utcMs);
  return isNaN(dt.getTime()) ? null : dt;
}

function formatDateText(scheduleItem, date) {
  if (date) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
  }
  return scheduleItem?.startDate || '';
}

function formatTimeText(scheduleItem) {
  if (!scheduleItem || !scheduleItem.startTime) return '';
  // Convert "HH:MM:SS" to "h:mm AM/PM"
  const [hStr, mStr] = scheduleItem.startTime.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return scheduleItem.startTime;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = ((h + 11) % 12) + 1;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function formatLocation(scheduleItem, event) {
  if (!scheduleItem) return '';
  const venue = event.venuesById.get(scheduleItem.venueId);
  const subvenue = scheduleItem.subvenueId ? event.subvenuesById.get(scheduleItem.subvenueId) : null;
  if (!venue) return '';
  const parts = [venue.name];
  if (subvenue?.name) parts.push(`Diamond ${subvenue.name}`);
  if (venue.city) parts.push(venue.city);
  return parts.join(' — ');
}

module.exports = InterlockScraper;
