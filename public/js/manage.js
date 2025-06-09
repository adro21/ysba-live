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
    const alertClass = type === 'success' ? 'alert-success' : 'alert-danger';
    const iconClass = type === 'success' ? 'bi-check-circle' : 'bi-exclamation-triangle';
    
    alertContainer.innerHTML = `
        <div class="alert ${alertClass} alert-dismissible fade show" role="alert">
            <i class="${iconClass} me-2"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>
    `;
    
    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
        setTimeout(() => {
            const alert = alertContainer.querySelector('.alert');
            if (alert) {
                const bsAlert = new bootstrap.Alert(alert);
                bsAlert.close();
            }
        }, 5000);
    }
}

async function loadSubscriberInfo() {
    try {
        console.log('Loading subscriber info for token:', token);
        const response = await fetch(`/api/subscriber/${token}`);
        console.log('Response status:', response.status);
        const data = await response.json();
        console.log('Response data:', data);

        if (!response.ok) {
            console.error('Response not ok:', response.status, data);
            showError(data.error || 'Failed to load subscription information');
            return;
        }

        if (!data.success) {
            console.error('API returned success: false', data);
            showError(data.error || 'Failed to load subscription information');
            return;
        }

        // Populate current info
        console.log('Populating current info...');
        document.getElementById('current-email').textContent = data.email;
        document.getElementById('subscribed-date').textContent = new Date(data.subscribedAt).toLocaleDateString();
        
        // Populate form
        console.log('Populating form...');
        document.getElementById('name').value = data.name || '';
        document.getElementById('email').value = data.email;

        // Show current preferences
        console.log('Displaying current preferences...');
        await displayCurrentPreferences(data.divisionPreferences || []);
        
        // Setup division preferences form
        console.log('Setting up division preferences form...');
        await setupDivisionPreferencesForm(data.divisionPreferences || []);

        // Show the form
        console.log('Showing the form...');
        document.getElementById('loading').style.display = 'none';
        document.getElementById('manage-form').style.display = 'block';
        console.log('Form should now be visible');

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

        const container = document.getElementById('divisionsList');
        if (!container) return;

        let html = '';
        
        // Render each division as a card (matching the main app style)
        data.divisions.forEach(division => {
            const isSelected = currentPreferences.includes(division.key);
            
            html += `
                <div class="division-option ${isSelected ? 'selected' : ''}" data-division="${division.key}">
                    <label class="division-label" for="div_${division.key}">
                        <input type="checkbox" id="div_${division.key}" value="${division.key}" ${isSelected ? 'checked' : ''}>
                        <div class="division-info">
                            <div class="division-name">${division.display}</div>
                            <div class="division-desc">${getDivisionDescription(division.key)}</div>
                        </div>
                        <div class="check-indicator">
                            <i class="bi bi-check-circle-fill"></i>
                        </div>
                    </label>
                </div>
            `;
        });

        container.innerHTML = html;

        // Setup interactive behaviors
        setupDivisionPreferencesInteractions();

        // Update initial count
        updateSelectionCount();

    } catch (error) {
        console.error('Error setting up division preferences form:', error);
    }
}

function getDivisionDescription(divisionKey) {
    if (divisionKey.includes('select')) {
        return 'All teams in division';
    } else if (divisionKey.includes('no-tier')) {
        return 'All tiers combined';
    } else if (divisionKey.includes('tier-1')) {
        return 'Tier 1 (A/AA level)';
    } else if (divisionKey.includes('tier-2')) {
        return 'Tier 2 (AA/AAA level)';
    } else if (divisionKey.includes('tier-3')) {
        return 'Tier 3 (AAA level)';
    }
    return 'Baseball division';
}

function setupDivisionPreferencesInteractions() {
    const container = document.getElementById('divisionsList');
    const clearAllBtn = document.getElementById('clearAllBtn');
    
    if (!container) return;

    // Handle checkbox changes
    container.addEventListener('change', (e) => {
        if (e.target.type === 'checkbox') {
            const divisionOption = e.target.closest('.division-option');
            if (divisionOption) {
                divisionOption.classList.toggle('selected', e.target.checked);
            }
            updateSelectionCount();
        }
    });

    // Handle clear all button
    if (clearAllBtn) {
        clearAllBtn.addEventListener('click', () => {
            const checkboxes = container.querySelectorAll('input[type="checkbox"]');
            checkboxes.forEach(cb => {
                cb.checked = false;
                const divisionOption = cb.closest('.division-option');
                if (divisionOption) {
                    divisionOption.classList.remove('selected');
                }
            });
            updateSelectionCount();
        });
    }
}

function updateSelectionCount() {
    const container = document.getElementById('divisionsList');
    const badge = document.getElementById('selectionBadge');
    
    if (!container || !badge) return;
    
    const selected = container.querySelectorAll('input[type="checkbox"]:checked').length;
    badge.textContent = `${selected} selected`;
    
    // Show/hide badge based on selection
    if (selected > 0) {
        badge.style.display = 'inline-block';
    } else {
        badge.style.display = 'none';
    }
}

function getSelectedDivisionPreferences() {
    const checkboxes = document.querySelectorAll('#divisionsList input[type="checkbox"]:checked');
    return Array.from(checkboxes).map(cb => cb.value);
}

// Form submission
document.addEventListener('DOMContentLoaded', function() {
    // Preferences form submission
    document.getElementById('preferences-form').addEventListener('submit', async function(e) {
        e.preventDefault();

        const formData = new FormData(e.target);
        const selectedDivisions = getSelectedDivisionPreferences();
        
        const data = {
            name: formData.get('name'),
            email: formData.get('email'),
            divisionPreferences: selectedDivisions
        };

        // Validate email
        if (!data.email || !data.email.includes('@')) {
            showAlert('Please enter a valid email address.', 'error');
            return;
        }

        // Validate at least one division selected
        if (selectedDivisions.length === 0) {
            showAlert('Please select at least one division to receive notifications for.', 'error');
            return;
        }

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
                
                // Update the current info display
                document.getElementById('current-email').textContent = data.email;
                await displayCurrentPreferences(selectedDivisions);
                
                // Update the email field in the form to reflect any changes
                document.getElementById('email').value = data.email;
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
        const confirmed = confirm(
            'Are you sure you want to unsubscribe from all notifications?\n\n' +
            'This will remove you from all YSBA standings email notifications. ' +
            'You can always resubscribe later from the main standings page.'
        );
        
        if (!confirmed) {
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
                // Show success message and hide the form
                document.getElementById('manage-form').innerHTML = `
                    <div class="card">
                        <div class="card-body text-center py-5">
                            <div class="mb-4">
                                <i class="bi bi-check-circle text-success" style="font-size: 3rem;"></i>
                            </div>
                            <h4 class="text-success mb-3">Successfully Unsubscribed</h4>
                            <p class="text-muted mb-4">
                                You have been removed from all YSBA standings email notifications.
                                You can always resubscribe from the main standings page.
                            </p>
                            <a href="/" class="btn btn-primary">
                                <i class="bi bi-house me-2"></i>
                                Back to Standings
                            </a>
                        </div>
                    </div>
                `;
            } else {
                showAlert(result.error || 'Failed to unsubscribe', 'error');
            }
        } catch (error) {
            showAlert('Failed to unsubscribe. Please try again.', 'error');
            console.error('Unsubscribe error:', error);
        }
    });
});