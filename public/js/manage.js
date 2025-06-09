// Get token from URL params
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');

if (!token) {
    showError('No token provided. This link may be invalid or expired.');
} else {
    loadSubscriberInfo();
}

function showError(message) {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('manage-form').style.display = 'none';
    document.getElementById('error-message').textContent = message;
    document.getElementById('error-container').style.display = 'block';
}

function showAlert(message, type = 'success') {
    const alertContainer = document.getElementById('alert-container');
    alertContainer.innerHTML = `
        <div class="alert alert-${type}">
            <p>${message}</p>
        </div>
    `;
    
    // Auto-hide success messages
    if (type === 'success') {
        setTimeout(() => {
            alertContainer.innerHTML = '';
        }, 5000);
    }
}

async function loadSubscriberInfo() {
    try {
        const response = await fetch(`/api/subscriber/${token}`);
        const data = await response.json();

        if (!response.ok) {
            showError(data.error || 'Failed to load subscription information');
            return;
        }

        // Populate current info
        document.getElementById('current-email').textContent = data.email;
        document.getElementById('subscribed-date').textContent = new Date(data.subscribedAt).toLocaleDateString();
        
        // Populate form
        document.getElementById('name').value = data.name || '';

        // Show current preferences
        await displayCurrentPreferences(data.divisionPreferences || []);
        
        // Setup division preferences form
        await setupDivisionPreferencesForm(data.divisionPreferences || []);

        // Show the form
        document.getElementById('loading').style.display = 'none';
        document.getElementById('manage-form').style.display = 'block';

    } catch (error) {
        showError('Failed to load subscription information. Please try again later.');
        console.error('Error loading subscriber info:', error);
    }
}

async function displayCurrentPreferences(preferences) {
    try {
        const response = await fetch('/api/available-divisions');
        const data = await response.json();
        
        if (!data.success) {
            document.getElementById('current-preference').textContent = 'Unable to load preferences';
            return;
        }

        if (preferences.length === 0) {
            document.getElementById('current-preference').textContent = 'All divisions (legacy subscription)';
            return;
        }

        const divisionNames = preferences.map(prefKey => {
            const division = data.divisions.find(d => d.key === prefKey);
            return division ? division.display : prefKey;
        });

        document.getElementById('current-preference').textContent = divisionNames.join(', ');
    } catch (error) {
        console.error('Error displaying preferences:', error);
        document.getElementById('current-preference').textContent = 'Error loading preferences';
    }
}

async function setupDivisionPreferencesForm(currentPreferences) {
    try {
        const response = await fetch('/api/available-divisions');
        const data = await response.json();
        
        if (!data.success) {
            console.error('Failed to load available divisions');
            return;
        }

        const container = document.getElementById('divisionPreferencesForm');
        if (!container) return;

        // Group divisions by type
        const repDivisions = data.divisions.filter(d => d.key.includes('-rep-'));
        const selectDivisions = data.divisions.filter(d => d.key.includes('-select-'));

        // Group rep divisions by age
        const repByAge = groupRepDivisionsByAge(repDivisions);

        let html = `
            <div class="form-group">
                <div class="division-preferences-header">
                    <label class="form-label">
                        <i class="bi bi-list-check"></i>
                        Division Notifications
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
            const isSelected = currentPreferences.includes(division.key);
            html += `
                <label class="division-pill ${isSelected ? 'selected' : ''}" for="pref_${division.key}">
                    <input type="checkbox" id="pref_${division.key}" value="${division.key}" ${isSelected ? 'checked' : ''}>
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
                const isSelected = currentPreferences.includes(division.key);
                
                html += `
                    <label class="tier-pill ${isSelected ? 'selected' : ''}" for="pref_${division.key}">
                        <input type="checkbox" id="pref_${division.key}" value="${division.key}" ${isSelected ? 'checked' : ''}>
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
                    Select which divisions you want to receive email notifications for when standings change.
                </small>
            </div>
        `;

        container.innerHTML = html;

        // Setup interactive behaviors
        setupDivisionPreferencesInteractions();

    } catch (error) {
        console.error('Error setting up division preferences form:', error);
    }
}

function groupRepDivisionsByAge(repDivisions) {
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

function setupDivisionPreferencesInteractions() {
    const container = document.getElementById('divisionPreferencesForm');
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

function getSelectedDivisionPreferences() {
    const checkboxes = document.querySelectorAll('#divisionPreferencesForm input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

// Form submission
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('preferences-form').addEventListener('submit', async function(e) {
        e.preventDefault();

        const formData = new FormData(e.target);
        const selectedDivisions = getSelectedDivisionPreferences();
        
        const data = {
            name: formData.get('name'),
            divisionPreferences: selectedDivisions
        };

        try {
            const response = await fetch(`/api/subscriber/${token}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (response.ok) {
                showAlert('✅ Preferences updated successfully!', 'success');
                // Refresh the current preferences display
                await displayCurrentPreferences(selectedDivisions);
            } else {
                showAlert(result.error || 'Failed to update preferences', 'error');
            }
        } catch (error) {
            showAlert('Failed to update preferences. Please try again.', 'error');
            console.error('Update error:', error);
        }
    });

    // Unsubscribe handler
    document.getElementById('unsubscribe-btn').addEventListener('click', async function() {
        if (!confirm('Are you sure you want to unsubscribe from all notifications?')) {
            return;
        }

        try {
            const response = await fetch('/api/unsubscribe-token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ token })
            });

            const result = await response.json();

            if (response.ok) {
                showAlert('✅ Successfully unsubscribed!', 'success');
                
                // Hide the form after a delay and show a message
                setTimeout(() => {
                    document.getElementById('manage-form').style.display = 'none';
                    document.getElementById('alert-container').innerHTML = `
                        <div class="alert alert-success">
                            <p>You have been successfully unsubscribed from all notifications.</p>
                            <p><a href="/">← Back to Standings</a></p>
                        </div>
                    `;
                }, 2000);
            } else {
                showAlert(result.error || 'Failed to unsubscribe', 'error');
            }
        } catch (error) {
            showAlert('Failed to unsubscribe. Please try again.', 'error');
            console.error('Unsubscribe error:', error);
        }
    });
}); 