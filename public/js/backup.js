class BackupManager {
    constructor() {
        this.init();
    }

    async init() {
        await this.loadSubscriberCount();
        await this.loadGistStatus();
        this.setupEventListeners();
    }

    setupEventListeners() {
        document.getElementById('exportBtn').addEventListener('click', () => this.exportData());
        document.getElementById('syncGistBtn')?.addEventListener('click', () => this.syncToGist());
        document.getElementById('setupGistBtn')?.addEventListener('click', () => this.toggleGistInstructions());
        
        // Copy button will be added dynamically
        document.addEventListener('click', (e) => {
            if (e.target.id === 'copyBtn') {
                this.copyToClipboard();
            }
        });
    }

    async loadSubscriberCount() {
        try {
            const response = await fetch('/api/subscribers/count');
            const data = await response.json();
            
            if (response.ok) {
                document.getElementById('subscriberCount').textContent = 
                    `${data.active} active (${data.total} total)`;
            } else {
                document.getElementById('subscriberCount').textContent = 'Error loading';
                document.getElementById('subscriberCount').className = 'badge bg-danger fs-5';
            }
        } catch (error) {
            console.error('Error loading subscriber count:', error);
            document.getElementById('subscriberCount').textContent = 'Error loading';
            document.getElementById('subscriberCount').className = 'badge bg-danger fs-5';
        }
    }

    async loadGistStatus() {
        try {
            const response = await fetch('/api/backup/gist-status');
            const gistInfo = await response.json();
            
            this.updateGistStatus(gistInfo);
        } catch (error) {
            console.error('Error loading gist status:', error);
            this.updateGistStatus({
                configured: false,
                error: 'Failed to check status'
            });
        }
    }

    updateGistStatus(gistInfo) {
        const statusBadge = document.getElementById('gistStatus');
        const statusDetails = document.getElementById('gistStatusDetails');
        const controls = document.getElementById('gistControls');

        if (!gistInfo.configured) {
            statusBadge.textContent = 'Not Configured';
            statusBadge.className = 'badge bg-warning fs-6';
            
            statusDetails.className = 'alert alert-warning';
            statusDetails.innerHTML = `
                <div class="d-flex align-items-center">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    <div>
                        <strong>GitHub Gist not configured</strong><br>
                        <small>Set GITHUB_TOKEN environment variable for automatic backup</small>
                    </div>
                </div>
            `;
            
            controls.style.display = 'none';
            document.getElementById('setupGistBtn').style.display = 'inline-block';
            
        } else if (!gistInfo.exists) {
            statusBadge.textContent = 'Ready to Create';
            statusBadge.className = 'badge bg-info fs-6';
            
            statusDetails.className = 'alert alert-info';
            statusDetails.innerHTML = `
                <div class="d-flex align-items-center">
                    <i class="bi bi-info-circle me-2"></i>
                    <div>
                        <strong>GitHub Gist configured but no gist created yet</strong><br>
                        <small>Will create automatically on first subscriber save, or sync manually below</small>
                    </div>
                </div>
            `;
            
            controls.style.display = 'block';
            
        } else {
            statusBadge.textContent = 'Active';
            statusBadge.className = 'badge bg-success fs-6';
            
            const lastUpdate = new Date(gistInfo.updatedAt).toLocaleString();
            statusDetails.className = 'alert alert-success';
            statusDetails.innerHTML = `
                <div class="d-flex align-items-center">
                    <i class="bi bi-check-circle me-2"></i>
                    <div>
                        <strong>GitHub Gist backup active</strong><br>
                        <small>Last updated: ${lastUpdate} • ${gistInfo.subscriberCount} subscribers</small><br>
                        <small><a href="${gistInfo.url}" target="_blank">View on GitHub <i class="bi bi-box-arrow-up-right"></i></a></small>
                    </div>
                </div>
            `;
            
            controls.style.display = 'block';
        }

        if (gistInfo.error) {
            statusDetails.className = 'alert alert-danger';
            statusDetails.innerHTML = `
                <div class="d-flex align-items-center">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    <div>
                        <strong>GitHub Gist error</strong><br>
                        <small>${gistInfo.error}</small>
                    </div>
                </div>
            `;
        }
    }

    async syncToGist() {
        const syncBtn = document.getElementById('syncGistBtn');
        const originalText = syncBtn.innerHTML;
        
        try {
            syncBtn.disabled = true;
            syncBtn.innerHTML = '<i class="bi bi-arrow-repeat spin me-2"></i>Syncing...';
            
            const response = await fetch('/api/backup/sync-to-gist', { method: 'POST' });
            const result = await response.json();
            
            if (response.ok && result.success) {
                this.showAlert('Successfully synced to GitHub Gist!', 'success');
                await this.loadGistStatus(); // Refresh status
                await this.loadSubscriberCount(); // Refresh count
            } else {
                this.showAlert(result.message || 'Failed to sync to GitHub Gist', 'danger');
            }
        } catch (error) {
            console.error('Error syncing to gist:', error);
            this.showAlert('Error syncing to GitHub Gist', 'danger');
        } finally {
            syncBtn.disabled = false;
            syncBtn.innerHTML = originalText;
        }
    }

    toggleGistInstructions() {
        const instructions = document.getElementById('gistInstructions');
        if (instructions.classList.contains('d-none')) {
            instructions.classList.remove('d-none');
            document.getElementById('setupGistBtn').innerHTML = 
                '<i class="bi bi-chevron-up me-2"></i>Hide Instructions';
        } else {
            instructions.classList.add('d-none');
            document.getElementById('setupGistBtn').innerHTML = 
                '<i class="bi bi-info-circle me-2"></i>Setup Instructions';
        }
    }

    async exportData() {
        const exportBtn = document.getElementById('exportBtn');
        const originalText = exportBtn.innerHTML;
        
        try {
            exportBtn.disabled = true;
            exportBtn.innerHTML = '<i class="bi bi-arrow-repeat spin me-2"></i>Exporting...';
            
            const response = await fetch('/api/subscribers/export');
            const data = await response.json();
            
            if (response.ok) {
                this.displayExportResult(data);
            } else {
                this.showAlert('Failed to export subscriber data', 'danger');
            }
        } catch (error) {
            console.error('Error exporting data:', error);
            this.showAlert('Error exporting subscriber data', 'danger');
        } finally {
            exportBtn.disabled = false;
            exportBtn.innerHTML = originalText;
        }
    }

    displayExportResult(data) {
        const resultDiv = document.getElementById('exportResult');
        
        document.getElementById('totalSubs').textContent = data.totalSubscribers;
        document.getElementById('activeSubs').textContent = data.activeSubscribers;
        document.getElementById('dataSize').textContent = data.dataSize;
        document.getElementById('jsonData').value = data.envVariableFormat;
        
        resultDiv.classList.remove('d-none');
        
        // Update instructions based on gist status
        const instructionsContainer = resultDiv.querySelector('.alert-info');
        if (data.gistInfo && data.gistInfo.configured) {
            instructionsContainer.innerHTML = `
                <h6><i class="bi bi-info-circle me-2"></i>Environment Variable Setup (Manual Fallback):</h6>
                <p class="mb-2"><strong>⚠️ GitHub Gist is recommended for automatic backup.</strong> This manual method requires updates before each deployment.</p>
                <ol class="mb-0">
                    <li>Copy the JSON data above</li>
                    <li>Go to your <a href="https://dashboard.render.com" target="_blank">Render Dashboard</a></li>
                    <li>Navigate to your service → Environment tab</li>
                    <li>Add/update environment variable: <code>SUBSCRIBERS_DATA</code></li>
                    <li>Paste the JSON data as the value</li>
                    <li>Deploy to activate the backup</li>
                </ol>
            `;
        } else {
            instructionsContainer.innerHTML = `
                <h6><i class="bi bi-info-circle me-2"></i>Environment Variable Setup:</h6>
                <ol class="mb-0">
                    <li>Copy the JSON data above</li>
                    <li>Go to your <a href="https://dashboard.render.com" target="_blank">Render Dashboard</a></li>
                    <li>Navigate to your service → Environment tab</li>
                    <li>Add/update environment variable: <code>SUBSCRIBERS_DATA</code></li>
                    <li>Paste the JSON data as the value</li>
                    <li>Deploy to activate the backup</li>
                </ol>
                <div class="mt-2 p-2 bg-light rounded">
                    <small><strong>💡 Tip:</strong> Consider setting up GitHub Gist backup above for automatic, maintenance-free backups!</small>
                </div>
            `;
        }
    }

    async copyToClipboard() {
        const textArea = document.getElementById('jsonData');
        const copyBtn = document.getElementById('copyBtn');
        const originalText = copyBtn.innerHTML;
        
        try {
            await navigator.clipboard.writeText(textArea.value);
            copyBtn.innerHTML = '<i class="bi bi-check me-1"></i>Copied!';
            copyBtn.className = 'btn btn-sm btn-success mt-2';
            
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
                copyBtn.className = 'btn btn-sm btn-secondary mt-2';
            }, 2000);
        } catch (error) {
            console.error('Error copying to clipboard:', error);
            // Fallback: select the text
            textArea.select();
            textArea.setSelectionRange(0, 99999);
            
            copyBtn.innerHTML = '<i class="bi bi-exclamation me-1"></i>Select manually';
            copyBtn.className = 'btn btn-sm btn-warning mt-2';
            
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
                copyBtn.className = 'btn btn-sm btn-secondary mt-2';
            }, 3000);
        }
    }

    showAlert(message, type) {
        // Create alert element
        const alertDiv = document.createElement('div');
        alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
        alertDiv.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        // Insert at the top of the card body
        const cardBody = document.querySelector('.card-body');
        cardBody.insertBefore(alertDiv, cardBody.firstChild);
        
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            if (alertDiv.parentNode) {
                alertDiv.remove();
            }
        }, 5000);
    }
}

// Add CSS for spin animation
const style = document.createElement('style');
style.textContent = `
    .spin {
        animation: spin 1s linear infinite;
    }
    @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(style);

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new BackupManager();
}); 