const fs = require('fs').promises;
const path = require('path');
const OpenAI = require('openai');

class AIStoryService {
    constructor() {
        this.aiProvider = process.env.AI_PROVIDER || 'openai'; // configurable AI provider
        this.storyUpdateFrequency = process.env.STORY_UPDATE_FREQUENCY || '24h'; // configurable frequency
        this.storiesPath = path.join(__dirname, 'data', 'ai-stories.json');
        
        // Initialize AI client based on provider
        this.initializeAIClient();
    }
    
    initializeAIClient() {
        if (this.aiProvider === 'openai') {
            // OpenAI integration
            this.apiKey = process.env.OPENAI_API_KEY;
            if (!this.apiKey) {
                console.warn('⚠️ OpenAI API key not found. AI stories will be disabled.');
                return;
            }
            this.openai = new OpenAI({
                apiKey: this.apiKey,
            });
        } else if (this.aiProvider === 'claude') {
            // Claude integration (for future)
            this.apiKey = process.env.CLAUDE_API_KEY;
            if (!this.apiKey) {
                console.warn('⚠️ Claude API key not found. AI stories will be disabled.');
                return;
            }
        }
        
        console.log(`🤖 AI Story Service initialized with ${this.aiProvider.toUpperCase()}`);
    }
    
    async generateStories() {
        try {
            console.log('🔍 Analyzing YSBA data for story generation...');
            
            // Load all the data we need
            const standingsData = await this.loadStandingsData();
            const scheduleData = await this.loadScheduleData();
            
            if (!standingsData || !scheduleData) {
                console.warn('⚠️ Insufficient data for story generation');
                return null;
            }
            
            // Analyze the data to find interesting stories
            const storyOpportunities = this.analyzeDataForStories(standingsData, scheduleData);
            
            // Generate stories using AI
            const stories = await this.generateAIStories(storyOpportunities);
            
            // Save the stories
            await this.saveStories(stories);
            
            console.log(`✨ Generated ${stories.length} AI stories`);
            return stories;
            
        } catch (error) {
            console.error('❌ Error generating AI stories:', error);
            return null;
        }
    }
    
    async loadStandingsData() {
        try {
            const data = await fs.readFile(path.join(__dirname, 'public', 'ysba-standings.json'), 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error loading standings data:', error);
            return null;
        }
    }
    
    async loadScheduleData() {
        try {
            // Load recent games from index file
            const data = await fs.readFile(path.join(__dirname, 'public', 'ysba-index.json'), 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error loading schedule data:', error);
            return null;
        }
    }
    
    analyzeDataForStories(standingsData, scheduleData) {
        const stories = [];
        
        // Find undefeated teams
        const undefeatedTeams = this.findUndefeatedTeams(standingsData);
        console.log(`📊 Found ${undefeatedTeams.length} undefeated teams`);
        stories.push(...undefeatedTeams);
        
        // Find teams on winning streaks
        const winStreaks = this.findWinningStreaks(standingsData, scheduleData);
        console.log(`📊 Found ${winStreaks.length} teams on hot streaks`);
        stories.push(...winStreaks);
        
        // Find close games and comebacks
        const closeGames = this.findCloseGames(scheduleData);
        console.log(`📊 Found ${closeGames.length} close games`);
        stories.push(...closeGames);
        
        // Find blowouts and shutouts
        const blowouts = this.findBlowouts(scheduleData);
        console.log(`📊 Found ${blowouts.length} blowout games`);
        stories.push(...blowouts);
        
        // Find first wins or breakthrough moments
        const breakthroughs = this.findBreakthroughs(standingsData, scheduleData);
        console.log(`📊 Found ${breakthroughs.length} breakthrough moments`);
        stories.push(...breakthroughs);
        
        // Find shutout games
        const shutouts = this.findShutouts(standingsData);
        console.log(`📊 Found ${shutouts.length} recent shutout performances`);
        stories.push(...shutouts);
        
        // Find scoring machines (high-scoring teams)
        const scoringMachines = this.findScoringMachines(standingsData);
        console.log(`📊 Found ${scoringMachines.length} scoring machines`);
        stories.push(...scoringMachines);
        
        // Find tight races (close standings)
        const tightRaces = this.findTightRaces(standingsData);
        console.log(`📊 Found ${tightRaces.length} tight division races`);
        stories.push(...tightRaces);
        
        console.log(`📊 Total story opportunities: ${stories.length}`);
        
        // Sort by priority but ensure variety - group by type first
        const storiesByType = {};
        stories.forEach(story => {
            if (!storiesByType[story.type]) {
                storiesByType[story.type] = [];
            }
            storiesByType[story.type].push(story);
        });
        
        // Sort each type by priority
        Object.keys(storiesByType).forEach(type => {
            storiesByType[type].sort((a, b) => b.priority - a.priority);
        });
        
        // Create balanced selection - max 3 of each type, avoiding duplicate teams
        const balancedStories = [];
        const maxPerType = 3;
        const usedTeams = new Set();
        
        Object.keys(storiesByType).forEach(type => {
            const typeStories = storiesByType[type];
            const uniqueTypeStories = [];
            
            for (const story of typeStories) {
                const teamKey = story.team || story.leader || story.winner || 'unknown';
                if (!usedTeams.has(teamKey) && uniqueTypeStories.length < maxPerType) {
                    uniqueTypeStories.push(story);
                    usedTeams.add(teamKey);
                }
            }
            
            balancedStories.push(...uniqueTypeStories);
        });
        
        // Sort by priority and return top stories
        return balancedStories
            .sort((a, b) => b.priority - a.priority)
            .slice(0, 14); // Keep exactly 14 stories for new layout (5 rows)
    }
    
    findUndefeatedTeams(standingsData) {
        const undefeated = [];
        
        if (standingsData.divisions) {
            Object.entries(standingsData.divisions).forEach(([divisionKey, division]) => {
                if (division.tiers) {
                    Object.entries(division.tiers).forEach(([tierKey, tier]) => {
                        if (tier.teams) {
                            tier.teams.forEach(team => {
                                if (team.l === 0 && team.w >= 3) {
                                    undefeated.push({
                                        type: 'undefeated',
                                        priority: 9,
                                        team: team.team,
                                        record: `${team.w}-${team.l}${team.t ? `-${team.t}` : ''}`,
                                        division: this.formatDivisionName(divisionKey, tierKey, division.displayName),
                                        data: team
                                    });
                                }
                            });
                        }
                    });
                }
            });
        }
        
        return undefeated;
    }
    
    findWinningStreaks(standingsData, scheduleData) {
        // This would require more detailed game-by-game analysis
        // For now, return teams with high win percentages (but exclude undefeated teams to avoid duplicates)
        const streaks = [];
        
        if (standingsData.divisions) {
            Object.entries(standingsData.divisions).forEach(([divisionKey, division]) => {
                if (division.tiers) {
                    Object.entries(division.tiers).forEach(([tierKey, tier]) => {
                        if (tier.teams) {
                            tier.teams.forEach(team => {
                                const totalGames = team.w + team.l + (team.t || 0);
                                const winPct = totalGames > 0 ? team.w / totalGames : 0;
                                
                                // Exclude undefeated teams (they get their own story type) and only include teams with high win percentage
                                if (winPct >= 0.8 && team.w >= 4 && team.l > 0) {
                                    streaks.push({
                                        type: 'hot_streak',
                                        priority: 7,
                                        team: team.team,
                                        record: `${team.w}-${team.l}${team.t ? `-${team.t}` : ''}`,
                                        division: this.formatDivisionName(divisionKey, tierKey, division.displayName),
                                        winPct: winPct,
                                        data: team
                                    });
                                }
                            });
                        }
                    });
                }
            });
        }
        
        return streaks;
    }
    
    findCloseGames(scheduleData) {
        const closeGames = [];
        
        if (scheduleData.divisions) {
            Object.entries(scheduleData.divisions).forEach(([divisionKey, division]) => {
                if (division.recentGames) {
                    division.recentGames.slice(0, 10).forEach(game => {
                        const scoreDiff = Math.abs(game.homeScore - game.awayScore);
                        if (scoreDiff <= 2 && game.homeScore > 0 && game.awayScore > 0) {
                            // Extract tier key from division key (e.g., "8U-rep-tier-1" -> "rep-tier-1")
                            const tierKey = divisionKey.includes('-') ? divisionKey.split('-').slice(1).join('-') : 'no-tier';
                            closeGames.push({
                                type: 'close_game',
                                priority: 6,
                                homeTeam: game.homeTeam,
                                awayTeam: game.awayTeam,
                                homeScore: game.homeScore,
                                awayScore: game.awayScore,
                                division: this.formatDivisionName(divisionKey, tierKey, division.displayName),
                                date: game.date,
                                data: game
                            });
                        }
                    });
                }
            });
        }
        
        return closeGames.slice(0, 2); // Limit close games
    }
    
    findBlowouts(scheduleData) {
        const blowouts = [];
        
        if (scheduleData.divisions) {
            Object.entries(scheduleData.divisions).forEach(([divisionKey, division]) => {
                if (division.recentGames) {
                    division.recentGames.slice(0, 10).forEach(game => {
                        const scoreDiff = Math.abs(game.homeScore - game.awayScore);
                        if (scoreDiff >= 10 && game.homeScore > 0 && game.awayScore > 0) {
                            // Extract tier key from division key (e.g., "8U-rep-tier-1" -> "rep-tier-1")
                            const tierKey = divisionKey.includes('-') ? divisionKey.split('-').slice(1).join('-') : 'no-tier';
                            blowouts.push({
                                type: 'blowout',
                                priority: 5,
                                winner: game.homeScore > game.awayScore ? game.homeTeam : game.awayTeam,
                                loser: game.homeScore > game.awayScore ? game.awayTeam : game.homeTeam,
                                score: `${Math.max(game.homeScore, game.awayScore)}-${Math.min(game.homeScore, game.awayScore)}`,
                                division: this.formatDivisionName(divisionKey, tierKey, division.displayName),
                                date: game.date,
                                data: game
                            });
                        }
                    });
                }
            });
        }
        
        return blowouts.slice(0, 1); // Limit blowouts
    }
    
    findBreakthroughs(standingsData, scheduleData) {
        const breakthroughs = [];
        
        if (standingsData.divisions) {
            Object.entries(standingsData.divisions).forEach(([divisionKey, division]) => {
                if (division.tiers) {
                    Object.entries(division.tiers).forEach(([tierKey, tier]) => {
                        if (tier.teams) {
                            tier.teams.forEach(team => {
                                // First wins (teams with exactly 1 win and multiple losses)
                                if (team.w === 1 && team.l >= 3) {
                                    breakthroughs.push({
                                        type: 'first_win',
                                        priority: 4,
                                        team: team.team,
                                        record: `${team.w}-${team.l}${team.t ? `-${team.t}` : ''}`,
                                        division: this.formatDivisionName(divisionKey, tierKey, division.displayName),
                                        data: team
                                    });
                                }
                                // Breakthrough moments for teams getting their second win after struggling
                                else if (team.w === 2 && team.l >= 4) {
                                    breakthroughs.push({
                                        type: 'breakthrough',
                                        priority: 3,
                                        team: team.team,
                                        record: `${team.w}-${team.l}${team.t ? `-${team.t}` : ''}`,
                                        division: this.formatDivisionName(divisionKey, tierKey, division.displayName),
                                        data: team
                                    });
                                }
                                // Teams showing improvement (getting to .500 or better after early struggles)
                                else if (team.w >= team.l && team.l >= 3 && team.w >= 3) {
                                    const totalGames = team.w + team.l + (team.t || 0);
                                    if (totalGames >= 6) {
                                        breakthroughs.push({
                                            type: 'turnaround',
                                            priority: 3,
                                            team: team.team,
                                            record: `${team.w}-${team.l}${team.t ? `-${team.t}` : ''}`,
                                            division: this.formatDivisionName(divisionKey, tierKey, division.displayName),
                                            data: team
                                        });
                                    }
                                }
                            });
                        }
                    });
                }
            });
        }
        
        return breakthroughs;
    }
    
    findShutouts(standingsData) {
        const shutouts = [];
        
        if (standingsData.divisions) {
            Object.entries(standingsData.divisions).forEach(([divisionKey, division]) => {
                if (division.tiers) {
                    Object.entries(division.tiers).forEach(([tierKey, tier]) => {
                        if (tier.teams) {
                            tier.teams.forEach(team => {
                                // Teams with very low runs against (potential shutout artists)
                                const totalGames = team.w + team.l + (team.t || 0);
                                if (totalGames >= 3 && team.ra <= 10 && team.w >= 2) {
                                    shutouts.push({
                                        type: 'shutout_artist',
                                        priority: 6,
                                        team: team.team,
                                        record: `${team.w}-${team.l}${team.t ? `-${team.t}` : ''}`,
                                        runsAgainst: team.ra,
                                        division: this.formatDivisionName(divisionKey, tierKey, division.displayName),
                                        data: team
                                    });
                                }
                            });
                        }
                    });
                }
            });
        }
        
        return shutouts.slice(0, 2); // Limit shutout stories
    }
    
    findScoringMachines(standingsData) {
        const scoringMachines = [];
        
        if (standingsData.divisions) {
            Object.entries(standingsData.divisions).forEach(([divisionKey, division]) => {
                if (division.tiers) {
                    Object.entries(division.tiers).forEach(([tierKey, tier]) => {
                        if (tier.teams) {
                            tier.teams.forEach(team => {
                                // Teams scoring lots of runs
                                const totalGames = team.w + team.l + (team.t || 0);
                                const runsPerGame = totalGames > 0 ? team.rf / totalGames : 0;
                                
                                if (totalGames >= 3 && runsPerGame >= 10 && team.rf >= 50) {
                                    scoringMachines.push({
                                        type: 'scoring_machine',
                                        priority: 5,
                                        team: team.team,
                                        record: `${team.w}-${team.l}${team.t ? `-${team.t}` : ''}`,
                                        runsFor: team.rf,
                                        runsPerGame: runsPerGame.toFixed(1),
                                        division: this.formatDivisionName(divisionKey, tierKey, division.displayName),
                                        data: team
                                    });
                                }
                            });
                        }
                    });
                }
            });
        }
        
        return scoringMachines.slice(0, 2);
    }
    
    findTightRaces(standingsData) {
        const tightRaces = [];
        
        if (standingsData.divisions) {
            Object.entries(standingsData.divisions).forEach(([divisionKey, division]) => {
                if (division.tiers) {
                    Object.entries(division.tiers).forEach(([tierKey, tier]) => {
                        if (tier.teams && tier.teams.length >= 3) {
                            // Sort teams by wins to find close races
                            const sortedTeams = [...tier.teams].sort((a, b) => b.w - a.w);
                            
                            // Check if top teams have close records
                            if (sortedTeams.length >= 2) {
                                const leader = sortedTeams[0];
                                const secondPlace = sortedTeams[1];
                                
                                // Close race if win difference is 1 or less
                                if (leader.w - secondPlace.w <= 1 && leader.w >= 3) {
                                    tightRaces.push({
                                        type: 'tight_race',
                                        priority: 6,
                                        leader: leader.team,
                                        secondPlace: secondPlace.team,
                                        leaderRecord: `${leader.w}-${leader.l}${leader.t ? `-${leader.t}` : ''}`,
                                        secondRecord: `${secondPlace.w}-${secondPlace.l}${secondPlace.t ? `-${secondPlace.t}` : ''}`,
                                        division: this.formatDivisionName(divisionKey, tierKey, division.displayName),
                                        data: { leader, secondPlace }
                                    });
                                }
                            }
                        }
                    });
                }
            });
        }
        
        return tightRaces.slice(0, 2);
    }
    
    formatDivisionName(divisionKey, tierKey, displayName) {
        // Add Rep/Select designation to division names with tier info for Rep
        if (tierKey.includes('rep')) {
            // Extract tier information for Rep divisions
            if (tierKey.includes('tier-1')) {
                return `${displayName} Rep AAA`;
            } else if (tierKey.includes('tier-2')) {
                return `${displayName} Rep AA`;
            } else if (tierKey.includes('tier-3')) {
                return `${displayName} Rep A`;
            } else if (tierKey.includes('no-tier')) {
                return `${displayName} Rep`;
            } else {
                return `${displayName} Rep`;
            }
        } else if (tierKey.includes('select')) {
            return `${displayName} Select`;
        }
        return displayName || 'Unknown Division';
    }
    
    isPitchingMachineDivision(divisionName) {
        // Check if division is 9U or below (uses pitching machine, no pitchers)
        const ageMatch = divisionName.match(/(\d+)U/);
        if (ageMatch) {
            const age = parseInt(ageMatch[1]);
            return age <= 9;
        }
        return false;
    }
    
    async generateAIStories(storyOpportunities) {
        if (!this.apiKey) {
            console.warn('⚠️ No AI API key available, using fallback stories');
            return this.generateFallbackStories(storyOpportunities);
        }
        
        try {
            if (this.aiProvider === 'openai') {
                return await this.generateOpenAIStories(storyOpportunities);
            } else if (this.aiProvider === 'claude') {
                return await this.generateClaudeStories(storyOpportunities);
            }
        } catch (error) {
            console.error('❌ AI story generation failed, using fallback:', error);
            return this.generateFallbackStories(storyOpportunities);
        }
    }
    
    async generateOpenAIStories(storyOpportunities) {
        const stories = [];
        
        for (const opportunity of storyOpportunities.slice(0, 14)) {
            try {
                const prompt = this.createPrompt(opportunity);
                
                // Debug: log first few prompts to see what we're sending
                if (stories.length < 3) {
                    console.log(`🔍 Prompt ${stories.length + 1}: "${prompt}"`);
                }
                
                const completion = await this.openai.chat.completions.create({
                    model: 'gpt-3.5-turbo',
                    messages: [
                        {
                            role: 'system',
                            content: 'You are a youth sports journalist writing exciting headlines and short stories for a local baseball league. Write in an enthusiastic but appropriate tone for youth sports. Keep stories 1-3 sentences. Format: First line should be the headline, then a blank line, then the story body. IMPORTANT: For divisions 9U and below, do NOT mention pitching or pitchers - these divisions use pitching machines. Focus on fielding, hitting, and teamwork instead. NEVER use markdown formatting like **bold** or *italics* - write in plain text only.'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    max_tokens: 150,
                    temperature: 0.8
                });
                
                if (completion.choices && completion.choices[0] && completion.choices[0].message) {
                    const content = completion.choices[0].message.content.trim();
                    const lines = content.split('\n').filter(line => line.trim());
                    
                    // Improved parsing - if first line is too long, it might contain both headline and body
                    let headline = lines[0] || 'Exciting YSBA Action!';
                    let body = lines.slice(1).join(' ') || 'Great baseball action in the YSBA!';
                    
                    // If headline is suspiciously long (over 100 chars), try to split it
                    if (headline.length > 100) {
                        // Look for sentence breaks in the headline
                        const sentences = headline.split(/[.!?]+/);
                        if (sentences.length > 1) {
                            headline = sentences[0].trim() + (sentences[0].endsWith('.') ? '' : '!');
                            body = sentences.slice(1).join('. ').trim() + (body ? ' ' + body : '');
                        }
                    }
                    
                    // Allow headlines to be their full length
                    // Headlines will wrap in the UI as needed
                    
                    // Clean up any markdown formatting and quotes
                    const cleanHeadline = headline
                        .replace(/^["']|["']$/g, '') // Remove quotes
                        .replace(/\*\*(.*?)\*\*/g, '$1') // Remove **bold**
                        .replace(/\*(.*?)\*/g, '$1') // Remove *italics*
                        .replace(/#{1,6}\s*/g, '') // Remove # headers
                        .trim();
                    
                    const cleanBody = body
                        .replace(/^["']|["']$/g, '') // Remove quotes
                        .replace(/\*\*(.*?)\*\*/g, '$1') // Remove **bold**
                        .replace(/\*(.*?)\*/g, '$1') // Remove *italics*
                        .replace(/#{1,6}\s*/g, '') // Remove # headers
                        .trim();
                    
                    stories.push({
                        id: `story_${Date.now()}_${stories.length}`,
                        headline: cleanHeadline,
                        body: cleanBody,
                        type: opportunity.type,
                        division: opportunity.division,
                        priority: opportunity.priority,
                        generatedAt: new Date().toISOString(),
                        source: 'openai'
                    });
                }
                
                // Small delay to respect rate limits
                await new Promise(resolve => setTimeout(resolve, 500)); // Increase delay to avoid rate limits
                
            } catch (error) {
                console.error('Error generating story for opportunity:', opportunity, error);
            }
        }
        
        return stories;
    }
    
    async generateClaudeStories(storyOpportunities) {
        // Placeholder for Claude API integration
        console.log('Claude integration not yet implemented, using fallback');
        return this.generateFallbackStories(storyOpportunities);
    }
    
    createPrompt(opportunity) {
        switch (opportunity.type) {
            case 'undefeated':
                return `Write a punchy sports headline and 1-2 sentence story about ${opportunity.team} staying undefeated with a ${opportunity.record} record in ${opportunity.division}. Make it exciting but appropriate for youth sports.`;
            
            case 'hot_streak':
                return `Write a punchy sports headline and 1-2 sentence story about ${opportunity.team} being on fire with a ${opportunity.record} record in ${opportunity.division}. Make it exciting but appropriate for youth sports.`;
            
            case 'close_game':
                return `Write a punchy sports headline and 1-2 sentence story about a nail-biter between ${opportunity.homeTeam} and ${opportunity.awayTeam} that ended ${opportunity.homeScore}-${opportunity.awayScore} in ${opportunity.division}. Make it exciting but appropriate for youth sports.`;
            
            case 'blowout':
                return `Write a punchy sports headline and 1-2 sentence story about ${opportunity.winner} dominating ${opportunity.loser} ${opportunity.score} in ${opportunity.division}. Make it exciting but appropriate for youth sports.`;
            
            case 'first_win':
                return `Write a punchy sports headline and 1-2 sentence story about ${opportunity.team} getting their breakthrough first win of the season in ${opportunity.division}. Make it exciting and celebratory but appropriate for youth sports.`;
            
            case 'breakthrough':
                return `Write a punchy sports headline and 1-2 sentence story about ${opportunity.team} building momentum with their second win and a ${opportunity.record} record in ${opportunity.division}. Focus on their perseverance and improvement. Make it exciting but appropriate for youth sports.`;
            
            case 'turnaround':
                return `Write a punchy sports headline and 1-2 sentence story about ${opportunity.team}'s impressive turnaround, reaching a ${opportunity.record} record after early struggles in ${opportunity.division}. Focus on their resilience and teamwork. Make it exciting but appropriate for youth sports.`;
            
            case 'shutout_artist':
                // Check if this is a pitching machine division (9U and below)
                const isPitchingMachine = this.isPitchingMachineDivision(opportunity.division);
                const defenseType = isPitchingMachine ? 'fielding and defensive' : 'pitching and defensive';
                return `Write a punchy sports headline and 1-2 sentence story about ${opportunity.team}'s incredible defense, allowing only ${opportunity.runsAgainst} runs in their ${opportunity.record} season in ${opportunity.division}. Focus on their ${defenseType} prowess. Make it exciting but appropriate for youth sports.`;
            
            case 'scoring_machine':
                return `Write a punchy sports headline and 1-2 sentence story about ${opportunity.team}'s explosive offense, scoring ${opportunity.runsFor} runs (${opportunity.runsPerGame} per game) with their ${opportunity.record} record in ${opportunity.division}. Focus on their hitting and offensive power. Make it exciting but appropriate for youth sports.`;
            
            case 'tight_race':
                return `Write a punchy sports headline and 1-2 sentence story about the nail-biting division race between ${opportunity.leader} (${opportunity.leaderRecord}) and ${opportunity.secondPlace} (${opportunity.secondRecord}) in ${opportunity.division}. Focus on how close and competitive the race is. Make it exciting but appropriate for youth sports.`;
            
            default:
                return `Write a punchy sports headline and 1-2 sentence story about exciting baseball action in ${opportunity.division}. Make it exciting but appropriate for youth sports.`;
        }
    }
    
    generateFallbackStories(storyOpportunities) {
        const fallbackStories = [
            {
                id: `fallback_${Date.now()}_1`,
                headline: "YSBA Action Heats Up!",
                body: "Exciting games across all divisions as teams battle for playoff positioning.",
                type: "general",
                division: "All Divisions",
                priority: 5,
                generatedAt: new Date().toISOString(),
                source: "fallback"
            },
            {
                id: `fallback_${Date.now()}_2`,
                headline: "Championship Dreams Alive",
                body: "Multiple teams remain in contention as the season reaches its most exciting phase.",
                type: "general", 
                division: "All Divisions",
                priority: 4,
                generatedAt: new Date().toISOString(),
                source: "fallback"
            },
            {
                id: `fallback_${Date.now()}_3`,
                headline: "Thrilling Matchups Continue",
                body: "Close games and exciting plays highlight another week of competitive YSBA baseball.",
                type: "general",
                division: "All Divisions",
                priority: 4,
                generatedAt: new Date().toISOString(),
                source: "fallback"
            },
            {
                id: `fallback_${Date.now()}_4`,
                headline: "Young Athletes Shine Bright",
                body: "Outstanding performances and great sportsmanship on display across all YSBA divisions.",
                type: "general",
                division: "All Divisions",
                priority: 3,
                generatedAt: new Date().toISOString(),
                source: "fallback"
            },
            {
                id: `fallback_${Date.now()}_5`,
                headline: "Season Reaching Peak Excitement",
                body: "Every game matters as teams push toward the playoffs in thrilling YSBA action.",
                type: "general",
                division: "All Divisions",
                priority: 3,
                generatedAt: new Date().toISOString(),
                source: "fallback"
            }
        ];
        
        // Add specific stories based on opportunities (up to 9 more to reach 14 total)
        storyOpportunities.slice(0, 9).forEach((opp, index) => {
            let headline, body;
            
            switch(opp.type) {
                case 'undefeated':
                    headline = `${opp.team} Stays Perfect!`;
                    body = `The ${opp.team} continue their undefeated season with a stellar ${opp.record} record.`;
                    break;
                case 'first_win':
                    headline = `${opp.team} Celebrates First Victory!`;
                    body = `The ${opp.team} earned their first win of the season, bringing smiles and high-fives all around.`;
                    break;
                case 'breakthrough':
                    headline = `${opp.team} Building Momentum!`;
                    body = `The ${opp.team} continue to improve with their latest victory and ${opp.record} record.`;
                    break;
                case 'turnaround':
                    headline = `${opp.team} Shows Great Resilience!`;
                    body = `The ${opp.team} have turned things around with strong play and teamwork.`;
                    break;
                case 'hot_streak':
                    headline = `${opp.team} On Fire!`;
                    body = `The ${opp.team} are red-hot with their impressive ${opp.record} record.`;
                    break;
                default:
                    headline = `${opp.team || 'Teams'} Making Headlines!`;
                    body = `Great baseball action continues in ${opp.division}.`;
            }
            
            fallbackStories.push({
                id: `fallback_${Date.now()}_${index + 6}`,
                headline,
                body,
                type: opp.type || 'general',
                division: opp.division || 'All Divisions',
                priority: opp.priority || 3,
                generatedAt: new Date().toISOString(),
                source: "fallback"
            });
        });
        
        // Ensure we always have at least 14 stories for the layout
        while (fallbackStories.length < 14) {
            const index = fallbackStories.length;
            fallbackStories.push({
                id: `fallback_${Date.now()}_${index}`,
                headline: "YSBA Baseball Action Continues!",
                body: "Check back soon for more exciting updates from all divisions.",
                type: "general",
                division: "All Divisions",
                priority: 2,
                generatedAt: new Date().toISOString(),
                source: "fallback"
            });
        }
        
        return fallbackStories.slice(0, 14);
    }
    
    async saveStories(stories) {
        try {
            const storyData = {
                stories,
                lastUpdated: new Date().toISOString(),
                nextUpdate: this.calculateNextUpdate(),
                provider: this.aiProvider
            };
            
            await fs.writeFile(this.storiesPath, JSON.stringify(storyData, null, 2));
            console.log(`💾 Saved ${stories.length} stories to ${this.storiesPath}`);
        } catch (error) {
            console.error('Error saving stories:', error);
        }
    }
    
    async loadStories() {
        try {
            const data = await fs.readFile(this.storiesPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            // File doesn't exist or is corrupted, return empty structure
            return {
                stories: [],
                lastUpdated: null,
                nextUpdate: new Date().toISOString(),
                provider: this.aiProvider
            };
        }
    }
    
    calculateNextUpdate() {
        const now = new Date();
        const frequency = this.storyUpdateFrequency;
        
        // Parse frequency (e.g., "24h", "12h", "6h")
        const match = frequency.match(/^(\d+)([hd])$/);
        if (!match) {
            // Default to 24 hours
            now.setHours(now.getHours() + 24);
            return now.toISOString();
        }
        
        const value = parseInt(match[1]);
        const unit = match[2];
        
        if (unit === 'h') {
            now.setHours(now.getHours() + value);
        } else if (unit === 'd') {
            now.setDate(now.getDate() + value);
        }
        
        return now.toISOString();
    }
    
    async shouldUpdateStories() {
        const storyData = await this.loadStories();
        
        if (!storyData.lastUpdated) {
            return true; // Never updated
        }
        
        const nextUpdate = new Date(storyData.nextUpdate);
        const now = new Date();
        
        return now >= nextUpdate;
    }
    
    async getStoriesForDisplay() {
        const storyData = await this.loadStories();
        
        // If we should update stories, trigger background generation
        if (await this.shouldUpdateStories()) {
            console.log('⏰ Stories need updating - triggering background generation');
            this.generateStories().catch(error => {
                console.error('Background story generation failed:', error);
            });
        }
        
        // Always return existing real stories (or empty array if none exist yet)
        return storyData.stories || [];
    }
}

module.exports = AIStoryService;