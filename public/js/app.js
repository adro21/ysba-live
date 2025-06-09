// YSBA Standings App
class YSBAStandingsApp {
    constructor() {
        this.standingsData = null;
        this.lastUpdateTime = null;
        this.autoRefreshInterval = null;
        this.statusUpdateInterval = null; // Add interval for status updates
        this.autoRefreshEnabled = true;
        this.isLoading = false;
        this.debug = localStorage.getItem('debug') === 'true';
        
        // Division filtering
        this.currentDivisionFilter = 'all';
        this.divisionMapping = {
            // North Division
            '511105': 'north', // Midland Penetang Twins 9U DS
            '511107': 'north', // Barrie Baycats 9U DS
            '511109': 'north', // Collingwood Jays 9U DS
            '511110': 'north', // Innisfil Cardinals 9U DS
            '511115': 'north', // TNT Thunder 9U DS
            '511108': 'north', // Bradford Tigers 9U DS
            '511116': 'north', // Caledon Nationals 9U HS
            
            // South Division
            '511106': 'south', // Aurora-King Jays 9U DS
            '518965': 'south', // Vaughan Vikings 8U DS
            '511111': 'south', // Markham Mariners 9U DS
            '511112': 'south', // Newmarket Hawks 9U DS
            '511114': 'south', // Thornhill Reds 9U DS
            '518966': 'south', // Vaughan Vikings 9U DS
            '511113': 'south'  // Richmond Hill Phoenix 9U DS
        };
        
        // Countdown timer instances
        this.nextRefreshCountdown = null;
        this.lastUpdatedCountdown = null;
        
        this.init();
    }

    init() {
        this.loadStandings();
        this.setupEventListeners();
        this.startAutoRefresh();
        this.startStatusUpdates();
        this.initSubscriptionForm();
        this.updateLastYsbaUpdateTime();
    }

    setupEventListeners() {
        // Refresh button
        document.getElementById('refreshBtn').addEventListener('click', (e) => {
            e.preventDefault();
            this.refreshStandings();
        });

        // Division filter dropdown
        document.querySelectorAll('.dropdown-item[data-division]').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const division = e.target.getAttribute('data-division');
                
                // Close the dropdown
                const dropdown = bootstrap.Dropdown.getInstance(document.getElementById('divisionBtn'));
                if (dropdown) {
                    dropdown.hide();
                }
                
                this.setDivisionFilter(division);
            });
        });

        // Status button - load status when modal is shown
        document.getElementById('statusBtn').addEventListener('click', () => {
            this.loadStatus();
            this.startStatusUpdates();
        });

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
        // Don't prevent loading during manual refresh 
        if (this.isLoading && !forceRefresh) return;

        this.isLoading = true;
        
        // Only show loading state if not a force refresh (manual refresh handles its own loading)
        if (!forceRefresh) {
            this.showLoadingState();
        }

        try {
            // First try to get cached data without a refresh
            if (!forceRefresh) {
                console.log('Attempting to load cached data first...');
                const response = await fetch('/api/standings');
                const result = await response.json();

                if (response.ok && result.success && result.data) {
                    console.log('Successfully loaded cached data');
                    this.standingsData = result.data;
                    this.lastUpdateTime = new Date(result.data.lastUpdated);
                    this.displayStandings();
                    this.updateLastUpdatedTime();
                    this.hideError();
                    this.isLoading = false;
                    this.hideLoadingState();
                    this.updateLastYsbaUpdateTime();
                    return;
                }
            }

            // If we get here, either forceRefresh was true or no cached data was available
            // Proceed with a forced refresh
            console.log('Requesting fresh data...');
            const url = '/api/standings?refresh=true';
            const response = await fetch(url);
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
                this.updateLastYsbaUpdateTime();
            } else {
                throw new Error('Invalid response format');
            }

        } catch (error) {
            console.error('Error loading standings:', error);
            this.showError(error.message);
        } finally {
            this.isLoading = false;
            // Only hide loading state if not a force refresh
            if (!forceRefresh) {
                this.hideLoadingState();
            }
        }
    }

    async refreshStandings() {
        const refreshBtn = document.getElementById('refreshBtn');
        const originalContent = refreshBtn.innerHTML;
        
        // Show button loading state with spinning refresh icon (keep text on desktop)
        refreshBtn.classList.add('btn-loading', 'btn-refreshing');
        
        // On mobile, only show icon. On desktop, keep the text
        if (window.innerWidth <= 768) {
            refreshBtn.innerHTML = '<i class="bi bi-arrow-repeat"></i>';
        } else {
            // For desktop, keep the text but replace the icon with spinning one
            refreshBtn.innerHTML = '<i class="bi bi-arrow-repeat"></i><span class="d-none d-md-inline">Refresh</span>';
        }
        
        // Show full loading screen for better UX
        this.showLoadingState();
        
        try {
            console.log('Manual refresh triggered');
            
            // Force refresh with a direct API call to avoid the loading guard
            const response = await fetch('/api/standings?refresh=true');
            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Failed to refresh standings');
            }

            if (result.success && result.data) {
                this.standingsData = result.data;
                this.lastUpdateTime = new Date(result.data.lastUpdated);
                this.displayStandings();
                this.updateLastUpdatedTime();
                this.hideError();
                console.log('✓ Standings refreshed successfully');
                
                // Show success state
                this.showRefreshSuccess(refreshBtn, originalContent);
                
                // Update YSBA last update time
                this.updateLastYsbaUpdateTime();
            } else {
                throw new Error('Invalid response format');
            }

        } catch (error) {
            console.error('Error refreshing standings:', error);
            this.showError(`Refresh failed: ${error.message}`);
            // Restore button immediately on error
            refreshBtn.classList.remove('btn-loading', 'btn-refreshing');
            refreshBtn.innerHTML = originalContent;
        } finally {
            this.hideLoadingState();
        }
    }

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
        document.querySelector(`.dropdown-item[data-division="${division}"]`).classList.add('active');

        // Update division button state and text
        const divisionBtn = document.getElementById('divisionBtn');
        const buttonText = divisionBtn.querySelector('.d-none.d-lg-inline');
        
        if (division === 'all') {
            divisionBtn.classList.remove('division-filter-active');
            if (buttonText) buttonText.textContent = 'Division';
        } else {
            divisionBtn.classList.add('division-filter-active');
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

        if (division === 'all') {
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
        
        // Get filtered teams
        const filteredTeams = this.getFilteredTeams(division);
        
        // Universal smooth animation for all transitions
        this.smoothUniversalTransition(standingsTable, tbody, filteredTeams);
    }

    smoothUniversalTransition(standingsTable, tbody, filteredTeams) {
        // Step 1: Apply a smooth scale-down and fade effect to the entire tbody
        tbody.style.transition = 'transform 0.15s ease, opacity 0.15s ease';
        tbody.style.transform = 'scale(0.98)';
        tbody.style.opacity = '0.3';
        
        // Step 2: After brief animation, rebuild the table
        setTimeout(() => {
            // Clear and rebuild with filtered data during the fade
            tbody.innerHTML = '';
            
            filteredTeams.forEach((team, index) => {
                const row = this.createTeamRow(team, index + 1);
                tbody.appendChild(row);
            });

            // Re-initialize sticky header since table content changed
            this.initStickyHeader();
            
            // Step 3: Immediately start the fade-in animation
            tbody.style.transition = 'transform 0.2s ease, opacity 0.2s ease';
            tbody.style.transform = 'scale(1)';
            tbody.style.opacity = '1';
            
            // Step 4: Clean up styles after animation completes
            setTimeout(() => {
                tbody.style.transition = '';
                tbody.style.transform = '';
                tbody.style.opacity = '';
            }, 200);
            
        }, 150); // Wait for scale-down to complete
    }

    displayFilteredStandings(division) {
        const tbody = document.getElementById('standingsTableBody');
        const filteredTeams = this.getFilteredTeams(division);
        
        // Clear and rebuild table
        tbody.innerHTML = '';
        
        filteredTeams.forEach((team, index) => {
            const row = this.createTeamRow(team, index + 1);
            // Add filter classes for smooth appearance
            row.classList.add('filter-visible');
            // Clean up any inline styles that might interfere
            row.style.opacity = '';
            row.style.transform = '';
            row.style.transition = '';
            tbody.appendChild(row);
        });

        // Re-initialize sticky header since table content changed
        this.initStickyHeader();
    }
    
    showRefreshSuccess(refreshBtn, originalContent) {
        // Remove loading classes and add success state
        refreshBtn.classList.remove('btn-loading', 'btn-refreshing');
        refreshBtn.classList.add('btn-success-state');
        
        // On mobile, only show icon. On desktop, keep the text
        if (window.innerWidth <= 768) {
            refreshBtn.innerHTML = '<i class="bi bi-check"></i>';
        } else {
            refreshBtn.innerHTML = '<i class="bi bi-check"></i><span class="d-none d-md-inline">Refresh</span>';
        }
        
        // Keep disabled during success animation
        setTimeout(() => {
            // Restore original state after success animation
            refreshBtn.classList.remove('btn-success-state');
            refreshBtn.innerHTML = originalContent;
        }, 2000); // Show success for 2 seconds
    }

    displayStandings() {
        if (!this.standingsData || !this.standingsData.teams) {
            this.showError('No standings data available');
            return;
        }

        // Use current division filter
        this.displayFilteredStandings(this.currentDivisionFilter);
        this.updateDivisionFilterUI(this.currentDivisionFilter);

        this.showStandings();
        
        // Show tooltips for table headers with proper positioning
        const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
        const tooltipList = [...tooltipTriggerList].map(tooltipTriggerEl => {
            return new bootstrap.Tooltip(tooltipTriggerEl, {
                placement: 'top',
                boundary: 'viewport',
                offset: [0, 8], // Add extra offset to clear sticky header
                fallbackPlacements: ['bottom', 'right', 'left'] // Fallback if top doesn't fit
            });
        });
    }

    createTeamRow(team, position) {
        const row = document.createElement('tr');
        row.className = 'fade-in team-row-clickable';
        row.setAttribute('data-team-code', team.teamCode);
        row.setAttribute('data-team-name', team.team);

        // Position badge
        const positionBadge = this.createPositionBadge(position);
        
        // Win percentage class
        const winPct = parseFloat(team.winPercentage);
        let winPctClass = 'win-percentage ';
        if (winPct >= 0.75) winPctClass += 'high';
        else if (winPct >= 0.60) winPctClass += 'medium-high';
        else if (winPct >= 0.45) winPctClass += 'medium';
        else if (winPct >= 0.30) winPctClass += 'low-medium';
        else winPctClass += 'low';

        row.innerHTML = `
            <td class="text-center">${positionBadge}</td>
            <td class="team-name" data-team-code="${team.teamCode}">
                ${this.escapeHtml(team.team)}
            </td>
            <td class="text-center">${team.gamesPlayed}</td>
            <td class="text-center fw-bold text-success">${team.wins}</td>
            <td class="text-center fw-bold text-danger">${team.losses}</td>
            <td class="text-center">${team.ties}</td>
            <td class="text-center fw-bold">${team.points}</td>
            <td class="text-center">${team.runsFor}</td>
            <td class="text-center">${team.runsAgainst}</td>
            <td class="text-center">
                <span class="${winPctClass}">${team.winPercentage}</span>
            </td>
        `;

        // Add click handler for the entire row
        row.addEventListener('click', (event) => {
            // If they clicked on the team name, use the original event handler
            // This ensures desktop users get the same experience
            if (event.target.closest('.team-name')) {
                // Team name click is already handled below
                return;
            }
            
            // For other parts of the row, show the team schedule
            this.showTeamSchedule(team.teamCode, team.team);
        });

        // Add click handler for team name (keep original for compatibility)
        const teamNameCell = row.querySelector('.team-name');
        teamNameCell.addEventListener('click', () => {
            this.showTeamSchedule(team.teamCode, team.team);
        });

        return row;
    }

    createPositionBadge(position) {
        return `<div class="position-badge">${position}</div>`;
    }

    async loadStatus() {
        try {
            const response = await fetch('/api/status');
            const status = await response.json();
            
            // Use the new updateStatusDisplay method that includes countdown timers
            this.updateStatusDisplay(status);
            
        } catch (error) {
            console.error('Error loading status:', error);
            document.getElementById('statusContent').innerHTML = `
                <div class="alert alert-danger">
                    <i class="bi bi-exclamation-triangle"></i>
                    Failed to load status information
                </div>
            `;
        }
    }

    updateLastUpdatedTime() {
        const element = document.getElementById('lastUpdated');
        if (this.lastUpdateTime) {
            const timeAgo = this.getTimeAgo(this.lastUpdateTime);
            element.textContent = timeAgo;
        } else {
            element.textContent = 'Never';
        }
    }

    getTimeAgo(date) {
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 60) return 'just now';
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
        // Update the "last updated" display every minute
        this.autoRefreshInterval = setInterval(() => {
            this.updateLastUpdatedTime();
        }, 60000);

        // Auto-refresh standings every 10 minutes if page is visible
        setInterval(() => {
            if (!document.hidden && this.shouldAutoRefresh()) {
                this.loadStandings();
            }
        }, 10 * 60 * 1000);
    }

    startStatusUpdates() {
        // Clear any existing interval
        this.stopStatusUpdates();
        
        // Start polling for status updates every 5 seconds for reasonable updates
        this.statusUpdateInterval = setInterval(async () => {
            try {
                const response = await fetch('/api/status');
                const status = await response.json();
                
                // Only update if schedule caching is in progress for more responsive updates
                if (status.scheduleCacheStatus?.isScheduleCachingInProgress) {
                    this.updateStatusDisplayLightweight(status);
                } else {
                    // If caching is complete, refresh once more and then slow down polling
                    this.updateStatusDisplayLightweight(status);
                    this.stopStatusUpdates();
                    // Set a slower interval for general status updates
                    this.statusUpdateInterval = setInterval(() => {
                        this.loadStatus();
                    }, 30000); // 30 seconds for general updates (longer to not interfere with countdown)
                }
            } catch (error) {
                console.error('Error updating status:', error);
            }
        }, 5000); // Poll every 5 seconds during active caching for reasonable updates
    }

    stopStatusUpdates() {
        if (this.statusUpdateInterval) {
            clearInterval(this.statusUpdateInterval);
            this.statusUpdateInterval = null;
        }
        // Don't stop countdowns here - only stop them when the modal actually closes
    }

    // Lightweight update that only updates the schedule progress without recreating countdown timers
    updateStatusDisplayLightweight(status) {
        const scheduleStatus = status.scheduleCacheStatus;
        const comprehensiveSchedule = status.comprehensiveSchedule;
        
        // Find the schedule performance card and update only its content
        const scheduleCard = document.querySelector('#statusContent .col-12 .card .card-body');
        if (!scheduleCard) return;
        
        let scheduleHtml = `
            <h6 class="card-title">
                <i class="bi bi-calendar-event"></i>
                Team Schedules
            </h6>
            <div class="d-flex align-items-center text-success mb-2">
                <i class="bi bi-check-circle-fill me-2"></i>
                <span>All team schedules available</span>
            </div>
            <div class="progress mb-2" style="height: 8px;">
                <div class="progress-bar bg-success" 
                     role="progressbar" 
                     style="width: 100%">
                </div>
            </div>
            <small class="text-muted mb-3 d-block">
                Team schedules are cached and load instantly from comprehensive schedule data
            </small>
        `;
        
        scheduleCard.innerHTML = scheduleHtml;
    }

    updateStatusDisplay(status) {
        // Stop any existing countdowns first
        this.stopStatusCountdowns();
        
        let statusHtml = `
            <div class="row g-3">
                <div class="col-md-6">
                    <div class="card h-100">
                        <div class="card-body">
                            <h6 class="card-title">
                                <i class="bi bi-server"></i>
                                Server Status
                            </h6>
                            <p class="mb-1">
                                <span class="badge bg-success">Online</span>
                            </p>
                            <small class="text-muted">
                                Next refresh in <span id="nextRefreshCountdown"></span>
                            </small>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card h-100">
                        <div class="card-body">
                            <h6 class="card-title">
                                <i class="bi bi-calendar-check"></i>
                                Last Updated
                            </h6>
                            <p class="mb-1">
                                ${status.lastScrapeTime ? new Date(status.lastScrapeTime).toLocaleString() : 'Never'}
                            </p>
                            <small class="text-muted">
                                <span id="lastUpdatedCountdown"></span> ago
                            </small>
                        </div>
                    </div>
                </div>
                <div class="col-12">
                    <div class="card">
                        <div class="card-body">
                            <h6 class="card-title">
                                <i class="bi bi-calendar-event"></i>
                                Team Schedules
                            </h6>
                            <div class="d-flex align-items-center text-success mb-2">
                                <i class="bi bi-check-circle-fill me-2"></i>
                                <span>All team schedules available</span>
                            </div>
                            <div class="progress mb-2" style="height: 8px;">
                                <div class="progress-bar bg-success" 
                                     role="progressbar" 
                                     style="width: 100%">
                                </div>
                            </div>
                            <small class="text-muted mb-3 d-block">
                                Team schedules are cached and load instantly from comprehensive schedule data
                            </small>
        `;
        
        statusHtml += `
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        document.getElementById('statusContent').innerHTML = statusHtml;
        
        // Initialize countdown timers with real-time updates
        this.initializeStatusCountdowns(status);
    }

    initializeStatusCountdowns(status) {
        // Check if simplyCountdown is available
        if (typeof simplyCountdown === 'undefined') {
            console.warn('simplyCountdown library not loaded, using static timers');
            // Fallback to static display
            setTimeout(() => {
                const nextRefreshElement = document.getElementById('nextRefreshCountdown');
                if (nextRefreshElement) {
                    if (status.nextScrapeIn > 0) {
                        nextRefreshElement.textContent = `${Math.floor(status.nextScrapeIn / 60)}m ${status.nextScrapeIn % 60}s`;
                    } else {
                        nextRefreshElement.textContent = 'refreshing...';
                    }
                }
                
                const lastUpdatedElement = document.getElementById('lastUpdatedCountdown');
                if (lastUpdatedElement) {
                    if (status.cacheAge > 0) {
                        lastUpdatedElement.textContent = `${Math.floor(status.cacheAge / 60)}m ${status.cacheAge % 60}s`;
                    } else {
                        lastUpdatedElement.textContent = 'just now';
                    }
                }
            }, 50);
            return;
        }
        
        // Wait a bit for DOM to be ready
        setTimeout(() => {
            // Initialize "Next refresh in" countdown
            const nextRefreshElement = document.getElementById('nextRefreshCountdown');
            if (nextRefreshElement && status.nextScrapeIn > 0) {
                const nextRefreshTime = new Date(Date.now() + (status.nextScrapeIn * 1000));
                
                try {
                    this.nextRefreshCountdown = simplyCountdown('#nextRefreshCountdown', {
                        year: nextRefreshTime.getFullYear(),
                        month: nextRefreshTime.getMonth() + 1,
                        day: nextRefreshTime.getDate(),
                        hours: nextRefreshTime.getHours(),
                        minutes: nextRefreshTime.getMinutes(),
                        seconds: nextRefreshTime.getSeconds(),
                        inline: true,
                        inlineClass: 'status-countdown-inline',
                        removeZeroUnits: true,
                        words: {
                            days: { root: 'd', lambda: (root, n) => n > 0 ? root : '' },
                            hours: { root: 'h', lambda: (root, n) => n > 0 ? root : '' },
                            minutes: { root: 'm', lambda: (root, n) => n > 0 ? root : '' },
                            seconds: { root: 's', lambda: (root, n) => n > 0 ? root : '' }
                        },
                        onEnd: () => {
                            // When countdown reaches zero, show "refreshing..."
                            if (nextRefreshElement) {
                                nextRefreshElement.textContent = 'refreshing...';
                            }
                        }
                    });
                } catch (error) {
                    console.warn('Failed to initialize next refresh countdown:', error);
                    nextRefreshElement.textContent = `${Math.floor(status.nextScrapeIn / 60)}m ${status.nextScrapeIn % 60}s`;
                }
            } else if (nextRefreshElement) {
                nextRefreshElement.textContent = 'refreshing...';
            }

            // Initialize "Last updated ago" count-up timer
            const lastUpdatedElement = document.getElementById('lastUpdatedCountdown');
            if (lastUpdatedElement && status.cacheAge > 0) {
                // For the "ago" timer, we count up from when it was last updated
                const lastUpdateTime = new Date(Date.now() - (status.cacheAge * 1000));
                
                try {
                    this.lastUpdatedCountdown = simplyCountdown('#lastUpdatedCountdown', {
                        year: lastUpdateTime.getFullYear(),
                        month: lastUpdateTime.getMonth() + 1,
                        day: lastUpdateTime.getDate(),
                        hours: lastUpdateTime.getHours(),
                        minutes: lastUpdateTime.getMinutes(),
                        seconds: lastUpdateTime.getSeconds(),
                        countUp: true, // This makes it count up instead of down
                        inline: true,
                        inlineClass: 'status-countdown-inline',
                        removeZeroUnits: true,
                        words: {
                            days: { root: 'd', lambda: (root, n) => n > 0 ? root : '' },
                            hours: { root: 'h', lambda: (root, n) => n > 0 ? root : '' },
                            minutes: { root: 'm', lambda: (root, n) => n > 0 ? root : '' },
                            seconds: { root: 's', lambda: (root, n) => n > 0 ? root : '' }
                        }
                    });
                } catch (error) {
                    console.warn('Failed to initialize last updated countdown:', error);
                    lastUpdatedElement.textContent = `${Math.floor(status.cacheAge / 60)}m ${status.cacheAge % 60}s`;
                }
            } else if (lastUpdatedElement) {
                lastUpdatedElement.textContent = 'just now';
            }
        }, 50); // Small delay to ensure DOM is ready
    }

    stopStatusCountdowns() {
        // Stop existing countdown timers
        if (this.nextRefreshCountdown && this.nextRefreshCountdown.stopCountdown) {
            this.nextRefreshCountdown.stopCountdown();
            this.nextRefreshCountdown = null;
        }
        if (this.lastUpdatedCountdown && this.lastUpdatedCountdown.stopCountdown) {
            this.lastUpdatedCountdown.stopCountdown();
            this.lastUpdatedCountdown = null;
        }
    }

    showLoadingState() {
        const loadingState = document.getElementById('loadingState');
        const standingsContainer = document.getElementById('standingsContainer');
        const errorAlert = document.getElementById('errorAlert');
        
        loadingState.classList.add('show');
        standingsContainer.classList.remove('show');
        errorAlert.classList.remove('show');
    }

    hideLoadingState() {
        document.getElementById('loadingState').classList.remove('show');
    }

    showStandings() {
        const standingsContainer = document.getElementById('standingsContainer');
        standingsContainer.classList.add('show');
    }

    showError(message) {
        const errorAlert = document.getElementById('errorAlert');
        const errorMessage = document.getElementById('errorMessage');
        
        errorMessage.textContent = message;
        errorAlert.classList.add('show');
        document.getElementById('standingsContainer').classList.remove('show');
    }

    hideError() {
        document.getElementById('errorAlert').classList.remove('show');
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    destroy() {
        this.stopStatusUpdates();
        if (this.autoRefreshInterval) {
            clearInterval(this.autoRefreshInterval);
        }
        if (this.stickyHeaderHandler) {
            window.removeEventListener('scroll', this.stickyHeaderHandler);
        }
        if (this.horizontalScrollHandler && this.tableContainer) {
            this.tableContainer.removeEventListener('scroll', this.horizontalScrollHandler);
        }
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
        }
        if (this.fixedHeader) {
            this.fixedHeader.remove();
            this.fixedHeader = null;
        }
    }

    async showTeamSchedule(teamCode, teamName) {
        try {
            // Show modal immediately with loading state
            const modal = document.getElementById('scheduleModal');
            document.getElementById('scheduleModalTitle').textContent = teamName;
            this.showScheduleLoading();
            
            const modalInstance = new bootstrap.Modal(modal);
            modalInstance.show();

            console.log(`Loading comprehensive schedule for team ${teamCode}...`);
            const startTime = Date.now();
            
            // Use the new comprehensive schedule endpoint
            const response = await fetch(`/api/team/${teamCode}/schedule`);
            const loadTime = Date.now() - startTime;
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            // Update loading message based on load time
            if (loadTime < 1000) {
                console.log(`✓ Schedule loaded from cache (${loadTime}ms)`);
            } else {
                console.log(`✓ Schedule scraped fresh (${loadTime}ms)`);
            }
            
            if (result.success && result.data) {
                this.displayNewSchedule(result.data, teamName, this.getTeamData(teamCode));
            } else {
                throw new Error('Invalid schedule data');
            }
            
        } catch (error) {
            console.error('Error loading team schedule:', error);
            this.showScheduleError(error.message);
        }
    }

    showScheduleLoading() {
        document.getElementById('scheduleLoadingState').classList.add('show');
        document.getElementById('scheduleErrorState').classList.remove('show');
        document.getElementById('scheduleContent').classList.remove('show');
    }

    showScheduleError(message) {
        document.getElementById('scheduleLoadingState').classList.remove('show');
        document.getElementById('scheduleErrorState').classList.add('show');
        document.getElementById('scheduleContent').classList.remove('show');
        
        // Update error message if provided
        const errorElement = document.querySelector('#scheduleErrorState p');
        if (errorElement && message) {
            errorElement.textContent = message;
        }
    }

    displayNewSchedule(scheduleData, teamName, teamData) {
        document.getElementById('scheduleLoadingState').classList.remove('show');
        document.getElementById('scheduleErrorState').classList.remove('show');
        document.getElementById('scheduleContent').classList.add('show');

        const playedGames = scheduleData.playedGames || [];
        const upcomingGames = scheduleData.upcomingGames || [];
        
        // Use team record from standings data
        let recordText = '';
        if (teamData) {
            // Only show wins if > 0, similar to how ties are handled
            const winsText = teamData.wins > 0 ? `${teamData.wins}W` : '';
            const lossesText = `${teamData.losses}L`;
            const tiesText = teamData.ties > 0 ? `${teamData.ties}T` : '';
            
            // Build record string with only non-zero values
            const recordParts = [winsText, lossesText, tiesText].filter(part => part !== '');
            recordText = `${recordParts.join(' - ')} <span style="margin: 0 8px;">⚾</span> ${teamData.gamesPlayed} games played`;
        } else {
            // Fallback calculation from played games
            const winsText = playedGames.length > 0 ? `${playedGames.length}W` : '';
            recordText = `${winsText} <span style="margin: 0 8px;">⚾</span> ${playedGames.length} games played`;
        }
        
        document.getElementById('teamRecord').innerHTML = recordText;

        // Set up tab functionality with new data structure
        this.setupNewScheduleTabs(playedGames, upcomingGames);
    }

    // Keep old method for backward compatibility during transition
    displaySchedule(scheduleData, teamName, teamData) {
        document.getElementById('scheduleLoadingState').classList.remove('show');
        document.getElementById('scheduleErrorState').classList.remove('show');
        document.getElementById('scheduleContent').classList.add('show');

        const games = scheduleData.games || [];
        
        // Use team record from standings data if available, otherwise calculate from games
        let recordText = '';
        if (teamData) {
            // Only show wins if > 0, similar to how ties are handled
            const winsText = teamData.wins > 0 ? `${teamData.wins}W` : '';
            const lossesText = `${teamData.losses}L`;
            const tiesText = teamData.ties > 0 ? `${teamData.ties}T` : '';
            
            // Build record string with only non-zero values
            const recordParts = [winsText, lossesText, tiesText].filter(part => part !== '');
            recordText = `${recordParts.join(' - ')} <span style="margin: 0 8px;">⚾</span> ${teamData.gamesPlayed} games played`;
        } else {
            // Fallback calculation from individual games
            const completedGames = games.filter(game => game.isCompleted);
            const wins = completedGames.filter(game => game.result === 'W').length;
            const losses = completedGames.filter(game => game.result === 'L').length;
            const ties = completedGames.filter(game => game.result === 'T').length;
            
            // Only show wins if > 0, similar to how ties are handled
            const winsText = wins > 0 ? `${wins}W` : '';
            const lossesText = `${losses}L`;
            const tiesText = ties > 0 ? `${ties}T` : '';
            
            // Build record string with only non-zero values
            const recordParts = [winsText, lossesText, tiesText].filter(part => part !== '');
            recordText = `${recordParts.join(' - ')} <span style="margin: 0 8px;">⚾</span> ${completedGames.length} games played`;
        }
        
        document.getElementById('teamRecord').innerHTML = recordText;

        // Set up tab functionality
        this.setupScheduleTabs(games);
    }

    setupNewScheduleTabs(playedGames, upcomingGames) {
        const tabContainer = document.querySelector('.schedule-tabs');
        if (!tabContainer) return;

        // Clear existing tabs
        tabContainer.innerHTML = '';

        // Sort played games by date (most recent first)
        const sortedPlayedGames = playedGames.sort((a, b) => {
            if (!a.date || !b.date) return 0;
            return new Date(b.date) - new Date(a.date);
        });

        // Sort upcoming games by date (next game first)
        const sortedUpcomingGames = upcomingGames.sort((a, b) => {
            if (!a.date || !b.date) return 0;
            return new Date(a.date) - new Date(b.date);
        });

        // Create tabs
        const tabs = [
            { id: 'played', label: `Played Games (${sortedPlayedGames.length})`, games: sortedPlayedGames },
            { id: 'upcoming', label: `Upcoming Games (${sortedUpcomingGames.length})`, games: sortedUpcomingGames }
        ];

        tabs.forEach((tab, index) => {
            const tabElement = document.createElement('button');
            tabElement.className = `schedule-tab ${index === 0 ? 'active' : ''}`;
            tabElement.textContent = tab.label;
            tabElement.addEventListener('click', () => {
                // Remove active from all tabs
                document.querySelectorAll('.schedule-tab').forEach(t => t.classList.remove('active'));
                // Add active to clicked tab
                tabElement.classList.add('active');
                // Show corresponding games
                this.showNewScheduleTab(tab.id, tab.games);
            });
            tabContainer.appendChild(tabElement);
        });

        // Show first tab by default
        this.showNewScheduleTab(tabs[0].id, tabs[0].games);
    }

    setupScheduleTabs(games) {
        const tabContainer = document.querySelector('.schedule-tabs');
        if (!tabContainer) return;

        // Clear existing tabs
        tabContainer.innerHTML = '';

        // Filter games into played and upcoming based on proper date logic
        const now = new Date();
        const playedGames = games.filter(game => {
            // Games are considered played if they have a completion status OR if the date is in the past
            if (game.isCompleted) return true;
            if (game.date && new Date(game.date) < now) return true;
            return false;
        });
        const upcomingGames = games.filter(game => {
            // Only show games with future dates, regardless of completion status
            return game.date && new Date(game.date) >= now;
        });

        // Calculate total games played by summing up the gamesPlayed for each completed matchup
        const totalGamesPlayed = playedGames.reduce((total, game) => total + (game.gamesPlayed || 0), 0);

        // Create tabs
        const tabs = [
            { id: 'played', label: `Played Games (${totalGamesPlayed})`, games: playedGames },
            { id: 'upcoming', label: `Upcoming Games`, games: upcomingGames }
        ];

        tabs.forEach((tab, index) => {
            const tabElement = document.createElement('button');
            tabElement.className = `schedule-tab ${index === 0 ? 'active' : ''}`;
            tabElement.textContent = tab.label;
            tabElement.addEventListener('click', () => {
                // Remove active from all tabs
                document.querySelectorAll('.schedule-tab').forEach(t => t.classList.remove('active'));
                // Add active to clicked tab
                tabElement.classList.add('active');
                // Show corresponding games
                this.showScheduleTab(tab.id, tab.games);
            });
            tabContainer.appendChild(tabElement);
        });

        // Show first tab by default
        this.showScheduleTab(tabs[0].id, tabs[0].games);
    }

    showNewScheduleTab(tabType, games) {
        const gamesContainer = document.querySelector('.schedule-games');
        if (!gamesContainer) return;

        // Add tab-specific class for styling
        gamesContainer.className = `schedule-games ${tabType}`;

        if (games.length === 0) {
            gamesContainer.innerHTML = `
                <div class="schedule-empty">
                    <i class="fas fa-calendar-alt"></i>
                    <p>No ${tabType} games found</p>
                </div>
            `;
            return;
        }

        gamesContainer.innerHTML = this.renderNewScheduleGames(games);
    }

    showScheduleTab(tabType, games) {
        const gamesContainer = document.querySelector('.schedule-games');
        if (!gamesContainer) return;

        if (games.length === 0) {
            gamesContainer.innerHTML = `
                <div class="schedule-empty">
                    <i class="fas fa-calendar-alt"></i>
                    <p>No ${tabType} games found</p>
                </div>
            `;
            return;
        }

        gamesContainer.innerHTML = this.renderScheduleGames(games);
    }

    renderNewScheduleGames(games) {
        return games.map(game => this.createNewGameCard(game)).join('');
    }

    renderScheduleGames(games) {
        return games.map(game => this.createGameCard(game)).join('');
    }

    createNewGameCard(game) {
        // Determine game status and display
        let statusClass = 'upcoming';
        let statusText = 'UPCOMING';
        
        if (game.isCompleted && game.teamScore !== null && game.opponentScore !== null) {
            if (game.teamScore > game.opponentScore) {
                statusClass = 'win';
                statusText = 'WIN';
            } else if (game.teamScore < game.opponentScore) {
                statusClass = 'loss';
                statusText = 'LOSS';
            } else {
                statusClass = 'tie';
                statusText = 'TIE';
            }
        } else if (!game.isCompleted && game.date && new Date(game.date) < new Date()) {
            // Past date but no result - could be cancelled, postponed, or score not entered
            statusClass = 'no-result';
            statusText = 'NO RESULT';
        }

        // Format date
        let dateDisplay = '';
        if (game.date) {
            const gameDate = new Date(game.date);
            const options = {
                month: 'short',
                day: 'numeric',
                year: gameDate.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined
            };
            dateDisplay = gameDate.toLocaleDateString('en-US', options);
        } else if (game.dateText) {
            dateDisplay = game.dateText;
        }

        // Create score display
        let scoreDisplay = '';
        if (game.isCompleted && (game.teamScore !== null && game.opponentScore !== null)) {
            scoreDisplay = `
                <div class="game-score">
                    <strong>${game.teamScore}-${game.opponentScore}</strong>
                    <div class="score-labels">
                        <small class="text-muted">Final</small>
                    </div>
                </div>
            `;
        } else if (statusClass === 'no-result') {
            scoreDisplay = `
                <div class="game-score">
                    <strong>-</strong>
                    <div class="score-labels">
                        <small class="text-muted">No Score</small>
                    </div>
                </div>
            `;
        } else if (game.time && !game.isCompleted) {
            scoreDisplay = `
                <div class="game-score">
                    <strong>${game.time}</strong>
                    <div class="score-labels">
                        <small class="text-muted">Game Time</small>
                    </div>
                </div>
            `;
        }

        return `
            <div class="game-card ${statusClass}">
                <div class="game-content">
                    <div class="game-left-column">
                        <div class="game-result ${statusClass}">
                            ${statusText}
                        </div>
                        <div class="game-opponent">
                            <strong>${this.escapeHtml(game.opponent)}</strong>
                        </div>
                        <div class="game-details">
                            <div class="game-detail">
                                ${dateDisplay ? `
                                    <i class="fas fa-calendar"></i>
                                    <span>${dateDisplay}</span>
                                ` : ''}
                                <i class="fas fa-${game.isHome ? 'home' : 'plane'}"></i>
                                <span>${game.isHome ? 'Home' : 'Away'}</span>
                            </div>
                        </div>
                    </div>
                    <div class="game-right-column">
                        ${scoreDisplay}
                    </div>
                </div>
            </div>
        `;
    }

    createGameCard(game) {
        // Determine overall result against this opponent based on wins/losses/ties
        let statusClass = 'upcoming';
        let statusText = 'UPCOMING';
        
        if (game.isCompleted) {
            const totalGames = game.wins + game.losses + game.ties;
            
            // Pure scenarios (no mixing of results)
            if (game.wins === totalGames && game.wins > 0) {
                // All wins
                statusClass = 'win';
                statusText = game.wins === 1 ? 'WIN' : `${game.wins}-0`;
            } else if (game.losses === totalGames && game.losses > 0) {
                // All losses
                statusClass = 'loss';
                statusText = game.losses === 1 ? 'LOSS' : `0-${game.losses}`;
            } else if (game.ties === totalGames && game.ties > 0) {
                // All ties
                statusClass = 'tie';
                statusText = game.ties === 1 ? 'TIE' : `0-0-${game.ties}`;
            } else {
                // Mixed results (any combination of wins/losses/ties)
                statusClass = 'mixed';
                
                // Use labels to make it clear what each number represents
                const winsText = game.wins > 0 ? `${game.wins}W` : '';
                const lossesText = game.losses > 0 ? `${game.losses}L` : '';
                const tiesText = game.ties > 0 ? `${game.ties}T` : '';
                
                // Build status text with only non-zero values and labels
                const statusParts = [winsText, lossesText, tiesText].filter(part => part !== '');
                statusText = statusParts.join('-');
            }
        }

        // Create score/record display - show runs if available, otherwise show record
        let scoreDisplay = '';
        if (game.isCompleted) {
            if (game.runsFor > 0 || game.runsAgainst > 0) {
                // Show only the runs (RF-RA) to avoid redundancy
                scoreDisplay = `
                    <div class="game-score">
                        <strong>${game.runsFor}-${game.runsAgainst}</strong>
                        <div class="score-labels">
                            <small class="text-muted">RF-RA</small>
                        </div>
                    </div>
                `;
            } else if (game.gameRecord && !game.gameRecord.includes('(')) {
                // Fallback: show record if no runs data and gameRecord doesn't have runs in parentheses
                scoreDisplay = `
                    <div class="game-score">
                        <strong>${game.gameRecord}</strong>
                    </div>
                `;
            }
        }

        return `
            <div class="game-card ${statusClass}">
                <div class="game-content">
                    <div class="game-left-column">
                        <div class="game-result ${statusClass}">
                            ${statusText}
                        </div>
                        <div class="game-opponent">
                            <strong>${this.escapeHtml(game.opponent)}</strong>
                        </div>
                        <div class="game-details">
                            ${game.isCompleted && game.gamesPlayed > 0 ? `
                                <div class="game-detail">
                                    <i class="fas fa-calendar-check"></i>
                                    <span>${game.gamesPlayed} Games Played</span>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    <div class="game-right-column">
                        ${scoreDisplay}
                    </div>
                </div>
            </div>
        `;
    }

    getTeamData(teamCode) {
        return this.standingsData?.teams?.find(team => team.teamCode === teamCode);
    }

    // Email subscription functionality
    async initSubscriptionForm() {
        // Load subscriber count
        this.loadSubscriberCount();
        
        // Setup division preferences first
        await this.setupDivisionPreferences();
        
        // Setup form submission
        this.setupSubscriptionForm();
    }

    async loadSubscriberCount() {
        try {
            const response = await fetch('/api/subscribers/count');
            if (response.ok) {
                const data = await response.json();
                document.getElementById('subscriberCount').textContent = data.active || 0;
            } else {
                document.getElementById('subscriberCount').textContent = '—';
            }
        } catch (error) {
            console.error('Error loading subscriber count:', error);
            document.getElementById('subscriberCount').textContent = '—';
        }
    }

    setupSubscriptionForm() {
        const form = document.getElementById('subscriptionForm');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('subscriberEmail').value;
            const name = document.getElementById('subscriberName').value;
            const selectedDivisions = this.getSelectedDivisionPreferences();

            // Validate that at least one division is selected
            if (selectedDivisions.length === 0) {
                this.showSubscriptionAlert('❌ Please select at least one division to receive notifications for.', 'error');
                return;
            }

            try {
                this.showSubscriptionLoading();

                const response = await fetch('/api/subscribe', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        email: email,
                        name: name,
                        divisionPreferences: selectedDivisions
                    })
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    this.showSubscriptionAlert('✅ Successfully subscribed! You\'ll receive notifications when standings change for your selected divisions.', 'success');
                    form.reset();
                    this.resetDivisionPreferences();
                    this.loadSubscriberCount(); // Refresh count
                } else {
                    this.showSubscriptionAlert(`❌ ${result.message || 'Failed to subscribe. Please try again.'}`, 'error');
                }

            } catch (error) {
                console.error('Subscription error:', error);
                this.showSubscriptionAlert('❌ Failed to subscribe. Please check your connection and try again.', 'error');
            } finally {
                this.hideSubscriptionLoading();
            }
        });
    }

    showSubscriptionLoading() {
        const submitBtn = document.querySelector('#subscriptionForm button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Subscribing...';
        }
    }

    hideSubscriptionLoading() {
        const submitBtn = document.querySelector('#subscriptionForm button[type="submit"]');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="bi bi-envelope-plus"></i>&nbsp;&nbsp;Subscribe to Notifications';
        }
    }

    showSubscriptionAlert(message, type) {
        const alertContainer = document.getElementById('subscriptionAlert');
        if (!alertContainer) return;

        alertContainer.className = `alert alert-${type === 'success' ? 'success' : 'danger'}`;
        alertContainer.textContent = message;
        alertContainer.style.display = 'block';

        // Auto-hide success messages
        if (type === 'success') {
            setTimeout(() => {
                alertContainer.style.display = 'none';
            }, 5000);
        }
    }

    async updateLastYsbaUpdateTime() {
        try {
            console.log('Fetching YSBA update time...');
            const response = await fetch('/api/last-ysba-update');
            const data = await response.json();
            console.log('YSBA update data:', data);
            
            const element = document.getElementById('lastYsbaUpdate');
            if (element) {
                if (data.success) {
                    element.textContent = data.formattedDate;
                    console.log('Updated lastYsbaUpdate with:', data.formattedDate);
                } else {
                    element.textContent = 'Unknown';
                    console.log('Failed to get YSBA update time, setting to Unknown');
                }
            } else {
                console.log('lastYsbaUpdate element not found');
            }
        } catch (error) {
            console.error('Error loading YSBA update time:', error);
            const element = document.getElementById('lastYsbaUpdate');
            if (element) {
                element.textContent = 'Unknown';
            }
        }
    }

    initStickyHeader() {
        // Get the table element and its container
        this.table = document.querySelector('.standings-table');
        this.tableContainer = document.querySelector('.table-container');
        
        if (!this.table || !this.tableContainer) {
            return;
        }

        // Clean up existing listeners to prevent duplicates
        if (this.stickyHeaderHandler) {
            window.removeEventListener('scroll', this.stickyHeaderHandler);
        }
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
        }
        
        // Remove existing fixed header if it exists
        if (this.fixedHeader) {
            this.hideFixedHeader();
        }

        this.precalculateColumnWidths();
        
        // Throttled scroll handler for better performance
        this.stickyHeaderHandler = this.throttle(() => {
            this.handleStickyHeader();
        }, 16); // ~60fps

        // Resize handler to re-align columns
        this.resizeHandler = this.throttle(() => {
            this.precalculateColumnWidths();
            if (this.fixedHeader) {
                this.alignFixedHeaderColumns();
                this.syncHeaderPosition();
            }
        }, 100);

        // Add scroll listener for sticky behavior
        window.addEventListener('scroll', this.stickyHeaderHandler);
        
        // Add real-time scroll sync for horizontal scrolling
        this.horizontalScrollHandler = () => {
            if (this.fixedHeader) {
                this.syncHeaderPosition();
            }
        };
        
        this.tableContainer.addEventListener('scroll', this.horizontalScrollHandler, { passive: true });
        
        // Add resize listener for column alignment
        window.addEventListener('resize', this.resizeHandler);
    }

    precalculateColumnWidths() {
        if (!this.table) return;
        
        // Store original column widths for smooth transitions
        const originalHeaders = this.table.querySelectorAll('thead th');
        this.columnWidths = [];
        
        originalHeaders.forEach((header) => {
            this.columnWidths.push(header.offsetWidth);
        });
        
        // Store total table width
        this.tableWidth = this.table.offsetWidth;
    }

    handleStickyHeader() {
        if (!this.table) {
            return;
        }

        const tableRect = this.table.getBoundingClientRect();
        const tableTop = tableRect.top;
        
        // Check if the table header has reached the top of the viewport
        if (tableTop <= 0 && tableRect.bottom > 0) {
            // Table header is at or above the top of viewport and table is still visible
            this.showFixedHeader();
        } else {
            // Table header is below the top of viewport or table is not visible
            this.hideFixedHeader();
        }
    }

    showFixedHeader() {
        if (this.fixedHeader) return; // Already showing

        // Apply fixed widths to original table BEFORE creating fixed header to prevent flicker
        this.applyFixedWidthsToOriginal();

        // Create a fixed header element
        this.fixedHeader = document.createElement('div');
        this.fixedHeader.className = 'sticky-header-fixed';
        
        // Clone the table structure for the header
        const tableContainer = document.createElement('div');
        tableContainer.className = 'table-container';
        
        const table = document.createElement('table');
        table.className = 'standings-table';
        
        // Clone only the thead
        const thead = this.table.querySelector('thead').cloneNode(true);
        table.appendChild(thead);
        
        tableContainer.appendChild(table);
        this.fixedHeader.appendChild(tableContainer);
        
        // Add to body
        document.body.appendChild(this.fixedHeader);

        // Apply column widths and initial position
        setTimeout(() => {
            this.alignFixedHeaderColumns();
            this.syncHeaderPosition();
        }, 0);
    }

    applyFixedWidthsToOriginal() {
        if (!this.table || !this.columnWidths) return;
        
        const originalHeaders = this.table.querySelectorAll('thead th');
        originalHeaders.forEach((header, index) => {
            if (this.columnWidths[index]) {
                const widthStyle = this.columnWidths[index] + 'px';
                header.style.width = widthStyle;
                header.style.minWidth = widthStyle;
                header.style.maxWidth = widthStyle;
            }
        });
        
        // Set table width
        if (this.tableWidth) {
            this.table.style.width = this.tableWidth + 'px';
            this.table.style.minWidth = this.tableWidth + 'px';
        }
    }

    alignFixedHeaderColumns() {
        if (!this.fixedHeader || !this.table || !this.columnWidths) return;

        const fixedHeaders = this.fixedHeader.querySelectorAll('thead th');
        const fixedTable = this.fixedHeader.querySelector('.standings-table');
        
        // Set the fixed table width
        if (this.tableWidth) {
            fixedTable.style.width = this.tableWidth + 'px';
            fixedTable.style.minWidth = this.tableWidth + 'px';
        }
        
        // Apply pre-calculated widths to fixed header
        fixedHeaders.forEach((header, index) => {
            if (this.columnWidths[index]) {
                const widthStyle = this.columnWidths[index] + 'px';
                header.style.width = widthStyle;
                header.style.minWidth = widthStyle;
                header.style.maxWidth = widthStyle;
            }
        });
    }

    hideFixedHeader() {
        if (this.fixedHeader) {
            // Remove the fixed header
            this.fixedHeader.remove();
            this.fixedHeader = null;
            
            // Reset original table column widths to allow natural reflow
            const originalHeaders = this.table.querySelectorAll('thead th');
            originalHeaders.forEach((header) => {
                header.style.width = '';
                header.style.minWidth = '';
                header.style.maxWidth = '';
            });
            
            // Reset table width
            if (this.table) {
                this.table.style.width = '';
                this.table.style.minWidth = '';
            }
        }
    }

    // Throttle function to limit how often the scroll handler runs
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

    // Division preferences functionality
    async setupDivisionPreferences() {
        try {
            const response = await fetch('/api/available-divisions');
            const data = await response.json();
            
            if (!data.success) {
                console.error('Failed to load available divisions');
                return;
            }

            const container = document.getElementById('divisionPreferences');
            if (!container) return;

            // Get current division/tier from URL for default selection
            const currentDivision = this.getCurrentDivisionKey();

            // Group divisions by type
            const repDivisions = data.divisions.filter(d => d.key.includes('-rep-'));
            const selectDivisions = data.divisions.filter(d => d.key.includes('-select-'));

            // Group rep divisions by age
            const repByAge = this.groupRepDivisionsByAge(repDivisions);

            let html = `
                <div class="division-preferences-header">
                    <label class="form-label">
                        <i class="bi bi-list-check"></i>
                        Select Divisions for Notifications
                    </label>
                    <div class="selection-summary">
                        <span class="selection-count">0 selected</span>
                        <button type="button" class="btn-clear-all">Clear All</button>
                    </div>
                </div>
                
                <div class="division-preferences-compact">
                    <!-- Quick Actions -->
                    <div class="quick-actions">
                        <button type="button" class="btn-quick-action" data-action="select-all">
                            <i class="bi bi-check-all"></i> Select All
                        </button>
                        <button type="button" class="btn-quick-action" data-action="select-rep">
                            <i class="bi bi-trophy"></i> All Rep
                        </button>
                        <button type="button" class="btn-quick-action" data-action="select-select">
                            <i class="bi bi-star"></i> All Select
                        </button>
                    </div>

                    <!-- Select Divisions (Compact) -->
                    <div class="division-section">
                        <div class="section-header">
                            <h6><i class="bi bi-star-fill"></i> Select Divisions</h6>
                            <small class="text-muted">All teams in division</small>
                        </div>
                        <div class="division-pills">
            `;

            selectDivisions.forEach(division => {
                const age = division.key.split('-')[0];
                const isDefault = division.key === currentDivision;
                html += `
                    <label class="division-pill ${isDefault ? 'selected' : ''}" for="div_${division.key}">
                        <input type="checkbox" id="div_${division.key}" value="${division.key}" ${isDefault ? 'checked' : ''}>
                        <span class="pill-text">${age}</span>
                    </label>
                `;
            });

            html += `
                        </div>
                    </div>

                    <!-- Rep Divisions (Grouped by Age) -->
                    <div class="division-section">
                        <div class="section-header">
                            <h6><i class="bi bi-trophy-fill"></i> Rep Divisions</h6>
                            <small class="text-muted">By tier level</small>
                        </div>
                        <div class="rep-divisions-grid">
            `;

            // Create rep divisions grouped by age
            Object.keys(repByAge).sort((a, b) => parseInt(a) - parseInt(b)).forEach(age => {
                const divisions = repByAge[age];
                html += `
                    <div class="age-group">
                        <div class="age-label">${age}</div>
                        <div class="tier-pills">
                `;
                
                divisions.forEach(division => {
                    const tierMatch = division.key.match(/tier-(\d+)|no-tier/);
                    const tierLabel = tierMatch ? (tierMatch[1] ? `T${tierMatch[1]}` : 'All') : 'T?';
                    const isDefault = division.key === currentDivision;
                    
                    html += `
                        <label class="tier-pill ${isDefault ? 'selected' : ''}" for="div_${division.key}">
                            <input type="checkbox" id="div_${division.key}" value="${division.key}" ${isDefault ? 'checked' : ''}>
                            <span class="pill-text">${tierLabel}</span>
                        </label>
                    `;
                });
                
                html += `
                        </div>
                    </div>
                `;
            });

            html += `
                        </div>
                    </div>
                </div>
                
                <small class="form-text text-muted">
                    Select divisions to receive email notifications when standings change.
                </small>
            `;

            container.innerHTML = html;

            // Setup interactive behaviors
            this.setupDivisionPreferencesInteractions();

            if (this.debug) {
                console.log('Division preferences setup completed', { currentDivision, totalDivisions: data.divisions.length });
            }
        } catch (error) {
            console.error('Error setting up division preferences:', error);
        }
    }

    groupRepDivisionsByAge(repDivisions) {
        const grouped = {};
        repDivisions.forEach(division => {
            const age = division.key.split('-')[0];
            if (!grouped[age]) {
                grouped[age] = [];
            }
            grouped[age].push(division);
        });
        return grouped;
    }

    setupDivisionPreferencesInteractions() {
        const container = document.getElementById('divisionPreferences');
        if (!container) return;

        // Update selection count
        const updateSelectionCount = () => {
            const selected = container.querySelectorAll('input[type="checkbox"]:checked').length;
            const countElement = container.querySelector('.selection-count');
            if (countElement) {
                countElement.textContent = `${selected} selected`;
            }
        };

        // Handle checkbox changes
        container.addEventListener('change', (e) => {
            if (e.target.type === 'checkbox') {
                const pill = e.target.closest('.division-pill, .tier-pill');
                if (pill) {
                    pill.classList.toggle('selected', e.target.checked);
                }
                updateSelectionCount();
            }
        });

        // Handle quick actions
        container.addEventListener('click', (e) => {
            const button = e.target.closest('[data-action]');
            if (!button) return;

            const action = button.dataset.action;
            const checkboxes = container.querySelectorAll('input[type="checkbox"]');

            switch (action) {
                case 'select-all':
                    checkboxes.forEach(cb => {
                        cb.checked = true;
                        const pill = cb.closest('.division-pill, .tier-pill');
                        if (pill) pill.classList.add('selected');
                    });
                    break;
                case 'select-rep':
                    checkboxes.forEach(cb => {
                        const isRep = cb.value.includes('-rep-');
                        cb.checked = isRep;
                        const pill = cb.closest('.division-pill, .tier-pill');
                        if (pill) pill.classList.toggle('selected', isRep);
                    });
                    break;
                case 'select-select':
                    checkboxes.forEach(cb => {
                        const isSelect = cb.value.includes('-select-');
                        cb.checked = isSelect;
                        const pill = cb.closest('.division-pill, .tier-pill');
                        if (pill) pill.classList.toggle('selected', isSelect);
                    });
                    break;
            }
            updateSelectionCount();
        });

        // Handle clear all
        container.addEventListener('click', (e) => {
            if (e.target.closest('.btn-clear-all')) {
                const checkboxes = container.querySelectorAll('input[type="checkbox"]');
                checkboxes.forEach(cb => {
                    cb.checked = false;
                    const pill = cb.closest('.division-pill, .tier-pill');
                    if (pill) pill.classList.remove('selected');
                });
                updateSelectionCount();
            }
        });

        // Initial count update
        updateSelectionCount();
    }

    getCurrentDivisionKey() {
        // Try to determine current division from URL path
        const path = window.location.pathname;
        const pathMatch = path.match(/^\/([^\/]+)\/([^\/]+)/);
        
        if (pathMatch) {
            const [, division, tier] = pathMatch;
            return `${division}-${tier}`;
        }
        
        // Fallback: return null for default page
        return null;
    }

    getSelectedDivisionPreferences() {
        const checkboxes = document.querySelectorAll('#divisionPreferences input[type="checkbox"]:checked');
        return Array.from(checkboxes).map(cb => cb.value);
    }

    resetDivisionPreferences() {
        const checkboxes = document.querySelectorAll('#divisionPreferences input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            // Reset to default state (only current division checked if it exists)
            const currentDivision = this.getCurrentDivisionKey();
            checkbox.checked = checkbox.value === currentDivision;
        });
    }

    syncHeaderPosition() {
        if (!this.fixedHeader || !this.tableContainer) return;
        
        const fixedTableContainer = this.fixedHeader.querySelector('.table-container');
        if (!fixedTableContainer) return;
        
        // Revolutionary approach: Direct position mirroring
        // Instead of separate scroll containers, we position the fixed header's table
        // to exactly mirror the main table's scroll position using transforms
        const scrollLeft = this.tableContainer.scrollLeft;
        const fixedTable = fixedTableContainer.querySelector('.standings-table');
        
        if (fixedTable) {
            // Instantly position the table to match main table scroll
            fixedTable.style.transform = `translateX(-${scrollLeft}px)`;
        }
    }
}

// Initialize the app when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 YSBA Standings App initialized');
    window.app = new YSBAStandingsApp();
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (window.app) {
        window.app.destroy();
    }
}); 