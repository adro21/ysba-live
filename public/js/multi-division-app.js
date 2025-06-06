// Multi-Division YSBA Standings App
class MultiDivisionYSBAApp {
    constructor() {
        this.standingsData = null;
        this.lastUpdateTime = null;
        this.autoRefreshInterval = null;
        this.statusUpdateInterval = null;
        this.autoRefreshEnabled = true;
        this.isLoading = false;
        this.debug = localStorage.getItem('debug') === 'true';
        
        // Current division and tier from URL
        this.currentDivision = null;
        this.currentTier = null;
        this.divisionConfig = null;
        this.tierConfig = null;
        
        // Available divisions loaded from server
        this.allDivisions = {};
        
        // Division filtering (only for divisions that support it)
        this.currentDivisionFilter = 'all';
        this.divisionMapping = {};
        
        // Countdown timer instances
        this.nextRefreshCountdown = null;
        this.lastUpdatedCountdown = null;
        
        this.init();
    }

    async init() {
        // Parse current division/tier from URL
        await this.parseCurrentPath();
        
        // Load available divisions
        await this.loadAllDivisions();
        
        // Apply dynamic theming
        this.applyDynamicTheming();
        
        // Update UI elements
        this.updateUIElements();
        
        // Load standings for current division/tier
        this.loadStandings();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Start background processes
        this.startAutoRefresh();
        this.startStatusUpdates();
        this.initSubscriptionForm();
        this.updateLastYsbaUpdateTime();
    }

    async parseCurrentPath() {
        const path = window.location.pathname;
        const segments = path.split('/').filter(s => s);
        
        if (segments.length >= 2) {
            this.currentDivision = segments[0];
            this.currentTier = segments[1];
        } else {
            // Default fallback
            this.currentDivision = '9U-select';
            this.currentTier = 'all-tiers';
        }
        
        console.log(`Current division: ${this.currentDivision}, tier: ${this.currentTier}`);
    }

    async loadAllDivisions() {
        try {
            const response = await fetch('/api/divisions?filterEmpty=true');
            const result = await response.json();
            
            if (result.success) {
                this.allDivisions = result.divisions;
                this.divisionConfig = this.allDivisions[this.currentDivision];
                if (this.divisionConfig) {
                    this.tierConfig = this.divisionConfig.tiers[this.currentTier];
                    // Set division mapping if available
                    if (this.divisionConfig.divisionMapping) {
                        this.divisionMapping = this.divisionConfig.divisionMapping;
                    }
                }
                this.populateDivisionTierDropdown();
            } else {
                console.error('Failed to load divisions:', result.error);
            }
        } catch (error) {
            console.error('Error loading divisions:', error);
        }
    }

    applyDynamicTheming() {
        if (!this.divisionConfig || !this.divisionConfig.theme) return;
        
        const theme = this.divisionConfig.theme;
        const styleId = 'dynamicStyles';
        let styleElement = document.getElementById(styleId);
        
        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = styleId;
            document.head.appendChild(styleElement);
        }

        styleElement.textContent = `
            /* Dynamic theme for ${this.divisionConfig.displayName} */
            :root {
                --theme-primary: ${theme.primary};
                --theme-secondary: ${theme.secondary};
                --theme-accent: ${theme.accent};
                --theme-text: ${theme.text};
                --theme-background: ${theme.background};
            }

            .modern-header {
                background: ${theme.headerBg} !important;
            }

            .brand-subtitle-btn {
                background: ${theme.accent} !important;
                color: ${theme.text} !important;
            }

            .brand-subtitle-btn:hover {
                background: ${theme.primary} !important;
                color: white !important;
            }

            .btn-primary {
                background: ${theme.primary} !important;
                border-color: ${theme.primary} !important;
            }

            .btn-primary:hover {
                background: ${theme.secondary} !important;
                border-color: ${theme.secondary} !important;
            }

            .text-primary {
                color: ${theme.primary} !important;
            }

            .loading-spinner {
                border-top-color: ${theme.primary} !important;
            }

            .position-badge {
                background: ${theme.primary} !important;
            }

            .team-row-clickable:hover {
                background: ${theme.background} !important;
            }
        `;

        // Update theme color meta tag
        const themeColorMeta = document.getElementById('themeColor');
        if (themeColorMeta) {
            themeColorMeta.setAttribute('content', theme.primary);
        }
    }

    updateUIElements() {
        if (!this.divisionConfig || !this.tierConfig) return;

        // Update page title
        const title = `${this.divisionConfig.displayName} - ${this.tierConfig.displayName} Standings`;
        document.title = title;
        
        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle) pageTitle.textContent = title;

        // Update page description
        const pageDescription = document.getElementById('pageDescription');
        if (pageDescription) {
            pageDescription.setAttribute('content', 
                `${this.divisionConfig.displayName} ${this.tierConfig.displayName} standings - Real-time YSBA baseball standings`);
        }

        // Update current division/tier selector
        const currentDivisionTier = document.getElementById('currentDivisionTier');
        if (currentDivisionTier) {
            currentDivisionTier.textContent = `${this.divisionConfig.displayName} - ${this.tierConfig.displayName}`;
        }

        // Update footer
        const footerTitle = document.getElementById('footerTitle');
        if (footerTitle) {
            footerTitle.textContent = `${this.divisionConfig.displayName} ${this.tierConfig.displayName} Division`;
        }

        // Update notification description
        const notificationDescription = document.getElementById('notificationDescription');
        if (notificationDescription) {
            notificationDescription.textContent = 
                `Get notified when standings change for ${this.divisionConfig.displayName} ${this.tierConfig.displayName}.`;
        }

        // Show/hide division filter based on features
        const divisionFilterContainer = document.getElementById('divisionFilterContainer');
        if (divisionFilterContainer) {
            if (this.divisionConfig.features.divisionFilter) {
                divisionFilterContainer.style.display = 'block';
                this.setupDivisionFilter();
            } else {
                divisionFilterContainer.style.display = 'none';
            }
        }
    }

    populateDivisionTierDropdown() {
        const menu = document.getElementById('divisionTierMenu');
        if (!menu || !this.allDivisions) return;

        menu.innerHTML = '';

        // Group divisions by category
        const categories = {
            'Rep Divisions': [],
            'Select Divisions': []
        };

        Object.entries(this.allDivisions).forEach(([key, division]) => {
            if (key.includes('-rep')) {
                categories['Rep Divisions'].push({ key, division });
            } else if (key.includes('-select')) {
                categories['Select Divisions'].push({ key, division });
            }
        });

        Object.entries(categories).forEach(([categoryName, divisions]) => {
            if (divisions.length === 0) return;

            // Add category header
            const header = document.createElement('li');
            header.innerHTML = `<h6 class="dropdown-header">${categoryName}</h6>`;
            menu.appendChild(header);

            // Add divisions in this category
            divisions.forEach(({ key, division }) => {
                Object.entries(division.tiers).forEach(([tierKey, tier]) => {
                    const item = document.createElement('li');
                    const link = document.createElement('a');
                    link.className = 'dropdown-item';
                    link.href = `/${key}/${tierKey}`;
                    link.textContent = `${division.displayName} - ${tier.displayName}`;
                    
                    // Mark current selection as active
                    if (key === this.currentDivision && tierKey === this.currentTier) {
                        link.classList.add('active');
                    }
                    
                    item.appendChild(link);
                    menu.appendChild(item);
                });
            });

            // Add divider after each category (except last)
            const categoryEntries = Object.entries(categories);
            const isLastCategory = categoryEntries[categoryEntries.length - 1][0] === categoryName;
            if (!isLastCategory) {
                const divider = document.createElement('li');
                divider.innerHTML = '<hr class="dropdown-divider">';
                menu.appendChild(divider);
            }
        });
    }

    setupDivisionFilter() {
        const filterMenu = document.getElementById('divisionFilterMenu');
        if (!filterMenu || !this.divisionMapping) return;

        filterMenu.innerHTML = `
            <li><a class="dropdown-item" href="#" data-division="all">All Divisions</a></li>
            <li><a class="dropdown-item" href="#" data-division="north">North Division</a></li>
            <li><a class="dropdown-item" href="#" data-division="south">South Division</a></li>
        `;

        // Add event listeners for division filter
        filterMenu.querySelectorAll('.dropdown-item[data-division]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const division = e.target.getAttribute('data-division');
                
                // Close the dropdown
                const dropdown = bootstrap.Dropdown.getInstance(document.getElementById('divisionBtn'));
                if (dropdown) dropdown.hide();
                
                this.setDivisionFilter(division);
            });
        });
    }

    setupEventListeners() {
        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshStandings();
            });
        }

        // Status button - load status when modal is shown
        const statusBtn = document.getElementById('statusBtn');
        if (statusBtn) {
            statusBtn.addEventListener('click', () => {
                this.loadStatus();
                this.startStatusUpdates();
            });
        }

        // Stop status updates when modal is hidden
        const statusModal = document.getElementById('statusModal');
        if (statusModal) {
            statusModal.addEventListener('hidden.bs.modal', () => {
                this.stopStatusUpdates();
            });
        }

        // Auto-refresh when page becomes visible
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && this.shouldAutoRefresh()) {
                this.loadStandings();
            }
        });
    }

    async loadStandings(forceRefresh = false) {
        if (this.isLoading && !forceRefresh) return;

        this.isLoading = true;
        
        if (!forceRefresh) {
            this.showLoadingState();
        }

        try {
            const params = new URLSearchParams({
                division: this.currentDivision,
                tier: this.currentTier
            });
            
            if (forceRefresh) {
                params.set('refresh', 'true');
            }

            const response = await fetch(`/api/standings?${params}`);
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Failed to load standings');
            }

            if (result.success && result.data) {
                this.standingsData = result.data;
                this.lastUpdateTime = new Date(result.data.lastUpdated);
                this.displayStandings();
                this.updateLastUpdatedTime();
                this.hideError();
                this.showStandings();
                this.updateLastYsbaUpdateTime();
            } else {
                throw new Error(result.message || 'No standings data available');
            }

        } catch (error) {
            console.error('Error loading standings:', error);
            this.showError(error.message);
        } finally {
            this.isLoading = false;
            this.hideLoadingState();
        }
    }

    async refreshStandings() {
        const refreshBtn = document.getElementById('refreshBtn');
        if (!refreshBtn) return;

        const originalContent = refreshBtn.innerHTML;
        refreshBtn.innerHTML = '<div class="loading-spinner-small"></div>';
        refreshBtn.disabled = true;

        try {
            await this.loadStandings(true);
            this.showRefreshSuccess(refreshBtn, originalContent);
        } catch (error) {
            refreshBtn.innerHTML = originalContent;
            refreshBtn.disabled = false;
        }
    }

    showRefreshSuccess(refreshBtn, originalContent) {
        refreshBtn.innerHTML = '<i class="bi bi-check"></i> <span class="d-none d-md-inline">Updated</span>';
        refreshBtn.classList.remove('btn-primary');
        refreshBtn.classList.add('btn-success-state');
        
        setTimeout(() => {
            refreshBtn.innerHTML = originalContent;
            refreshBtn.disabled = false;
            refreshBtn.classList.remove('btn-success-state');
            refreshBtn.classList.add('btn-primary');
        }, 2000);
    }

    // Division filtering methods (only used if supported)
    setDivisionFilter(division) {
        if (this.currentDivisionFilter === division) return;
        
        this.currentDivisionFilter = division;
        this.updateDivisionFilterUI(division);
        this.applyDivisionFilter(division);
    }

    updateDivisionFilterUI(division) {
        // Update dropdown active state
        document.querySelectorAll('.dropdown-item[data-division]').forEach(item => {
            item.classList.remove('active');
        });
        
        const activeItem = document.querySelector(`.dropdown-item[data-division="${division}"]`);
        if (activeItem) activeItem.classList.add('active');

        // Update division button state and text
        const divisionBtn = document.getElementById('divisionBtn');
        const buttonText = divisionBtn?.querySelector('.d-none.d-lg-inline');
        
        if (division === 'all') {
            divisionBtn?.classList.remove('division-filter-active');
            if (buttonText) buttonText.textContent = 'Division';
        } else {
            divisionBtn?.classList.add('division-filter-active');
            if (buttonText) {
                const divisionName = division === 'north' ? 'North' : 'South';
                buttonText.textContent = divisionName;
            }
        }
    }

    getFilteredTeams(division) {
        if (!this.standingsData || !this.standingsData.teams) {
            return [];
        }

        if (division === 'all' || !this.divisionMapping) {
            return this.standingsData.teams;
        }

        return this.standingsData.teams.filter(team => {
            const teamDivision = this.divisionMapping[team.teamCode];
            return teamDivision === division;
        });
    }

    applyDivisionFilter(division) {
        const tbody = document.getElementById('standingsTableBody');
        const standingsTable = document.querySelector('.standings-table');
        
        if (!tbody || !standingsTable) return;
        
        const filteredTeams = this.getFilteredTeams(division);
        this.smoothUniversalTransition(standingsTable, tbody, filteredTeams);
    }

    smoothUniversalTransition(standingsTable, tbody, filteredTeams) {
        standingsTable.classList.add('filtering');
        
        const existingRows = Array.from(tbody.children);
        existingRows.forEach(row => row.classList.add('filter-hidden'));
        
        setTimeout(() => {
            this.displayFilteredStandings(this.currentDivisionFilter);
            standingsTable.classList.remove('filtering');
        }, 150);
    }

    displayFilteredStandings(division) {
        const tbody = document.getElementById('standingsTableBody');
        if (!tbody) return;
        
        const filteredTeams = this.getFilteredTeams(division);
        
        tbody.innerHTML = '';
        
        filteredTeams.forEach((team, index) => {
            const row = this.createTeamRow(team, index + 1);
            row.classList.add('filter-visible');
            row.style.opacity = '';
            row.style.transform = '';
            row.style.transition = '';
            tbody.appendChild(row);
        });

        this.initStickyHeader();
    }

    displayStandings() {
        if (!this.standingsData || !this.standingsData.teams) {
            this.showError('No standings data available');
            return;
        }

        this.displayFilteredStandings(this.currentDivisionFilter);
        if (this.divisionConfig?.features.divisionFilter) {
            this.updateDivisionFilterUI(this.currentDivisionFilter);
        }

        this.showStandings();
        
        // Show tooltips for table headers
        const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
        const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => {
            return new bootstrap.Tooltip(tooltipTriggerEl, {
                placement: 'top',
                boundary: 'viewport',
                offset: [0, 8],
                fallbackPlacements: ['bottom', 'right', 'left']
            });
        });
    }

    createTeamRow(team, position) {
        const row = document.createElement('tr');
        row.className = 'team-row-clickable';
        row.setAttribute('data-team-code', team.teamCode);
        
        // Add click handler for team schedule
        row.addEventListener('click', () => {
            this.showTeamSchedule(team.teamCode, team.team);
        });

        const winPct = parseFloat(team.winPercentage);
        let winPctClass = 'win-percentage ';
        if (winPct >= 0.75) winPctClass += 'high';
        else if (winPct >= 0.60) winPctClass += 'medium-high';
        else if (winPct >= 0.45) winPctClass += 'medium';
        else if (winPct >= 0.30) winPctClass += 'low-medium';
        else winPctClass += 'low';

        row.innerHTML = `
            <td class="pos-col">
                ${this.createPositionBadge(position)}
            </td>
            <td class="team-col">
                <div class="team-name">${this.escapeHtml(team.team)}</div>
            </td>
            <td class="stat-col">${team.gamesPlayed}</td>
            <td class="stat-col">${team.wins}</td>
            <td class="stat-col">${team.losses}</td>
            <td class="stat-col">${team.ties}</td>
            <td class="stat-col">${team.points}</td>
            <td class="stat-col">${team.runsFor}</td>
            <td class="stat-col">${team.runsAgainst}</td>
            <td class="stat-col">
                <span class="${winPctClass}">${team.winPercentage}</span>
            </td>
        `;

        return row;
    }

    createPositionBadge(position) {
        return `<span class="position-badge">${position}</span>`;
    }

    // ... [Include all the rest of the methods from the original app.js file]
    // Status, subscription, schedule, and utility methods remain the same

    async loadStatus() {
        try {
            const params = new URLSearchParams({
                division: this.currentDivision,
                tier: this.currentTier
            });
            
            const response = await fetch(`/api/status?${params}`);
            const status = await response.json();
            this.updateStatusDisplay(status);
        } catch (error) {
            console.error('Error loading status:', error);
        }
    }

    updateLastUpdatedTime() {
        const element = document.getElementById('lastUpdated');
        if (!element || !this.lastUpdateTime) return;

        const timeAgo = this.getTimeAgo(this.lastUpdateTime);
        element.textContent = timeAgo;
    }

    getTimeAgo(date) {
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 60) return 'Just now';
        if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
        if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
        return `${Math.floor(diffInSeconds / 86400)}d ago`;
    }

    shouldAutoRefresh() {
        if (!this.lastUpdateTime) return true;
        const now = new Date();
        const timeSinceUpdate = now - this.lastUpdateTime;
        return timeSinceUpdate > 5 * 60 * 1000; // 5 minutes
    }

    startAutoRefresh() {
        if (this.autoRefreshInterval) return;
        
        this.autoRefreshInterval = setInterval(() => {
            if (this.autoRefreshEnabled && !document.hidden && this.shouldAutoRefresh()) {
                this.loadStandings();
            }
        }, 30000); // Check every 30 seconds
    }

    startStatusUpdates() {
        if (this.statusUpdateInterval) return;
        
        this.statusUpdateInterval = setInterval(() => {
            this.updateLastUpdatedTime();
        }, 30000); // Update every 30 seconds
    }

    stopStatusUpdates() {
        if (this.statusUpdateInterval) {
            clearInterval(this.statusUpdateInterval);
            this.statusUpdateInterval = null;
        }
    }

    showLoadingState() {
        document.getElementById('loadingState')?.classList.add('show');
        this.hideError();
        document.getElementById('standingsContainer')?.classList.remove('show');
    }

    hideLoadingState() {
        document.getElementById('loadingState')?.classList.remove('show');
    }

    showStandings() {
        document.getElementById('standingsContainer')?.classList.add('show');
    }

    showError(message) {
        const errorAlert = document.getElementById('errorAlert');
        const errorMessage = document.getElementById('errorMessage');
        if (errorAlert && errorMessage) {
            errorMessage.textContent = message;
            errorAlert.classList.add('show');
        }
    }

    hideError() {
        document.getElementById('errorAlert')?.classList.remove('show');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Schedule modal methods
    async showTeamSchedule(teamCode, teamName) {
        const modal = new bootstrap.Modal(document.getElementById('scheduleModal'));
        document.getElementById('scheduleModalTitle').textContent = `${teamName} Schedule`;
        
        modal.show();
        this.showScheduleLoading();

        try {
            const params = new URLSearchParams({
                division: this.currentDivision,
                tier: this.currentTier
            });
            
            const response = await fetch(`/api/team/${teamCode}/schedule?${params}`);
            const result = await response.json();

            if (result.success) {
                const teamData = this.getTeamData(teamCode);
                this.displayNewSchedule(result.data, teamName, teamData);
            } else {
                this.showScheduleError(result.message || 'Unable to load schedule');
            }
        } catch (error) {
            console.error('Error loading team schedule:', error);
            this.showScheduleError('Unable to load schedule. Please try again.');
        }
    }

    showScheduleLoading() {
        document.getElementById('scheduleLoadingState')?.classList.add('show');
        document.getElementById('scheduleErrorState')?.classList.remove('show');
        document.getElementById('scheduleContent')?.classList.remove('show');
    }

    showScheduleError(message) {
        document.getElementById('scheduleLoadingState')?.classList.remove('show');
        document.getElementById('scheduleContent')?.classList.remove('show');
        
        const errorState = document.getElementById('scheduleErrorState');
        if (errorState) {
            errorState.classList.add('show');
            const errorText = errorState.querySelector('p');
            if (errorText) errorText.textContent = message;
        }
    }

    displayNewSchedule(scheduleData, teamName, teamData) {
        document.getElementById('scheduleLoadingState')?.classList.remove('show');
        document.getElementById('scheduleErrorState')?.classList.remove('show');
        document.getElementById('scheduleContent')?.classList.add('show');

        const games = scheduleData.games || [];
        
        // Team record display
        let recordText = '';
        if (teamData) {
            const winsText = teamData.wins > 0 ? `${teamData.wins}W` : '';
            const lossesText = `${teamData.losses}L`;
            const tiesText = teamData.ties > 0 ? `${teamData.ties}T` : '';
            
            const recordParts = [winsText, lossesText, tiesText].filter(part => part !== '');
            recordText = `${recordParts.join(' - ')} <span style="margin: 0 8px;">⚾</span> ${teamData.gamesPlayed} games played`;
        }

        document.getElementById('teamRecord').innerHTML = recordText;
        
        // Split games into played and upcoming
        const playedGames = games.filter(game => game.isCompleted);
        const upcomingGames = games.filter(game => !game.isCompleted);
        
        this.setupNewScheduleTabs(playedGames, upcomingGames);
        
        // Show played games by default, or upcoming if no played games
        if (playedGames.length > 0) {
            this.showNewScheduleTab('played', playedGames);
        } else if (upcomingGames.length > 0) {
            this.showNewScheduleTab('upcoming', upcomingGames);
        } else {
            this.showNewScheduleTab('played', []);
        }
    }

    setupNewScheduleTabs(playedGames, upcomingGames) {
        const tabsContainer = document.querySelector('.schedule-tabs');
        if (!tabsContainer) return;

        tabsContainer.innerHTML = `
            <button class="schedule-tab" data-tab="played">
                <i class="bi bi-check-circle"></i>
                Played (${playedGames.length})
            </button>
            <button class="schedule-tab" data-tab="upcoming">
                <i class="bi bi-calendar-event"></i>
                Upcoming (${upcomingGames.length})
            </button>
        `;

        tabsContainer.querySelectorAll('.schedule-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabType = tab.getAttribute('data-tab');
                const games = tabType === 'played' ? playedGames : upcomingGames;
                this.showNewScheduleTab(tabType, games);
            });
        });
    }

    showNewScheduleTab(tabType, games) {
        // Update tab appearance
        document.querySelectorAll('.schedule-tab').forEach(tab => {
            tab.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabType}"]`)?.classList.add('active');

        // Show games
        const gamesContainer = document.querySelector('.schedule-games');
        if (!gamesContainer) return;

        if (games.length === 0) {
            gamesContainer.innerHTML = `
                <div class="schedule-empty">
                    <i class="bi bi-calendar-x"></i>
                    <p>No ${tabType} games found</p>
                </div>
            `;
            return;
        }

        gamesContainer.innerHTML = games.map(game => this.createNewGameCard(game)).join('');
    }

    createNewGameCard(game) {
        // Determine if this team is home or away and the opponent
        const isHome = game.homeTeamCode === this.getTeamData(game.homeTeamCode || game.awayTeamCode)?.teamCode;
        const opponent = isHome ? game.awayTeam : game.homeTeam;
        const location = game.location || 'TBD';
        
        // Game result logic
        let resultClass = 'no-result';
        let resultText = 'No Result';
        
        if (game.isCompleted && game.homeScore !== null && game.awayScore !== null) {
            if (isHome) {
                if (game.homeScore > game.awayScore) {
                    resultClass = 'win';
                    resultText = 'W';
                } else if (game.homeScore < game.awayScore) {
                    resultClass = 'loss';
                    resultText = 'L';
                } else {
                    resultClass = 'tie';
                    resultText = 'T';
                }
            } else {
                if (game.awayScore > game.homeScore) {
                    resultClass = 'win';
                    resultText = 'W';
                } else if (game.awayScore < game.homeScore) {
                    resultClass = 'loss';
                    resultText = 'L';
                } else {
                    resultClass = 'tie';
                    resultText = 'T';
                }
            }
            resultClass = 'completed ' + resultClass;
        } else if (!game.isCompleted) {
            resultClass = 'upcoming';
            resultText = game.time || 'TBD';
        }

        // Format date
        let formattedDate = 'TBD';
        if (game.date) {
            const gameDate = new Date(game.date);
            formattedDate = gameDate.toLocaleDateString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric'
            });
        }

        // Score display
        let scoreDisplay = '';
        if (game.isCompleted && game.homeScore !== null && game.awayScore !== null) {
            if (isHome) {
                scoreDisplay = `${game.homeScore} - ${game.awayScore}`;
            } else {
                scoreDisplay = `${game.awayScore} - ${game.homeScore}`;
            }
        } else {
            scoreDisplay = game.time || 'TBD';
        }

        return `
            <div class="game-card ${resultClass}">
                <div class="game-content">
                    <div class="game-left-column">
                        <div class="game-opponent">${this.escapeHtml(opponent)}</div>
                        <div class="game-details">
                            <div class="game-detail">
                                <i class="bi bi-calendar3"></i>
                                ${formattedDate}
                            </div>
                            <div class="game-detail">
                                <i class="bi bi-geo-alt"></i>
                                ${this.escapeHtml(location)}
                            </div>
                            <div class="game-detail">
                                <i class="${isHome ? 'bi bi-house' : 'bi bi-airplane'}"></i>
                                ${isHome ? 'Home' : 'Away'}
                            </div>
                        </div>
                    </div>
                    <div class="game-right-column">
                        <div class="game-result ${resultClass}">
                            ${resultText}
                        </div>
                        <div class="game-score">
                            ${scoreDisplay}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    getTeamData(teamCode) {
        if (!this.standingsData || !this.standingsData.teams) return null;
        return this.standingsData.teams.find(team => team.teamCode === teamCode);
    }

    // Subscription methods (updated for multi-division)
    async initSubscriptionForm() {
        await this.loadSubscriberCount();
        this.setupSubscriptionForm();
    }

    async loadSubscriberCount() {
        try {
            const params = new URLSearchParams({
                division: this.currentDivision,
                tier: this.currentTier
            });
            
            const response = await fetch(`/api/subscribers/count?${params}`);
            const data = await response.json();
            
            const element = document.getElementById('subscriberCount');
            if (element) {
                element.textContent = data.success ? data.count : 'Unknown';
            }
        } catch (error) {
            console.error('Error loading subscriber count:', error);
        }
    }

    setupSubscriptionForm() {
        const form = document.getElementById('subscriptionForm');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('subscriberEmail').value;
            const name = document.getElementById('subscriberName').value;
            
            this.showSubscriptionLoading();
            
            try {
                const response = await fetch('/api/subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        email, 
                        name,
                        division: this.currentDivision,
                        tier: this.currentTier
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    this.showSubscriptionAlert('Successfully subscribed! You\'ll receive email notifications for standings changes.', 'success');
                    form.reset();
                    this.loadSubscriberCount();
                } else {
                    this.showSubscriptionAlert(result.message || 'Failed to subscribe. Please try again.', 'danger');
                }
            } catch (error) {
                console.error('Subscription error:', error);
                this.showSubscriptionAlert('Network error. Please try again.', 'danger');
            } finally {
                this.hideSubscriptionLoading();
            }
        });
    }

    showSubscriptionLoading() {
        const submitBtn = document.querySelector('#subscriptionForm button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<div class="loading-spinner-small"></div> &nbsp;&nbsp;Subscribing...';
        }
    }

    hideSubscriptionLoading() {
        const submitBtn = document.querySelector('#subscriptionForm button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="bi bi-envelope-plus"></i> &nbsp;&nbsp;Subscribe to Notifications';
        }
    }

    showSubscriptionAlert(message, type) {
        const alert = document.getElementById('subscriptionAlert');
        if (!alert) return;

        alert.className = `alert alert-${type}`;
        alert.textContent = message;
        alert.style.display = 'block';

        setTimeout(() => {
            alert.style.display = 'none';
        }, 5000);
    }

    async updateLastYsbaUpdateTime() {
        try {
            const response = await fetch('/api/last-ysba-update');
            const data = await response.json();
            
            const element = document.getElementById('lastYsbaUpdate');
            if (element) {
                element.textContent = data.success ? data.formattedDate : 'Unknown';
            }
        } catch (error) {
            console.error('Error loading YSBA update time:', error);
        }
    }

    // Sticky header functionality
    initStickyHeader() {
        this.precalculateColumnWidths();
        
        const throttledHandler = this.throttle(() => {
            this.handleStickyHeader();
        }, 16);
        
        window.addEventListener('scroll', throttledHandler);
        window.addEventListener('resize', throttledHandler);
    }

    precalculateColumnWidths() {
        const table = document.querySelector('.standings-table');
        if (!table) return;

        const headerCells = table.querySelectorAll('thead th');
        this.columnWidths = Array.from(headerCells).map(cell => cell.offsetWidth);
    }

    handleStickyHeader() {
        const standingsContainer = document.getElementById('standingsContainer');
        if (!standingsContainer) return;

        const containerRect = standingsContainer.getBoundingClientRect();
        const isContainerVisible = containerRect.top < 100 && containerRect.bottom > 100;

        if (isContainerVisible && containerRect.top < 0) {
            this.showFixedHeader();
        } else {
            this.hideFixedHeader();
        }
    }

    showFixedHeader() {
        document.body.classList.add('sticky-header-fixed');
        this.alignFixedHeaderColumns();
    }

    alignFixedHeaderColumns() {
        const originalCells = document.querySelectorAll('.standings-table thead th');
        const fixedCells = document.querySelectorAll('.sticky-header-fixed .standings-table thead th');

        originalCells.forEach((cell, index) => {
            if (fixedCells[index]) {
                fixedCells[index].style.width = `${cell.offsetWidth}px`;
            }
        });
    }

    hideFixedHeader() {
        document.body.classList.remove('sticky-header-fixed');
    }

    throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }

    // Cleanup method
    destroy() {
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }
        if (this.statusUpdateInterval) {
            clearInterval(this.statusUpdateInterval);
        }
        if (this.nextRefreshCountdown) {
            this.nextRefreshCountdown.stopCountdown();
        }
        if (this.lastUpdatedCountdown) {
            this.lastUpdatedCountdown.stopCountdown();
        }
    }

    // Status display methods
    updateStatusDisplay(status) {
        const statusContent = document.getElementById('statusContent');
        if (!statusContent) return;

        const cacheAge = status.cacheAge;
        const nextScrapeIn = status.nextScrapeIn;
        
        statusContent.innerHTML = `
            <div class="row g-3">
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-body">
                            <h6 class="card-title">📊 Current Division</h6>
                            <p class="card-text">${this.divisionConfig?.displayName || 'Unknown'} - ${this.tierConfig?.displayName || 'Unknown'}</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-body">
                            <h6 class="card-title">⚡ Cache Status</h6>
                            <p class="card-text">${cacheAge ? `${cacheAge}s old` : 'No cache'}</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-body">
                            <h6 class="card-title">🔄 Next Update</h6>
                            <p class="card-text">${nextScrapeIn ? `${Math.floor(nextScrapeIn / 60)}m ${nextScrapeIn % 60}s` : 'Soon'}</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card">
                        <div class="card-body">
                            <h6 class="card-title">🏆 Teams</h6>
                            <p class="card-text">${this.standingsData?.teams?.length || 0} teams</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}

// Initialize the application when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.ysbaApp = new MultiDivisionYSBAApp();
});

// Handle page unload cleanup
window.addEventListener('beforeunload', () => {
    if (window.ysbaApp) {
        window.ysbaApp.destroy();
    }
}); 