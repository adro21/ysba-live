# Subscriber Data Management & Backup Guide

## 🎯 **Local vs Production - READ THIS FIRST!**

### **Important: Two Completely Separate Environments**

#### **🏠 Local Development (Your Computer):**
- **Purpose**: Testing and development only
- **Subscribers**: Test emails you add while developing
- **File location**: `subscribers.json` on your computer
- **Backup interface**: `http://localhost:3000/backup.html`
- **Impact on production**: **ZERO** - completely isolated

#### **🌐 Production (Live Website):**
- **Purpose**: Real subscribers using your live website
- **Subscribers**: Actual parents who subscribed to email updates
- **File location**: `subscribers.json` on Render server
- **Backup interface**: `https://your-domain.com/backup.html`
- **Environment variable backup**: **THIS is what needs protecting**

### **Key Point: Environment Variable Backup is ONLY for Production**
- ❌ **Don't** update Render environment variables with local test data
- ✅ **Do** update Render environment variables with real production subscriber data
- 🧪 **Local testing** has nothing to do with production backups

---

## 🔐 Data Safety Overview

Your subscriber data is now protected with multiple safety measures to ensure subscribers are never lost due to git operations, deployments, or code changes. The system includes both file-based backups and environment variable persistence for deployment safety.

## 📁 File Structure

```
ysba-9u-standings/
├── subscribers.json          # Main subscriber database (NOT in git)
├── backup/                   # Timestamped backups (NOT in git)
│   ├── subscribers-2024-12-15T10-30-00-000Z.json
│   ├── subscribers-2024-12-15T11-15-00-000Z.json
│   └── ...
├── public/
│   └── backup.html           # Admin backup interface
└── scripts/
    └── restore-subscribers.js # Data recovery tool
```

## 🛡️ Protection Mechanisms

### 1. Git Exclusion
- `subscribers.json` and `backup/` are in `.gitignore`
- Subscriber data is **never committed** to version control
- Safe from git resets, reverts, and deployments

### 2. Environment Variable Backup (🚀 NEW - Production Only)
- **Critical for deployments**: Automatic backup to `SUBSCRIBERS_DATA` environment variable
- **Deployment-safe**: Persists data across platform redeployments (Render, Heroku, etc.)
- **Automatic restoration**: Loads from env var if local file is missing
- **Size monitoring**: Warns when approaching 4KB environment variable limit (~15 subscribers)
- **⚠️ Production only**: Don't use for local development testing

### 3. Automatic File Backups
- Created before every save operation
- Timestamped with ISO format
- No limit on backup retention (manage manually if needed)

### 4. Atomic Writes
- Uses temporary files + rename for crash safety
- Prevents corruption if process is interrupted
- Either completely succeeds or completely fails

### 5. Data Recovery Tools
- Command-line tool to list and restore backups
- Safe restoration with current data backup
- Admin web interface for environment variable management

## 🚀 Environment Variable Backup System (Production Only)

### Why Environment Variables?
- **Problem**: Deployment platforms (Render, Heroku) wipe local files on each deploy
- **Solution**: Store subscriber data in environment variables that persist across deployments
- **Automatic**: System automatically saves to and loads from environment variables
- **Scope**: **Production environment only** - not for local development

### When to Use Environment Variable Backup

#### **✅ Update Environment Variable When:**
- 📅 Before deploying major code changes to production
- 🎯 When you reach subscriber milestones on production (every 5-10 new subscribers)
- 🗓️ Monthly as a backup routine for production data

#### **❌ Don't Update Environment Variable For:**
- 🧪 Local development testing
- 📧 Test subscriptions on localhost
- 🔧 Every single production subscription (only periodic updates needed)

### Setting Up Environment Variable Backup (Production Only)

#### Method 1: Production Admin Interface (Recommended)
1. Go to `https://your-domain.com/backup.html` (your live site, not localhost)
2. Click "Export Subscriber Data"
3. Copy the provided `SUBSCRIBERS_DATA` environment variable value
4. Set this in your hosting platform's environment variables

#### Method 2: Production API Export
```bash
curl https://your-domain.com/api/subscribers/export
```

### For Render.com:
1. Go to your service dashboard
2. Navigate to "Environment" tab
3. Add new environment variable:
   - **Key**: `SUBSCRIBERS_DATA`
   - **Value**: `{"subscribers":[...],"backupDate":"...","totalSubscribers":N}`

### Capacity Limits:
- **Environment variable limit**: 4KB (platform dependent)
- **Subscriber capacity**: ~15 subscribers (each ~240 bytes)
- **Warning system**: Alerts when approaching limits
- **Migration path**: Consider database migration for larger lists

### Monitoring Environment Variable Backup (Production Logs):
```bash
# Check if env var backup is working (look for this in production logs):
📧 Loaded 5 subscribers from environment variable (local file missing)
📧 Environment variable updated with 5 subscribers (3.2KB)
⚠️  WARNING: Approaching environment variable size limit (3.8KB/4KB)
```

## 🚀 Usage Instructions

### Check Production Subscriber Status
```bash
# Check production subscriber count
curl https://your-domain.com/api/subscribers/count

# Export production data with environment variable setup
curl https://your-domain.com/api/subscribers/export
```

### List Available File Backups (Local/Production)
```bash
node scripts/restore-subscribers.js list
```

Output:
```
📧 Available subscriber backups:
=====================================

1. subscribers-2024-12-15T11-15-00-000Z.json
   Date: 12/15/2024, 11:15:00 AM
   Subscribers: 15 total, 12 active

2. subscribers-2024-12-15T10-30-00-000Z.json
   Date: 12/15/2024, 10:30:00 AM
   Subscribers: 14 total, 11 active
```

### Restore From File Backup
```bash
node scripts/restore-subscribers.js restore subscribers-2024-12-15T10-30-00-000Z.json
```

This will:
1. Backup current `subscribers.json` (if exists)
2. Restore from the specified backup
3. Verify the restoration was successful

### Export Environment Variable Backup (Production)
```bash
# Via production API
curl https://your-domain.com/api/subscribers/export

# Via production admin interface
# Go to https://your-domain.com/backup.html (NOT localhost)
```

## 📊 Monitoring Subscriber Data

### Check Current Status

#### Production Status (What Matters):
```bash
# Count production subscribers
curl https://your-domain.com/api/subscribers/count

# Export production data for backup
curl https://your-domain.com/api/subscribers/export
```

#### Local Development Status (Testing Only):
```bash
# Examine local file directly
node -e "
const fs = require('fs');
try {
  const data = JSON.parse(fs.readFileSync('subscribers.json', 'utf8'));
  const active = data.filter(s => s.active).length;
  console.log(\`Local testing: \${data.length} total, \${active} active\`);
} catch(e) {
  console.log('No local subscribers file found');
}
"
```

### Manual Backup
```bash
# Create immediate file backup
node -e "
const EmailService = require('./email-service.js');
const service = new EmailService();
service.backupSubscribers().then(() => console.log('Manual backup created'));
"
```

## 🚨 Emergency Recovery Scenarios

### Scenario 1: Lost Production Subscribers After Deployment (🚀 NEW)
1. **Check environment variable**: Look for `SUBSCRIBERS_DATA` in Render dashboard
2. **Production logs**: Should show `📧 Loaded X subscribers from environment variable`
3. **If env var missing**: Production data starts fresh, subscribers need to re-subscribe
4. **Solution**: Always set environment variable before major production deployments

### Scenario 2: Accidentally Deleted subscribers.json (Production)
1. **Automatic recovery**: System will load from environment variable if file missing
2. **Manual recovery**: List backups: `node scripts/restore-subscribers.js list`
3. **Restore**: `node scripts/restore-subscribers.js restore <filename>`

### Scenario 3: Corrupted Data After Bad Deployment
1. Check if current file is corrupted:
   ```bash
   node -e "JSON.parse(require('fs').readFileSync('subscribers.json', 'utf8'))"
   ```
2. If corrupted, restore from backup using steps above
3. System will automatically load from environment variable as fallback

### Scenario 4: Environment Variable Size Exceeded (Production)
1. **Warning signs**: Log messages about size limits in production
2. **Immediate action**: Export current data via production backup interface
3. **Migration**: Consider moving to database for larger subscriber lists
4. **Temporary fix**: Manually clean inactive/old subscribers

### Scenario 5: Lost All Data (disaster scenario)
1. Check the production `backup/` directory for any surviving files
2. Check if environment variable `SUBSCRIBERS_DATA` still exists in Render
3. If backups exist, restore from the most recent
4. If no backups or env var, start fresh (subscribers need to re-subscribe)

## 🔧 Deployment Safety

### Production Setup
1. **Never** include `subscribers.json` in your deployment package
2. **Always** set `SUBSCRIBERS_DATA` environment variable before major production deployments
3. Ensure backup directory exists: `mkdir -p backup`
4. Set proper permissions: `chmod 600 subscribers.json` (owner read/write only)

### Pre-Deployment Checklist
- [ ] `subscribers.json` is in `.gitignore`
- [ ] **Production** subscriber data backed up to environment variable
- [ ] Environment variables configured in hosting platform
- [ ] Backup directory permissions set
- [ ] ❌ Don't backup local test data to production environment

### Post-Deployment Verification
```bash
# Verify production API endpoints
curl https://your-domain.com/api/subscribers/count
curl https://your-domain.com/api/subscribers/export

# Check production logs for environment variable loading
# Should see: "📧 Loaded X subscribers from environment variable"
```

## 📝 Best Practices

### Regular Maintenance
- **Monitor production environment variable size** in server logs
- **Update env var after major production subscriber changes** (not every single one)
- **Clean old file backups** (keep last 30 days worth)
- **Test recovery process monthly**

### Development Workflow
- Never commit `subscribers.json` changes
- Use test emails for development
- **Keep production and development subscriber lists completely separate**
- ❌ Don't test environment variable backup locally
- ✅ Test on production with small changes only

### Capacity Management (Production)
- **Monitor production subscriber count** approaching 15
- **Plan database migration** for growth beyond 15 subscribers
- **Regular cleanup** of inactive production subscribers
- **Size monitoring** via production server logs

### Monitoring
- Set up alerts for email service errors
- Monitor backup creation in production logs
- Track production subscriber count trends
- Watch for environment variable size warnings

## 🚦 Status Indicators

### Healthy Production System
```
📧 Subscriber data saved (15 subscribers)
📧 Environment variable updated with 15 subscribers (3.2KB)
📧 Subscriber backup created: backup/subscribers-2024-12-15T11-15-00-000Z.json
```

### Warning Signs (Production)
```
❌ Error saving subscribers: [error details]
Error creating subscriber backup: [error details]
📧 No subscribers file found, starting with empty list
⚠️  WARNING: Approaching environment variable size limit (3.8KB/4KB)
❌ Environment variable too large, cannot save backup
```

### Environment Variable Loading (Production)
```
📧 Loaded 5 subscribers from environment variable (local file missing)
📧 Loaded 5 subscribers from local file (environment variable available as backup)
```

## 🔒 Security Notes

- Subscriber emails are sensitive data - never commit to git
- Environment variables are visible to hosting platform admins
- Backup files contain the same sensitive data - protect them
- Use environment variables for email service credentials
- Consider encryption for backup files in high-security environments
- Admin backup interface should be password-protected in production

## 🚀 Simple Summary

### **For Daily Use:**
- ✅ **Local development**: Test freely, ignore environment variables
- ✅ **Production**: Subscribers are automatically saved and backed up
- ✅ **Environment variable**: Only update before major deployments or monthly

### **For Emergencies:**
- 🚨 **Lost production data**: Check Render environment variable `SUBSCRIBERS_DATA`
- 🚨 **Corrupted file**: System automatically loads from environment variable
- 🚨 **No backup**: Production starts fresh, users re-subscribe

### **Remember:**
- 🏠 **Local = Testing only** (localhost:3000)
- 🌐 **Production = Real users** (your-domain.com)
- 📦 **Environment variable = Production backup only**

Your subscriber data is now much safer with deployment-safe persistence! 🛡️ 