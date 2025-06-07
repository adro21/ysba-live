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

        // Convert hex colors to RGB for rgba() usage
        const hexToRgb = (hex) => {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : null;
        };

        const primaryRgb = hexToRgb(theme.primary);
        const primaryRgbString = primaryRgb ? `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}` : '2, 66, 32';

        styleElement.textContent = `
            /* Dynamic theme for ${this.divisionConfig.displayName} */
            :root {
                --theme-primary: ${theme.primary};
                --theme-primary-rgb: ${primaryRgbString};
                --theme-secondary: ${theme.secondary};
                --theme-accent: ${theme.accent};
                --theme-text: ${theme.text};
                --theme-background: ${theme.background};
                --theme-header-bg: ${theme.headerBg};
            }

            .modern-header {
                background: ${theme.headerBg} !important;
            }

            .modern-footer {
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

            .btn-modern:hover {
                background: ${theme.primary} !important;
                color: white !important;
            }

            .text-primary {
                color: ${theme.primary} !important;
            }

            .loading-spinner {
                border-top-color: ${theme.primary} !important;
            }

            .loading-spinner-small {
                border-top-color: ${theme.primary} !important;
            }

            .team-row-clickable:hover {
                background: ${theme.background} !important;
            }

            .team-name {
                color: ${theme.primary} !important;
            }

            .team-name:hover {
                color: ${theme.secondary} !important;
            }

            .brand-text .dropdown-item:hover {
                color: ${theme.primary} !important;
            }

            .brand-text .dropdown-item.active {
                background-color: ${theme.primary} !important;
            }

            .status-actions .dropdown-item:hover {
                color: ${theme.primary} !important;
            }

            .status-actions .dropdown-item.active {
                background-color: ${theme.primary} !important;
            }

            .division-filter-active {
                background: ${theme.primary} !important;
                border-color: ${theme.primary} !important;
            }

            .schedule-tab.active {
                color: ${theme.primary} !important;
                border-bottom-color: ${theme.primary} !important;
            }

            .schedule-tab:hover {
                color: ${theme.primary} !important;
            }

            /* Mega menu active item styling to match division colorway */
            .mega-menu-item.active {
                background: ${theme.primary} !important;
                color: white !important;
                border-color: ${theme.primary} !important;
            }

            .mega-menu-item.active:hover {
                background: ${theme.secondary} !important;
                border-color: ${theme.secondary} !important;
            }

            /* Mobile modal active item styling to match division colorway */
            .division-modal-item.active {
                background: ${theme.primary} !important;
                color: white !important;
                border-color: ${theme.primary} !important;
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
        // Use the divisions loaded from the API instead of window.AppConfig
        const divisions = this.allDivisions || {};
        
        // Create mega menu for desktop
        this.createMegaMenu(divisions);
        
        // Create mobile modal
        this.createMobileModal(divisions);
        
        // Set up event listeners for both
        this.setupMegaMenuEvents();
        this.setupMobileModalEvents();
    }

    createMegaMenu(divisions) {
        // Remove existing mega menu if it exists
        const existingMegaMenu = document.querySelector('.mega-menu');
        if (existingMegaMenu) {
            existingMegaMenu.remove();
        }

        // Create mega menu structure
        const megaMenu = document.createElement('div');
        megaMenu.className = 'mega-menu';
        megaMenu.innerHTML = `
            <div class="mega-menu-content">
                <div class="mega-menu-header">
                    <h3 class="mega-menu-title">Choose Division & Tier</h3>
                    <p class="mega-menu-subtitle">Select your preferred division and tier to view standings</p>
                </div>
                <div class="mega-menu-grid">
                    <div class="mega-menu-section rep-section">
                        <h4 class="mega-menu-section-title">Rep Divisions</h4>
                        <div class="mega-menu-items rep-divisions" id="rep-divisions"></div>
                    </div>
                    <div class="mega-menu-section select-section">
                        <h4 class="mega-menu-section-title">Select Divisions</h4>
                        <div class="mega-menu-items" id="select-divisions"></div>
                    </div>
                </div>
            </div>
        `;

        // Populate divisions
        const repContainer = megaMenu.querySelector('#rep-divisions');
        const selectContainer = megaMenu.querySelector('#select-divisions');

        Object.entries(divisions).forEach(([key, division]) => {
            const isRep = key.includes('-rep');
            const container = isRep ? repContainer : selectContainer;
            
            // Get the main tier for this division
            const tierKeys = Object.keys(division.tiers);
            const mainTierKey = tierKeys[0];
            const tier = division.tiers[mainTierKey];
            
            const item = document.createElement('button');
            item.className = 'mega-menu-item';
            item.dataset.division = key;
            item.dataset.tier = mainTierKey;
            
            // Check if this is the current active division and tier
            if (this.currentDivision === key && this.currentTier === mainTierKey) {
                item.classList.add('active');
            }
            
            item.innerHTML = `
                <div class="mega-menu-item-content">
                    <div class="mega-menu-item-title">${division.displayName}</div>
                    <div class="mega-menu-item-subtitle">${tier.displayName}</div>
                </div>
                <span class="mega-menu-item-badge">${division.shortName}</span>
            `;
            
            container.appendChild(item);
        });

        // Insert mega menu after the dropdown button
        const brandText = document.querySelector('.brand-text');
        if (brandText) {
            brandText.style.position = 'relative';
            brandText.appendChild(megaMenu);
        }
    }

    createMobileModal(divisions) {
        // Remove existing modal if it exists
        const existingModal = document.querySelector('.division-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // Create mobile modal structure
        const modal = document.createElement('div');
        modal.className = 'division-modal';
        modal.innerHTML = `
            <div class="division-modal-content">
                <div class="division-modal-header">
                    <h3 class="division-modal-title">Choose Division</h3>
                    <p class="division-modal-subtitle">Select your preferred division and tier</p>
                    <button class="division-modal-close" aria-label="Close">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="division-modal-body">
                    <div class="division-modal-section">
                        <h4 class="division-modal-section-title">Rep Divisions</h4>
                        <div class="division-modal-items" id="mobile-rep-divisions"></div>
                    </div>
                    <div class="division-modal-section">
                        <h4 class="division-modal-section-title">Select Divisions</h4>
                        <div class="division-modal-items" id="mobile-select-divisions"></div>
                    </div>
                </div>
            </div>
        `;

        // Populate divisions
        const repContainer = modal.querySelector('#mobile-rep-divisions');
        const selectContainer = modal.querySelector('#mobile-select-divisions');

        Object.entries(divisions).forEach(([key, division]) => {
            const isRep = key.includes('-rep');
            const container = isRep ? repContainer : selectContainer;
            
            // Get the main tier for this division
            const tierKeys = Object.keys(division.tiers);
            const mainTierKey = tierKeys[0];
            const tier = division.tiers[mainTierKey];
            
            const item = document.createElement('button');
            item.className = 'division-modal-item';
            item.dataset.division = key;
            item.dataset.tier = mainTierKey;
            
            // Check if this is the current active division and tier
            if (this.currentDivision === key && this.currentTier === mainTierKey) {
                item.classList.add('active');
            }
            
            item.innerHTML = `
                <div class="division-modal-item-content">
                    <div class="division-modal-item-title">${division.displayName}</div>
                    <div class="division-modal-item-subtitle">${tier.displayName}</div>
                </div>
                <span class="division-modal-item-badge">${division.shortName}</span>
            `;
            
            container.appendChild(item);
        });

        // Append modal to body
        document.body.appendChild(modal);
    }

    setupMegaMenuEvents() {
        const megaMenu = document.querySelector('.mega-menu');
        const dropdownBtn = document.querySelector('.brand-subtitle-btn');
        
        if (!megaMenu || !dropdownBtn) return;

        // Toggle mega menu on button click (desktop only)
        dropdownBtn.addEventListener('click', (e) => {
            if (window.innerWidth >= 992) {
                e.preventDefault();
                e.stopPropagation();
                
                const isOpen = megaMenu.classList.contains('show');
                
                if (isOpen) {
                    this.closeMegaMenu();
                } else {
                    this.openMegaMenu();
                }
            }
        });

        // Handle mega menu item clicks
        megaMenu.addEventListener('click', (e) => {
            const item = e.target.closest('.mega-menu-item');
            if (item) {
                e.preventDefault();
                const division = item.dataset.division;
                const tier = item.dataset.tier;
                
                // Update active state
                megaMenu.querySelectorAll('.mega-menu-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                
                // Navigate to new division
                this.navigateToDivision(division, tier);
                this.closeMegaMenu();
            }
        });

        // Close mega menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!megaMenu.contains(e.target) && !dropdownBtn.contains(e.target)) {
                this.closeMegaMenu();
            }
        });

        // Close mega menu on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeMegaMenu();
            }
        });
    }

    setupMobileModalEvents() {
        const modal = document.querySelector('.division-modal');
        const dropdownBtn = document.querySelector('.brand-subtitle-btn');
        const closeBtn = modal?.querySelector('.division-modal-close');
        
        if (!modal || !dropdownBtn) return;

        // Open modal on button click (mobile only)
        dropdownBtn.addEventListener('click', (e) => {
            if (window.innerWidth < 992) {
                e.preventDefault();
                e.stopPropagation();
                this.openMobileModal();
            }
        });

        // Close modal on close button click
        closeBtn?.addEventListener('click', () => {
            this.closeMobileModal();
        });

        // Close modal on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeMobileModal();
            }
        });

        // Handle modal item clicks
        modal.addEventListener('click', (e) => {
            const item = e.target.closest('.division-modal-item');
            if (item) {
                e.preventDefault();
                const division = item.dataset.division;
                const tier = item.dataset.tier;
                
                // Update active state
                modal.querySelectorAll('.division-modal-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                
                // Navigate to new division
                this.navigateToDivision(division, tier);
                this.closeMobileModal();
            }
        });

        // Close modal on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeMobileModal();
            }
        });
    }

    openMegaMenu() {
        const megaMenu = document.querySelector('.mega-menu');
        const dropdownBtn = document.querySelector('.brand-subtitle-btn');
        
        if (megaMenu) {
            megaMenu.classList.add('show');
            dropdownBtn?.setAttribute('aria-expanded', 'true');
        }
    }

    closeMegaMenu() {
        const megaMenu = document.querySelector('.mega-menu');
        const dropdownBtn = document.querySelector('.brand-subtitle-btn');
        
        if (megaMenu) {
            megaMenu.classList.remove('show');
            dropdownBtn?.setAttribute('aria-expanded', 'false');
        }
    }

    openMobileModal() {
        const modal = document.querySelector('.division-modal');
        if (modal) {
            modal.classList.add('show');
            document.body.style.overflow = 'hidden';
        }
    }

    closeMobileModal() {
        const modal = document.querySelector('.division-modal');
        if (modal) {
            modal.classList.remove('show');
            document.body.style.overflow = '';
        }
    }

    async navigateToDivision(divisionKey, tierKey) {
        // Update URL and reload with new division
        const newPath = `/${divisionKey}/${tierKey}`;
        window.history.pushState({}, '', newPath);
        
        // Update current division/tier
        this.currentDivision = divisionKey;
        this.currentTier = tierKey;
        
        // Update division and tier config from loaded divisions
        if (this.allDivisions && this.allDivisions[divisionKey]) {
            this.divisionConfig = this.allDivisions[divisionKey];
            this.tierConfig = this.divisionConfig.tiers[tierKey];
            
            // Set division mapping if available
            if (this.divisionConfig.divisionMapping) {
                this.divisionMapping = this.divisionConfig.divisionMapping;
            }
        }
        
        // Update button text
        if (this.divisionConfig) {
            const dropdownBtn = document.querySelector('.brand-subtitle-btn');
            const buttonText = dropdownBtn?.querySelector('.dropdown-button-text');
            if (buttonText) {
                buttonText.textContent = this.divisionConfig.shortName;
            }
        }
        
        // Apply theming first, then load standings and update UI
        this.applyDynamicTheming();
        this.updateUIElements();
        await this.loadStandings(true);
    }

    setupEventListeners() {
        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', (e) => {
                e.preventDefault();
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
        
        // Always show loading state, whether it's initial load or refresh
        this.showLoadingState();

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
        
        // Show button loading state with spinning refresh icon (keep text on desktop)
        refreshBtn.classList.add('btn-loading', 'btn-refreshing');
        
        // On mobile, only show icon. On desktop, keep the text
        if (window.innerWidth <= 768) {
            refreshBtn.innerHTML = '<i class="bi bi-arrow-repeat"></i>';
        } else {
            // For desktop, keep the text but replace the icon with spinning one
            refreshBtn.innerHTML = '<i class="bi bi-arrow-repeat"></i><span class="d-none d-md-inline">Refresh</span>';
        }

        try {
            await this.loadStandings(true);
            this.showRefreshSuccess(refreshBtn, originalContent);
        } catch (error) {
            // Restore button immediately on error
            refreshBtn.classList.remove('btn-loading', 'btn-refreshing');
            refreshBtn.innerHTML = originalContent;
        }
    }

    showRefreshSuccess(refreshBtn, originalContent) {
        // Remove loading classes and add success state
        refreshBtn.classList.remove('btn-loading', 'btn-refreshing');
        refreshBtn.classList.add('btn-success-state');
        
        // On mobile, only show icon. On desktop, keep the text
        if (window.innerWidth <= 768) {
            refreshBtn.innerHTML = '<i class="bi bi-check"></i>';
        } else {
            refreshBtn.innerHTML = '<i class="bi bi-check"></i><span class="d-none d-md-inline">Updated</span>';
        }
        
        // Keep disabled during success animation
        setTimeout(() => {
            // Restore original state after success animation
            refreshBtn.classList.remove('btn-success-state');
            refreshBtn.innerHTML = originalContent;
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
        try {
            // Show modal immediately with loading state
            const modal = document.getElementById('scheduleModal');
            document.getElementById('scheduleModalTitle').textContent = teamName;
            this.showScheduleLoading();
            
            const modalInstance = new bootstrap.Modal(modal);
            modalInstance.show();

            console.log(`⚡ Loading schedule for team ${teamCode}...`);
            const startTime = Date.now();
            
            // NEW: Use fast cache-aware endpoint with current division/tier
            const divisionKey = this.currentDivision || '9U-select';
            const tierKey = this.currentTier || 'all-tiers';
            
            const response = await fetch(`/api/team/${teamCode}/schedule?division=${divisionKey}&tier=${tierKey}`);
            const loadTime = Date.now() - startTime;
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            
            // Performance feedback in console
            if (result.fromCache && loadTime < 500) {
                console.log(`⚡ INSTANT: Schedule loaded from cache (${loadTime}ms)`);
            } else if (loadTime < 2000) {
                console.log(`🚀 FAST: Schedule loaded (${loadTime}ms)`);
            } else {
                console.log(`📥 FRESH: Schedule scraped (${loadTime}ms)`);
            }
            
            if (result.success && result.data) {
                this.displayNewSchedule(result.data, teamName, this.getTeamData(teamCode));
                
                // Show subtle performance indicator to user if very fast
                if (result.fromCache && loadTime < 300) {
                    // Could add a brief "⚡ Cached" indicator here if desired
                }
            } else {
                throw new Error('Invalid schedule data');
            }
            
        } catch (error) {
            console.error('Error loading team schedule:', error);
            this.showScheduleError(error.message);
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

        // Use the pre-separated games from the new schedule structure
        const playedGames = (scheduleData.playedGames || []).slice().sort((a, b) => {
            // Sort played games newest first (reverse chronological)
            if (!a.date || !b.date) return 0;
            return new Date(b.date) - new Date(a.date);
        });
        const upcomingGames = scheduleData.upcomingGames || [];
        
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
                Played (${playedGames.length})
            </button>
            <button class="schedule-tab" data-tab="upcoming">
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
        // Use the pre-calculated values from the API data
        const isHome = game.isHome;
        const opponent = game.opponent;
        
        // Game result logic - determine if this is a future game
        const now = new Date();
        const gameDate = game.date ? new Date(game.date) : null;
        const isFutureGame = gameDate && gameDate > now;
        
        let resultClass = 'no-result';
        let resultText = 'No Result';
        
        if (game.isCompleted && game.teamScore !== null && game.opponentScore !== null) {
            // Game has scores - show win/loss/tie
            if (game.teamScore > game.opponentScore) {
                resultClass = 'win';
                resultText = 'Win';
            } else if (game.teamScore < game.opponentScore) {
                resultClass = 'loss';
                resultText = 'Loss';
            } else {
                resultClass = 'tie';
                resultText = 'Tie';
            }
            resultClass = 'completed ' + resultClass;
        } else if (isFutureGame) {
            // Future game - show upcoming
            resultClass = 'upcoming';
            resultText = 'Upcoming';
        } else {
            // Past game without scores - show no result
            resultClass = 'no-result';
            resultText = 'No Result';
        }

        // Format date
        let formattedDate = 'TBD';
        if (game.date) {
            const gameDate = new Date(game.date);
            formattedDate = gameDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric'
            });
        }

        // Score display
        let scoreDisplay = '';
        if (game.isCompleted && game.teamScore !== null && game.opponentScore !== null) {
            // Game has scores - show actual score with FINAL label
            scoreDisplay = `<strong>${game.teamScore} - ${game.opponentScore}</strong>
                    <div class="score-labels">
                        <small class="text-muted">Final</small>
                    </div>`;
        } else if (isFutureGame) {
            // Future game - show time or TBD
            scoreDisplay = game.time || 'TBD';
        } else {
            // Past game without scores - show special "No Result" HTML
            scoreDisplay = `<strong>-</strong>
                    <div class="score-labels">
                        <small class="text-muted">No Score</small>
                    </div>`;
        }

        return `
            <div class="game-card ${resultClass}">
                <div class="game-content">
                    <div class="game-left-column">
                        <div class="game-result ${resultClass}">
                            ${resultText}
                        </div>
                        <div class="game-opponent">${this.escapeHtml(opponent)}</div>
                        <div class="game-details">
                            <div class="game-detail">
                                <i class="bi bi-calendar3-fill"></i>
                                ${formattedDate} <i class="${isHome ? 'bi bi-house-fill' : 'bi bi-airplane-fill'}"></i>
                                ${isHome ? 'Home' : 'Away'}
                            </div>
                        </div>
                    </div>
                    <div class="game-right-column">
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

    // Sticky header functionality (Working implementation from ysba-9u-standings)
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
        
        // Cleanup sticky header handlers
        if (this.stickyHeaderHandler) {
            window.removeEventListener('scroll', this.stickyHeaderHandler);
        }
        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
        }
        if (this.horizontalScrollHandler && this.tableContainer) {
            this.tableContainer.removeEventListener('scroll', this.horizontalScrollHandler);
        }
        if (this.fixedHeader) {
            this.hideFixedHeader();
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