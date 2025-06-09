const sgMail = require('@sendgrid/mail');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');

class EmailService {
    constructor() {
        // Initialize SendGrid with API key from environment
        const apiKey = process.env.SENDGRID_API_KEY;
        if (apiKey && apiKey !== 'your_api_key_here') {
            sgMail.setApiKey(apiKey);
            this.isConfigured = true;
        } else {
            this.isConfigured = false;
            console.log('📧 SendGrid not configured - email notifications disabled');
        }
        
        this.fromEmail = process.env.FROM_EMAIL || 'notifications@ysbalive.com';
        this.fromName = process.env.FROM_NAME || 'YSBA Live';
        this.subscribersFile = path.join(__dirname, 'subscribers.json');
        this.backupDir = path.join(__dirname, 'backup');
        this.baseUrl = process.env.BASE_URL || 'https://ysbalive.com';
        
        // GitHub Gist configuration for persistent storage
        this.githubToken = process.env.GITHUB_TOKEN;
        this.gistId = process.env.GIST_ID || null;
        this.gistFilename = 'ysba-subscribers.json';
        this.gistDescription = 'YSBA Live Email Subscribers';
        
        // Check GitHub configuration
        if (this.githubToken && this.githubToken !== 'your_github_token_here') {
            this.isGithubConfigured = true;
            console.log('📧 GitHub Gist storage configured');
        } else {
            this.isGithubConfigured = false;
            console.log('📧 GitHub Gist not configured - using local storage only');
        }
    }

    // Create backup directory if it doesn't exist
    async ensureBackupDir() {
        try {
            await fs.access(this.backupDir);
        } catch {
            await fs.mkdir(this.backupDir, { recursive: true });
        }
    }

    // Create timestamped backup of subscribers
    async backupSubscribers() {
        try {
            await this.ensureBackupDir();
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const backupFile = path.join(this.backupDir, `subscribers-${timestamp}.json`);
            
            // Only backup if the main file exists
            try {
                await fs.access(this.subscribersFile);
                await fs.copyFile(this.subscribersFile, backupFile);
                console.log(`📧 Subscriber backup created: ${backupFile}`);
            } catch {
                // Main file doesn't exist yet, no backup needed
            }
        } catch (error) {
            console.error('Error creating subscriber backup:', error);
        }
    }

    // Generate unique token for subscriber
    generateToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    // GitHub Gist API methods
    async createGist(subscribers) {
        if (!this.isGithubConfigured) return null;
        
        try {
            const gistData = {
                description: this.gistDescription,
                public: false,
                files: {
                    [this.gistFilename]: {
                        content: JSON.stringify({
                            subscribers,
                            metadata: {
                                updatedAt: new Date().toISOString(),
                                totalSubscribers: subscribers.length,
                                activeSubscribers: subscribers.filter(s => s.active).length,
                                version: '2.0.0',
                                source: 'ysba-standings'
                            }
                        }, null, 2)
                    }
                }
            };

            const response = await axios.post('https://api.github.com/gists', gistData, {
                headers: {
                    'Authorization': `token ${this.githubToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'YSBA-Standings-App'
                }
            });

            console.log(`📧 Created new GitHub gist: ${response.data.id}`);
            return response.data.id;
        } catch (error) {
            console.error('Error creating GitHub gist:', error.response?.data || error.message);
            return null;
        }
    }

    async updateGist(subscribers) {
        if (!this.isGithubConfigured || !this.gistId) return false;
        
        try {
            const gistData = {
                files: {
                    [this.gistFilename]: {
                        content: JSON.stringify({
                            subscribers,
                            metadata: {
                                updatedAt: new Date().toISOString(),
                                totalSubscribers: subscribers.length,
                                activeSubscribers: subscribers.filter(s => s.active).length,
                                version: '2.0.0',
                                source: 'ysba-standings'
                            }
                        }, null, 2)
                    }
                }
            };

            await axios.patch(`https://api.github.com/gists/${this.gistId}`, gistData, {
                headers: {
                    'Authorization': `token ${this.githubToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'YSBA-Standings-App'
                }
            });

            console.log(`📧 Updated GitHub gist with ${subscribers.length} subscribers`);
            return true;
        } catch (error) {
            console.error('Error updating GitHub gist:', error.response?.data || error.message);
            return false;
        }
    }

    async loadFromGist() {
        if (!this.isGithubConfigured || !this.gistId) return null;
        
        try {
            const response = await axios.get(`https://api.github.com/gists/${this.gistId}`, {
                headers: {
                    'Authorization': `token ${this.githubToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'YSBA-Standings-App'
                }
            });

            const fileContent = response.data.files[this.gistFilename];
            if (!fileContent) {
                console.error(`📧 Gist file ${this.gistFilename} not found`);
                return null;
            }

            const data = JSON.parse(fileContent.content);
            const subscribers = data.subscribers || data; // Support both new and old formats
            
            console.log(`📧 Loaded ${subscribers.length} subscribers from GitHub gist`);
            return subscribers;
        } catch (error) {
            console.error('Error loading from GitHub gist:', error.response?.data || error.message);
            return null;
        }
    }

    async saveToGist(subscribers) {
        if (!this.isGithubConfigured) return false;

        try {
            // If we don't have a gist ID, create a new gist
            if (!this.gistId) {
                const newGistId = await this.createGist(subscribers);
                if (newGistId) {
                    this.gistId = newGistId;
                    console.log(`🔧 Set GIST_ID environment variable to: ${newGistId}`);
                    console.log(`🔧 Add this to your Render environment variables to persist the gist ID`);
                    return true;
                }
                return false;
            }

            // Update existing gist
            return await this.updateGist(subscribers);
        } catch (error) {
            console.error('Error saving to GitHub gist:', error);
            return false;
        }
    }

    // Load email subscribers with GitHub Gist fallback
    async loadSubscribers() {
        try {
            // Try to load from local file first (fastest)
            const data = await fs.readFile(this.subscribersFile, 'utf8');
            const subscribers = JSON.parse(data);
            console.log(`📧 Loaded ${subscribers.length} subscribers from local file`);
            return subscribers;
        } catch (error) {
            console.log('📧 Local file not found, checking GitHub gist...');
            
            // File doesn't exist, try GitHub Gist
            const gistSubscribers = await this.loadFromGist();
            if (gistSubscribers && gistSubscribers.length > 0) {
                // Restore to local file for performance
                await this.saveToLocalFile(gistSubscribers);
                return gistSubscribers;
            }

            // Fallback to environment variable (backward compatibility)
            const envData = process.env.SUBSCRIBERS_DATA;
            if (envData) {
                try {
                    const subscribers = JSON.parse(envData);
                    console.log(`📧 Loaded ${subscribers.length} subscribers from environment variable (legacy fallback)`);
                    
                    // Migrate to GitHub Gist
                    if (this.isGithubConfigured) {
                        console.log('📧 Migrating environment variable data to GitHub Gist...');
                        await this.saveToGist(subscribers);
                    }
                    
                    // Restore to local file for performance
                    await this.saveToLocalFile(subscribers);
                    return subscribers;
                } catch (parseError) {
                    console.error('❌ Error parsing subscribers from environment variable:', parseError);
                }
            }
            
            // Neither file, gist, nor env var exists, return empty array
            console.log('📧 No subscribers found, starting with empty list');
            return [];
        }
    }

    // Save to local file only (for performance)
    async saveToLocalFile(subscribers) {
        try {
            const tempFile = this.subscribersFile + '.tmp';
            await fs.writeFile(tempFile, JSON.stringify(subscribers, null, 2));
            await fs.rename(tempFile, this.subscribersFile);
        } catch (error) {
            console.error('❌ Error saving to local file:', error);
            // Don't throw - we have gist backup
        }
    }

    // Save subscribers with GitHub Gist backup
    async saveSubscribers(subscribers) {
        try {
            // Create backup before saving new data
            await this.backupSubscribers();
            
            // Safety check: Compare active subscriber counts
            const existingSubscribers = await this.loadSubscribers();
            const existingActiveCount = existingSubscribers.filter(sub => sub.active).length;
            const newActiveCount = subscribers.filter(sub => sub.active).length;
            
            // PRODUCTION SAFETY: Prevent catastrophic data loss
            if (process.env.NODE_ENV === 'production' && existingActiveCount > 5 && newActiveCount === 0) {
                console.error(`🚨 PRODUCTION SAFETY: Prevented complete subscriber wipeout!`);
                console.error(`🚨 This would have removed ${existingActiveCount} active subscribers.`);
                console.error(`🚨 If this is intentional, set NODE_ENV to development first.`);
                throw new Error('Production safety: Cannot remove all subscribers at once');
            }
            
            // Warn if active subscribers dropped significantly (more than 50% loss)
            if (existingActiveCount > 0 && newActiveCount < existingActiveCount * 0.5) {
                console.warn(`⚠️  WARNING: Active subscriber count dropping from ${existingActiveCount} to ${newActiveCount}`);
                console.warn(`⚠️  This indicates potential data loss! Check backup files in ./backup/`);
            }
            
            // Save to local file first (for performance)
            await this.saveToLocalFile(subscribers);
            
            // Save to GitHub Gist (persistent storage)
            if (this.isGithubConfigured) {
                const gistSaved = await this.saveToGist(subscribers);
                if (gistSaved) {
                    console.log(`📧 Subscriber data saved to GitHub Gist (${subscribers.length} total, ${newActiveCount} active)`);
                } else {
                    console.warn(`⚠️  Failed to save to GitHub Gist, but local file updated`);
                }
            } else {
                console.log(`📧 Subscriber data saved locally (${subscribers.length} total, ${newActiveCount} active)`);
                console.log(`📧 Set GITHUB_TOKEN environment variable for persistent cloud backup`);
            }
            
        } catch (error) {
            console.error('❌ Error saving subscribers:', error);
            throw error;
        }
    }

    // Get GitHub Gist info for backup interface
    async getGistInfo() {
        if (!this.isGithubConfigured) {
            return {
                configured: false,
                message: 'GitHub Gist not configured'
            };
        }

        if (!this.gistId) {
            return {
                configured: true,
                exists: false,
                message: 'No gist created yet - will create on first save'
            };
        }

        try {
            const response = await axios.get(`https://api.github.com/gists/${this.gistId}`, {
                headers: {
                    'Authorization': `token ${this.githubToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'YSBA-Standings-App'
                }
            });

            const fileContent = response.data.files[this.gistFilename];
            if (fileContent) {
                const data = JSON.parse(fileContent.content);
                return {
                    configured: true,
                    exists: true,
                    gistId: this.gistId,
                    url: response.data.html_url,
                    updatedAt: response.data.updated_at,
                    subscriberCount: data.metadata?.totalSubscribers || (data.subscribers || data).length,
                    lastSync: data.metadata?.updatedAt || 'Unknown'
                };
            }
        } catch (error) {
            return {
                configured: true,
                exists: false,
                error: error.response?.data?.message || error.message
            };
        }
    }

    // Add new email subscriber with division preferences
    async addSubscriber(email, name = '', divisionPreferences = []) {
        const subscribers = await this.loadSubscribers();
        
        // Check if already subscribed
        const existing = subscribers.find(sub => sub.email.toLowerCase() === email.toLowerCase());
        if (existing) {
            return { success: false, message: 'Email already subscribed' };
        }

        // Validate and normalize division preferences
        const normalizedPreferences = this.normalizeDivisionPreferences(divisionPreferences);

        // Add new subscriber
        const newSubscriber = {
            id: this.generateToken(),
            email: email.toLowerCase().trim(),
            name: (name || '').trim(),
            divisionPreferences: normalizedPreferences, // New multi-division support
            teamFilter: 'all', // Legacy field for backward compatibility
            subscribedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            active: true
        };

        subscribers.push(newSubscriber);
        await this.saveSubscribers(subscribers);

        console.log(`📧 New subscriber added: ${email} with ${normalizedPreferences.length} division preferences`);
        return { success: true, message: 'Successfully subscribed to notifications!' };
    }

    // Normalize and validate division preferences
    normalizeDivisionPreferences(preferences) {
        if (!Array.isArray(preferences)) {
            // Legacy support - if string provided, assume it's a single division
            if (typeof preferences === 'string') {
                return [preferences];
            }
            return [];
        }

        // Filter out invalid entries and ensure proper format
        return preferences
            .filter(pref => pref && typeof pref === 'string')
            .map(pref => pref.trim())
            .filter(pref => pref.length > 0);
    }

    // Get available divisions for preference selection
    getAvailableDivisions() {
        return [
            { key: '8U-rep-tier-3', display: '8U Rep - Tier 3' },
            { key: '9U-rep-tier-3', display: '9U Rep - Tier 3' },
            { key: '9U-select-all-tiers', display: '9U Select - All Teams' },
            { key: '10U-rep-tier-2', display: '10U Rep - Tier 2' },
            { key: '10U-rep-tier-3', display: '10U Rep - Tier 3' },
            { key: '11U-rep-tier-2', display: '11U Rep - Tier 2' },
            { key: '11U-rep-tier-3', display: '11U Rep - Tier 3' },
            { key: '11U-select-all-tiers', display: '11U Select - All Teams' },
            { key: '12U-rep-tier-2', display: '12U Rep - Tier 2' },
            { key: '12U-rep-tier-3', display: '12U Rep - Tier 3' },
            { key: '13U-rep-tier-2', display: '13U Rep - Tier 2' },
            { key: '13U-rep-tier-3', display: '13U Rep - Tier 3' },
            { key: '13U-select-all-tiers', display: '13U Select - All Teams' },
            { key: '14U-rep-tier-3', display: '14U Rep - Tier 3' },
            { key: '15U-rep-tier-2', display: '15U Rep - Tier 2' },
            { key: '15U-rep-tier-3', display: '15U Rep - Tier 3' },
            { key: '15U-select-all-tiers', display: '15U Select - All Teams' },
            { key: '16U-rep-tier-2', display: '16U Rep - Tier 2' },
            { key: '18U-rep-no-tier', display: '18U Rep - All Teams' },
            { key: '22U-rep-no-tier', display: '22U Rep - All Teams' },
        ];
    }

    // Update subscriber preferences
    async updateSubscriber(id, updates) {
        const subscribers = await this.loadSubscribers();
        const subscriberIndex = subscribers.findIndex(sub => sub.id === id);
        
        if (subscriberIndex === -1) {
            return { success: false, message: 'Subscriber not found' };
        }

        // Update allowed fields (now including divisionPreferences)
        const allowedUpdates = ['name', 'active', 'divisionPreferences'];
        const filteredUpdates = {};
        
        for (const key of allowedUpdates) {
            if (updates.hasOwnProperty(key)) {
                if (key === 'divisionPreferences') {
                    filteredUpdates[key] = this.normalizeDivisionPreferences(updates[key]);
                } else {
                    filteredUpdates[key] = updates[key];
                }
            }
        }

        filteredUpdates.updatedAt = new Date().toISOString();

        subscribers[subscriberIndex] = { ...subscribers[subscriberIndex], ...filteredUpdates };
        await this.saveSubscribers(subscribers);

        console.log(`📧 Subscriber updated: ${subscribers[subscriberIndex].email}`);
        return { success: true, message: 'Preferences updated successfully!' };
    }

    // Get subscriber by ID
    async getSubscriberById(id) {
        const subscribers = await this.loadSubscribers();
        return subscribers.find(sub => sub.id === id);
    }

    // Get subscriber by email
    async getSubscriberByEmail(email) {
        const subscribers = await this.loadSubscribers();
        return subscribers.find(sub => sub.email.toLowerCase() === email.toLowerCase());
    }

    // Remove email subscriber
    async removeSubscriber(email) {
        const subscribers = await this.loadSubscribers();
        const filtered = subscribers.filter(sub => sub.email.toLowerCase() !== email.toLowerCase());
        
        if (filtered.length < subscribers.length) {
            await this.saveSubscribers(filtered);
            console.log(`📧 Subscriber removed: ${email}`);
            return { success: true, message: 'Successfully unsubscribed' };
        } else {
            return { success: false, message: 'Email not found in subscribers' };
        }
    }

    // Unsubscribe by ID (more secure for email links)
    async unsubscribeById(id) {
        const subscribers = await this.loadSubscribers();
        const subscriber = subscribers.find(sub => sub.id === id);
        
        if (!subscriber) {
            return { success: false, message: 'Subscriber not found' };
        }

        // Mark as inactive instead of deleting
        subscriber.active = false;
        subscriber.updatedAt = new Date().toISOString();
        await this.saveSubscribers(subscribers);

        console.log(`📧 Subscriber unsubscribed: ${subscriber.email}`);
        return { success: true, message: 'Successfully unsubscribed', email: subscriber.email };
    }

    // Get active subscribers for a specific division/tier
    async getActiveSubscribers(divisionFilter = null) {
        const subscribers = await this.loadSubscribers();
        let activeSubscribers = subscribers.filter(sub => sub.active);

        // If no division filter specified, return all active subscribers
        if (!divisionFilter) {
            return activeSubscribers;
        }

        // Filter subscribers based on their division preferences
        return activeSubscribers.filter(subscriber => {
            // Legacy support: if no divisionPreferences, assume they want all notifications
            if (!subscriber.divisionPreferences || !Array.isArray(subscriber.divisionPreferences)) {
                return true;
            }

            // Check if subscriber has preferences for this specific division
            return subscriber.divisionPreferences.includes(divisionFilter);
        });
    }

    // Safely reactivate subscribers (for fixing accidental deactivations)
    async bulkReactivateSubscribers(emailList = null, dryRun = false) {
        const subscribers = await this.loadSubscribers();
        let reactivatedCount = 0;
        const reactivatedEmails = [];
        
        // If no email list provided, reactivate all inactive subscribers
        const targetEmails = emailList || subscribers.filter(sub => !sub.active).map(sub => sub.email);
        
        for (const subscriber of subscribers) {
            if (targetEmails.includes(subscriber.email) && !subscriber.active) {
                if (!dryRun) {
                    subscriber.active = true;
                    subscriber.updatedAt = new Date().toISOString();
                }
                reactivatedCount++;
                reactivatedEmails.push(subscriber.email);
            }
        }
        
        if (!dryRun && reactivatedCount > 0) {
            await this.saveSubscribers(subscribers);
            console.log(`📧 Bulk reactivated ${reactivatedCount} subscribers: ${reactivatedEmails.join(', ')}`);
        }
        
        return {
            success: true,
            reactivatedCount,
            emails: reactivatedEmails,
            dryRun
        };
    }

    // Send division-specific standings update notification
    async sendDivisionStandingsUpdate(divisionKey, standingsData, changes = []) {
        if (!this.isConfigured) {
            console.log('📧 Email notifications disabled - SendGrid not configured');
            return;
        }

        // Get subscribers who want notifications for this specific division
        const subscribers = await this.getActiveSubscribers(divisionKey);
        if (subscribers.length === 0) {
            console.log(`📧 No subscribers for division ${divisionKey} to notify`);
            return { sent: false, reason: 'No subscribers for division', divisionKey };
        }

        // Get division display name
        const availableDivisions = this.getAvailableDivisions();
        const divisionInfo = availableDivisions.find(div => div.key === divisionKey);
        const divisionDisplay = divisionInfo ? divisionInfo.display : divisionKey;

        // Create descriptive subject based on changes
        let subject = `⚾ YSBA ${divisionDisplay} Standings Updated!`;
        
        const gameChanges = this.previousStandings ? 
            changes.filter(change => change.includes('→')).length : 0;
        
        const positionChanges = changes.filter(change => 
            change.includes('moved up') || change.includes('dropped')
        ).length;
        
        // Format the date as "Month Day, Year"
        const date = new Date();
        const options = { month: 'long', day: 'numeric', year: 'numeric' };
        const formattedDate = date.toLocaleDateString('en-US', options);
        
        if (gameChanges > 0) {
            subject = `⚾ ${divisionDisplay} - ${gameChanges} New Game Results - ${formattedDate}`;
        } else if (positionChanges > 0) {
            subject = `⚾ ${divisionDisplay} - ${positionChanges} Position Changes - ${formattedDate}`;
        }

        // Send email to each subscriber
        let sentCount = 0;
        for (const subscriber of subscribers) {
            try {
                const html = this.generateStandingsEmail(standingsData, changes, subscriber, divisionDisplay);
                const text = this.generateStandingsTextEmail(standingsData, changes, subscriber, divisionDisplay);
                await this.sendEmail(subscriber.email, subject, html, text);
                sentCount++;
            } catch (error) {
                console.error(`📧 Error sending email to ${subscriber.email}:`, error);
            }
        }

        console.log(`📧 Sent ${divisionDisplay} update to ${sentCount}/${subscribers.length} subscribers`);
        return { sent: sentCount > 0, count: sentCount, divisionKey, divisionDisplay };
    }

    // Send standings update notification (legacy - now delegates to division-specific method)
    async sendStandingsUpdate(standingsData, changes = [], divisionKey = '9U-select-all-tiers') {
        return this.sendDivisionStandingsUpdate(divisionKey, standingsData, changes);
    }

    // Send team-specific standings update notification
    async sendTeamStandingsUpdate(teamCode, teamName, standingsData, changes = []) {
        if (!this.isConfigured) {
            console.log('📧 Email notifications disabled - SendGrid not configured');
            return;
        }

        const subscribers = await this.getActiveSubscribers();
        if (subscribers.length === 0) {
            console.log(`📧 No subscribers for team ${teamCode} (${teamName}) to notify`);
            return;
        }

        const subject = `⚾ ${teamName} Update - YSBA 9U Standings`;

        try {
            // Send personalized emails to team subscribers
            const emailPromises = subscribers.map(subscriber => {
                const html = this.generateStandingsEmail(standingsData, changes, subscriber);
                const text = this.generateStandingsTextEmail(standingsData, changes, subscriber);
                return this.sendEmail(subscriber.email, subject, html, text);
            });

            await Promise.allSettled(emailPromises);
            console.log(`📧 Team update sent to ${subscribers.length} subscribers for ${teamName} (${teamCode})`);
            return { success: true, subscribers: subscribers.length, teamCode, teamName };
        } catch (error) {
            console.error('Error sending team standings update:', error);
            throw error;
        }
    }

    // Detect changes between old and new standings
    detectStandingsChanges(oldStandings, newStandings) {
        const changes = [];
        
        if (!oldStandings || !newStandings) {
            return changes;
        }

        // Create lookup maps for easier comparison
        const oldTeams = {};
        const newTeams = {};
        
        oldStandings.forEach(team => oldTeams[team.teamCode] = team);
        newStandings.forEach(team => newTeams[team.teamCode] = team);

        // Check each team for changes
        newStandings.forEach(newTeam => {
            const oldTeam = oldTeams[newTeam.teamCode];
            
            if (!oldTeam) {
                // New team added (shouldn't happen during season, but just in case)
                changes.push(`${newTeam.team} has joined the standings`);
                return;
            }

            // We'll skip the W-L record changes as requested by the user
            // Only keep position change notifications

            // Check for position changes (moved up/down 1+ spots)
            if (Math.abs(oldTeam.position - newTeam.position) >= 1) {
                if (newTeam.position < oldTeam.position) {
                    changes.push(`${newTeam.team} moved up to #${newTeam.position} (was #${oldTeam.position})`);
                } else {
                    changes.push(`${newTeam.team} dropped to #${newTeam.position} (was #${oldTeam.position})`);
                }
            }
        });

        return changes;
    }

    // Send notifications based on detected changes
    async sendChangeNotifications(oldStandings, newStandings) {
        // Store the previous standings for use in subject line creation
        this.previousStandings = oldStandings;
        
        const changes = this.detectStandingsChanges(oldStandings, newStandings);
        
        if (changes.length === 0) {
            console.log('📧 No significant changes detected - no notifications sent');
            return { sent: false, reason: 'No changes detected' };
        }

        console.log(`📧 Detected ${changes.length} changes:`, changes);

        // Send general update to all subscribers
        await this.sendStandingsUpdate(newStandings, changes);

        // TODO: In the future, we could also send team-specific notifications
        // for teams that had changes, but for now we'll just send to all subscribers

        return { 
            sent: true, 
            changes: changes.length,
            details: changes
        };
    }

    // Send individual email
    async sendEmail(to, subject, html, text) {
        if (!this.isConfigured) {
            throw new Error('SendGrid not configured');
        }

        const msg = {
            to,
            from: {
                email: this.fromEmail,
                name: this.fromName
            },
            subject,
            text,
            html
        };

        return sgMail.send(msg);
    }

    // Generate HTML email for standings update
    generateStandingsEmail(standingsData, changes, subscriber = null, divisionDisplay = 'YSBA') {
        console.log('📧 Using MOBILE-OPTIMIZED email template v5 with multi-division support'); // Updated version marker
        const topTeams = standingsData.slice(0, 5);
        
        let changesHtml = '';
        if (changes.length > 0) {
            changesHtml = `
                <div style="background: #f0f9ff; padding: 15px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                    <h3 style="color: #0369a1; margin-top: 0;">📈 Latest Changes:</h3>
                    <ul style="margin: 0; padding-left: 20px;">
                        ${changes.map(change => `<li style="margin-bottom: 6px;">${change}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        // Generate management links if subscriber info is available
        let managementLinks = '';
        if (subscriber && subscriber.id) {
            const manageUrl = `${this.baseUrl}/manage?token=${subscriber.id}`;
            const unsubscribeUrl = `${this.baseUrl}/unsubscribe?token=${subscriber.id}`;
            
            managementLinks = `
                <div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #666; font-size: 12px;">
                    <p style="margin: 0 0 8px 0;">
                        <a href="${manageUrl}" style="color: #1e40af; text-decoration: none;">⚙️ Manage Preferences</a> | 
                        <a href="${unsubscribeUrl}" style="color: #dc2626; text-decoration: none;">Unsubscribe</a>
                    </p>
                    <p style="margin: 0;">YSBA ${divisionDisplay} • Automated Standings Updates</p>
                </div>
            `;
        } else {
            managementLinks = `
                <div style="text-align: center; margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #666; font-size: 12px;">
                    <p>YSBA ${divisionDisplay} • Automated Standings Updates</p>
                </div>
            `;
        }

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>YSBA 9U Standings Update</title>
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb; background-image: linear-gradient(to bottom, #f0f4f8, #f9fafb);">
                <div style="background-color: white; border-radius: 12px; padding: 24px; box-shadow: 0 4px 8px rgba(0,0,0,0.05);">
                    <div style="text-align: center; margin-bottom: 25px;">
                        <div style="font-size: 40px; margin-bottom: 8px;">⚾</div>
                        <h1 style="color: #1e40af; margin: 0; font-size: 24px;">YSBA Standings</h1>
                        <p style="color: #666; margin: 8px 0 0 0; font-size: 15px;">${divisionDisplay} Update</p>
                    </div>

                    ${changesHtml}

                    <div style="background: white; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                        <div style="background: linear-gradient(135deg, #1e40af, #3b82f6); color: white; padding: 12px; text-align: center;">
                            <h2 style="margin: 0; font-size: 18px; letter-spacing: 0.5px;">🏆 Current Standings</h2>
                        </div>
                        
                        <table cellpadding="0" cellspacing="0" border="0" width="100%" style="width: 100%; border-collapse: collapse;">
                            <thead>
                                <tr style="background: #f9fafb;">
                                    <th align="center" style="padding: 12px 6px; text-align: center; border-bottom: 1px solid #e5e7eb; width: 50px; font-size: 13px;">Rank</th>
                                    <th align="left" style="padding: 12px 6px; text-align: left; border-bottom: 1px solid #e5e7eb; font-size: 13px;">Team</th>
                                    <th align="center" style="padding: 12px 6px; text-align: center; border-bottom: 1px solid #e5e7eb; width: 60px; font-size: 13px;">W-L</th>
                                    <th align="center" style="padding: 12px 6px; text-align: center; border-bottom: 1px solid #e5e7eb; width: 60px; font-size: 13px;">Win%</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${topTeams.map((team, index) => `
                                    <tr style="${index % 2 === 0 ? 'background: #f9fafb;' : ''}">
                                        <td align="center" valign="middle" style="padding: 12px 6px; border-bottom: 1px solid #e5e7eb; text-align: center;">
                                            ${index + 1 <= 3 
                                                ? `<span style="background: ${
                                                    index === 0 
                                                        ? 'linear-gradient(135deg, #f59e0b, #fbbf24)' 
                                                        : index === 1 
                                                            ? 'linear-gradient(135deg, #6b7280, #9ca3af)' 
                                                            : 'linear-gradient(135deg, #b45309, #cd7c2f)'
                                                  }; color: white; padding: 4px 8px; border-radius: 20px; font-size: 14px; font-weight: bold; display: inline-block; min-width: 22px; text-align: center; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">${index + 1}</span>` 
                                                : `<span style="color: #6b7280; font-weight: 500; font-size: 14px;">${index + 1}</span>`
                                            }
                                        </td>
                                        <td align="left" valign="middle" style="padding: 12px 6px; border-bottom: 1px solid #e5e7eb; font-weight: 600; font-size: 15px; color: #1e40af;">
                                            ${team.team.replace(' 9U DS', '')}
                                        </td>
                                        <td align="center" valign="middle" style="padding: 12px 6px; border-bottom: 1px solid #e5e7eb; font-weight: 600; font-size: 15px; text-align: center;">
                                            ${team.wins}-${team.losses}
                                        </td>
                                        <td align="center" valign="middle" style="padding: 12px 6px; border-bottom: 1px solid #e5e7eb; text-align: center;">
                                            <span style="background: ${
                                                parseFloat(team.winPercentage) >= 0.75 
                                                    ? '#dcfce7'  // high - dark green
                                                    : parseFloat(team.winPercentage) >= 0.60 
                                                        ? '#f0fdf4'  // medium-high - light green
                                                        : parseFloat(team.winPercentage) >= 0.45 
                                                            ? '#fef9c3'  // medium - yellow
                                                            : parseFloat(team.winPercentage) >= 0.30 
                                                                ? '#fef3c7'  // low-medium - orange
                                                                : '#fee2e2'  // low - red
                                            }; color: ${
                                                parseFloat(team.winPercentage) >= 0.75 
                                                    ? '#166534'  // high - dark green text
                                                    : parseFloat(team.winPercentage) >= 0.60 
                                                        ? '#16a34a'  // medium-high - green text
                                                        : parseFloat(team.winPercentage) >= 0.45 
                                                            ? '#854d0e'  // medium - yellow text
                                                            : parseFloat(team.winPercentage) >= 0.30 
                                                                ? '#d97706'  // low-medium - orange text
                                                                : '#b91c1c'  // low - red text
                                            }; padding: 4px 8px; border-radius: 12px; font-size: 13px; font-weight: 600;">${team.winPercentage}</span>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>

                    <div style="text-align: center; margin-top: 24px; padding: 16px; background: linear-gradient(to bottom, #f8fafc, #f1f5f9); border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                        <p style="margin: 0 0 12px 0; font-weight: 500;">View complete standings and team schedules:</p>
                        <a href="${this.baseUrl}" style="display: inline-block; background: linear-gradient(135deg, #2563eb, #1d4ed8); color: white; padding: 10px 20px; text-decoration: none; border-radius: 8px; font-weight: 600; box-shadow: 0 2px 4px rgba(29, 78, 216, 0.25);">View Full Standings</a>
                    </div>

                    ${managementLinks}
                </div>
            </body>
            </html>
        `;
    }

    // Generate plain text email for standings update
    generateStandingsTextEmail(standingsData, changes, subscriber = null, divisionDisplay = 'YSBA') {
        const topTeams = standingsData.slice(0, 5);
        
        let changesText = '';
        if (changes.length > 0) {
            changesText = `\nLatest Changes:\n${changes.map(change => `• ${change}`).join('\n')}\n`;
        }

        let managementText = '';
        if (subscriber && subscriber.id) {
            const manageUrl = `${this.baseUrl}/manage?token=${subscriber.id}`;
            const unsubscribeUrl = `${this.baseUrl}/unsubscribe?token=${subscriber.id}`;
            managementText = `\nManage preferences: ${manageUrl}\nUnsubscribe: ${unsubscribeUrl}`;
        }

        return `
⚾ YSBA ${divisionDisplay.toUpperCase()} STANDINGS UPDATE

${changesText}
🏆 CURRENT STANDINGS:

${topTeams.map((team, index) => `${index + 1}. ${team.team} (${team.wins}-${team.losses}, ${team.winPercentage})`).join('\n')}

View complete standings: ${this.baseUrl}
${managementText}
        `.trim();
    }

    // Test email sending
    async sendTestEmail(to = 'test@example.com') {
        if (!this.isConfigured) {
            throw new Error('SendGrid not configured');
        }

        const subject = '🧪 YSBA Standings - Test Email';
        const html = `
            <h1>✅ Email System Working!</h1>
            <p>This is a test email from your YSBA 9U Standings notification system.</p>
            <p>You'll receive updates when standings change.</p>
        `;
        const text = 'Email system test - YSBA 9U Standings notifications are working!';

        return this.sendEmail(to, subject, html, text);
    }

    // Test team-specific notifications (legacy - for backwards compatibility)
    async sendTeamTestEmail(teamCode, changes = []) {
        if (!this.isConfigured) {
            console.log('📧 Email notifications disabled - SendGrid not configured');
            return;
        }

        const subscribers = await this.getActiveSubscribers();
        if (subscribers.length === 0) {
            console.log(`📧 No subscribers for team ${teamCode} to notify`);
            return { success: false, reason: 'No subscribers', teamCode };
        }

        // Team name lookup
        const teamNameMap = {
            '518966': 'Vaughan Vikings 9U DS',
            '511105': 'Midland Penetang Twins 9U DS',
            '511114': 'Thornhill Reds 9U DS',
            '511107': 'Barrie Baycats 9U DS',
            '511112': 'Newmarket Hawks 9U DS',
            '511113': 'Richmond Hill Phoenix 9U DS',
            '511111': 'Markham Mariners 9U DS',
            '511109': 'Collingwood Jays 9U DS',
            '511106': 'Aurora-King Jays 9U DS',
            '518965': 'Vaughan Vikings 8U DS',
            '511108': 'Bradford Tigers 9U DS',
            '511116': 'Caledon Nationals 9U HS',
            '511110': 'Innisfil Cardinals 9U DS',
            '511115': 'TNT Thunder 9U DS'
        };

        const teamName = teamCode === 'all' ? 'All Teams' : (teamNameMap[teamCode] || teamCode);

        // Mock standings data
        const standingsData = [
            { team: 'Vaughan Vikings 9U DS', teamCode: '518966', wins: 5, losses: 2, winPercentage: '.714' },
            { team: 'Midland Penetang Twins 9U DS', teamCode: '511105', wins: 4, losses: 3, winPercentage: '.571' },
            { team: 'Thornhill Reds 9U DS', teamCode: '511114', wins: 3, losses: 4, winPercentage: '.429' }
        ];

        const subject = teamCode === 'all' 
            ? '🧪 Test: All Teams Update'
            : `🧪 Test: ${teamName} Update`;

        try {
            const emailPromises = subscribers.map(subscriber => {
                // For test emails, don't include subscriber links to prevent accidental unsubscribes
                const html = this.generateStandingsEmail(standingsData, changes, null);
                const text = this.generateStandingsTextEmail(standingsData, changes, null);
                return this.sendEmail(subscriber.email, subject, html, text);
            });

            await Promise.allSettled(emailPromises);
            console.log(`📧 Test email sent to ${subscribers.length} subscribers for ${teamName}`);
            return { success: true, subscribers: subscribers.length, teamCode, teamName };
        } catch (error) {
            console.error('Error sending test team email:', error);
            throw error;
        }
    }

    // Test team-specific notifications with real data
    async sendRealDataTestEmail(teamCodeFilter = 'all', scraper = null) {
        if (!this.isConfigured) {
            console.log('📧 Email notifications disabled - SendGrid not configured');
            return;
        }

        // Add clear debug logs to see if we're using the updated template
        console.log('📧 DEBUG: Using email template v4 - Table with mobile optimizations');
        
        let standingsData = [];
        let teamName = 'All Teams';

        try {
            // Get real standings data if scraper is available
            if (scraper) {
                const scrapedData = await scraper.performScrape();
                if (scrapedData && scrapedData.teams) {
                    standingsData = scrapedData.teams;
                }
            }

            // Fallback to mock data if no real data available
            if (standingsData.length === 0) {
                standingsData = this.generateMockStandingsData();
            }

            // Find team name if a specific team is requested
            if (teamCodeFilter !== 'all') {
                const team = standingsData.find(t => t.teamCode === teamCodeFilter);
                if (team) {
                    teamName = team.name;
                }
            }

            // Generate mock changes for demonstration
            const changes = this.generateMockChanges(standingsData);
            
            // Format the date as "Month Day, Year"
            const date = new Date();
            const options = { month: 'long', day: 'numeric', year: 'numeric' };
            const formattedDate = date.toLocaleDateString('en-US', options);
            
            // Update the subject line to match the format used in production
            const gameChanges = changes.filter(change => change.includes('→')).length;
            const subject = `⚾ ${gameChanges} New Game Results - ${formattedDate}`;

            const subscribers = await this.getActiveSubscribers();
            let sentCount = 0;

            if (subscribers.length === 0) {
                console.log('📧 No subscribers to send test email to');
                return;
            }

            for (const subscriber of subscribers) {
                try {
                    // Intentionally send without the unsubscribe/manage links for testing
                    const html = this.generateStandingsEmail(standingsData, changes);
                    const text = this.generateStandingsTextEmail(standingsData, changes);
                    await this.sendEmail(subscriber.email, subject, html, text);
                    sentCount++;
                } catch (error) {
                    console.error(`📧 Error sending test email to ${subscriber.email}:`, error);
                }
            }

            console.log(`📧 Real data test email sent to ${sentCount} subscribers for ${teamName}`);
            return { sent: true, count: sentCount };
        } catch (error) {
            console.error('📧 Error sending real data test email:', error);
            return { sent: false, error: error.message };
        }
    }
}

module.exports = EmailService; 