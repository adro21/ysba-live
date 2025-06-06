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

        // Show current preference - simplified to just "All Teams"
        document.getElementById('current-preference').textContent = 'YSBA 9U Select Division Updates';

        // Show the form
        document.getElementById('loading').style.display = 'none';
        document.getElementById('manage-form').style.display = 'block';

    } catch (error) {
        showError('Failed to load subscription information. Please try again later.');
        console.error('Error loading subscriber info:', error);
    }
}

// Form submission
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('preferences-form').addEventListener('submit', async function(e) {
        e.preventDefault();

        const formData = new FormData(e.target);
        const data = {
            name: formData.get('name')
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