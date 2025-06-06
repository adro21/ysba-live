# Production Deployment Guide

## YSBA 9U Standings Email Notification System

### Production-Ready Features

✅ **Real Change Detection** - No more fake test data
✅ **Automated Email Notifications** - Only sent when actual changes occur  
✅ **Smart Subject Lines** - Descriptive subjects based on change types
✅ **Previous Standings Storage** - Persistent comparison data
✅ **Subscriber Management** - Token-based email preferences
✅ **Deployment-Safe Subscriber Backup** - Environment variable persistence

---

## Initial Production Setup

### 1. Environment Configuration

Ensure your `.env` file contains:
```bash
SENDGRID_API_KEY=your_sendgrid_api_key
FROM_EMAIL=notifications@ysba9ustandings.com
FROM_NAME="YSBA 9U Standings"
BASE_URL=https://ysba9ustandings.com
SCRAPE_INTERVAL_MINUTES=30
SUBSCRIBERS_DATA=""
```

**Important**: The `SUBSCRIBERS_DATA` environment variable provides deployment-safe backup for subscriber data (see Subscriber Backup section below).

### 2. Initialize Previous Standings

**IMPORTANT**: On first deployment, initialize the baseline data:

```bash
curl -X POST https://ysba9ustandings.com/api/initialize-standings
```

Response:
```json
{
  "success": true,
  "message": "Initialized previous standings with 14 teams",
  "teamsCount": 14
}
```

This creates `previous-standings.json` with current standings as the baseline for future comparisons.

---

## Subscriber Data Backup System

### 🚨 Critical: Deployment-Safe Subscriber Storage

**Problem**: Render deployments wipe local files, causing subscriber data loss.
**Solution**: Environment variable backup system provides persistence across deployments.

### Setting Up Environment Variable Backup

1. **Access Admin Interface**: Go to `https://your-domain.com/backup.html`
2. **Export Current Data**: Click "Export Subscriber Data"
3. **Copy Environment Variable**: Copy the provided `SUBSCRIBERS_DATA` value
4. **Update Hosting Environment**: Set this in your hosting platform's environment variables

### For Render.com Deployment:
```bash
# In Render dashboard > Environment Variables:
SUBSCRIBERS_DATA={"subscribers":[...],"backupDate":"2024-12-15T...","totalSubscribers":5}
```

### Capacity Limits:
- **Maximum ~15 subscribers** (each ~240 bytes, 4KB env var limit)
- **Warning at 10+ subscribers** to plan migration
- **System logs warnings** when approaching limits

### Backup API Endpoints:
```bash
GET /api/subscribers/export    # Export data with setup instructions
```

---

## How Change Detection Works

### 1. Automatic Monitoring
- Server scrapes YSBA standings every 30 minutes
- Compares new data with stored previous standings
- Only sends emails when **real changes** are detected

### 2. Types of Changes Detected

**Game Results** (W-L record changes):
```
Vaughan Vikings 9U DS: 3-1 → 4-0
Newmarket Hawks 9U DS: 1-3 → 2-2
```

**Position Changes** (2+ spot movements):
```
Thornhill Reds 9U DS moved up to #3 (was #5)
Barrie Baycats 9U DS dropped to #8 (was #6)
```

### 3. Smart Email Subjects

- **Game Results**: `⚾ YSBA 9U: 3 New Game Results`
- **Position Changes**: `⚾ YSBA 9U: 2 Position Changes`  
- **Both**: `⚾ YSBA 9U: 4 Game Results + Position Changes`
- **No Changes**: No email sent

---

## Production API Endpoints

### Manual Change Check
Trigger immediate change detection:
```bash
POST /api/check-for-changes
```

### Test Real Email (with live data)
```bash
POST /api/test-real-email
Content-Type: application/json
{"teamCode": "all"}
```

### Subscriber Management
```bash
POST /api/subscribe-team          # Subscribe with team preference
GET  /api/subscriber/:token       # Get subscriber info
PUT  /api/subscriber/:token       # Update preferences
POST /api/unsubscribe-token       # Unsubscribe by token
GET  /api/subscribers/export      # Export data for backup (admin)
```

---

## Production Monitoring

### Check System Status
```bash
# Check if server is running
curl https://ysba9ustandings.com/api/status

# Get subscriber count
curl https://ysba9ustandings.com/api/subscribers/count

# Export subscriber data (admin)
curl https://ysba9ustandings.com/api/subscribers/export
```

### Server Logs
Monitor for these key messages:
```
📧 No significant changes detected - no notifications sent
📧 Detected 3 changes: [list of changes]
📧 Notifications sent for 3 changes
Saved 14 teams to previous standings file
📧 Loaded 5 subscribers from environment variable (local file missing)
📧 Subscriber data saved (5 subscribers)
⚠️  WARNING: Approaching environment variable size limit (3.8KB/4KB)
```

---

## File Structure

### Runtime Data Files
```
previous-standings.json    # Stored previous standings (auto-generated)
subscribers.json          # Subscriber database (backed up to env var)
.env                     # Environment variables
```

### Admin Interfaces
```
/backup.html              # Subscriber backup management (admin)
/manage.html              # Email notification testing (admin)
```

### Important Notes
- `previous-standings.json` is created automatically
- `subscribers.json` is backed up to environment variables on each save
- Both added to `.gitignore` (contains runtime data)
- Environment variable provides deployment persistence

---

## Troubleshooting

### No Emails Being Sent
1. Check if subscribers exist: `GET /api/subscribers/count`
2. Verify SendGrid configuration in `.env`
3. Check server logs for errors

### Subscriber Data Lost After Deployment
1. Check environment variable `SUBSCRIBERS_DATA` is set in hosting platform
2. Server logs should show: `📧 Loaded X subscribers from environment variable`
3. If not set, data will start fresh (subscribers need to re-subscribe)

### Environment Variable Size Warnings
1. Monitor logs for size warnings
2. Use backup interface to export data
3. Consider migrating to database if exceeding ~15 subscribers

### False Positives
- System only detects W-L record changes (real games)
- Position changes require 2+ spot movements
- No notifications for identical data

### Reset Previous Standings
If needed, re-initialize:
```bash
rm previous-standings.json
curl -X POST https://ysba9ustandings.com/api/initialize-standings
```

---

## Deployment Checklist

- [ ] Environment variables configured (including `SUBSCRIBERS_DATA`)
- [ ] SendGrid API key valid and domain verified
- [ ] Initial standings initialized
- [ ] Test email sent successfully
- [ ] Cron job running (check logs for 30-minute intervals)
- [ ] Subscriber management pages accessible
- [ ] Change detection tested
- [ ] Subscriber backup system tested
- [ ] Admin backup interface accessible

### Pre-Deployment Backup
1. Access `/backup.html`
2. Export current subscriber data
3. Update `SUBSCRIBERS_DATA` environment variable in hosting platform
4. Deploy with confidence - subscribers will persist

**Your system is now production-ready with deployment-safe subscriber persistence!** 🚀 