# YSBA 9U Select Baseball Standings

A web application that scrapes and displays real-time standings for York Simcoe Baseball Association (YSBA) 9U Select teams with email notifications for standings changes.

## Features

- 🏆 Real-time team standings with win/loss records
- 📊 Win percentage calculations
- 🔄 Automatic data refresh every 30 minutes
- 📱 Mobile-responsive design with PWA support
- ⚡ Fast caching for better performance
- 🗓️ Individual team schedule viewing
- 📧 **Email notifications** for standings changes
- 🛡️ **Deployment-safe subscriber backup** system
- 👥 **Subscriber management** interface
- 📱 **Progressive Web App** with offline support

## Technology Stack

- **Backend**: Node.js with Express
- **Frontend**: Vanilla JavaScript with modern CSS
- **Web Scraping**: Puppeteer
- **Email Service**: SendGrid
- **Scheduling**: Node-cron
- **Security**: Helmet, CORS, CSP
- **Deployment**: Render.com with environment variable backup

## Email Notifications

Users can subscribe to receive email notifications when:
- Team standings change position
- Win/loss records are updated
- New games are completed

### Subscriber Features
- ✅ **Subscribe/Unsubscribe** via web interface
- ✅ **Manage preferences** with secure token links
- ✅ **GitHub Gist backup** - automatic, persistent storage
- ✅ **Environment variable fallback** for manual backup
- ✅ **Admin backup interface** at `/backup.html`

## Subscriber Data Persistence

### 🚀 **GitHub Gist Backup (Recommended)**

**Automatic, reliable backup with no size limits or manual intervention required.**

#### **Benefits:**
- ✅ **Fully automatic** - backups happen on every subscriber change
- ✅ **No size limits** - supports hundreds of subscribers
- ✅ **Deploy-safe** - survives all deployments automatically
- ✅ **Version history** - see previous versions on GitHub
- ✅ **Zero maintenance** - no manual updates needed

#### **Setup (One-time):**
1. **Create GitHub Personal Access Token:**
   - Go to [GitHub Settings → Tokens](https://github.com/settings/tokens/new)
   - Generate new token with **`gist`** permission only
   - Copy the token

2. **Add to Environment Variables:**
   ```bash
   GITHUB_TOKEN=your_github_token_here
   # GIST_ID will be created automatically
   ```

3. **Deploy** - GitHub Gist will be created automatically on first subscriber save

### 📦 **Environment Variable Backup (Fallback)**

**Manual backup option if GitHub Gist is not available.**

#### **Limitations:**
- ⚠️ **Manual updates required** before each deployment
- ⚠️ **4KB size limit** (~15 subscribers maximum)
- ⚠️ **No version history**

#### **Setup:**
```bash
SUBSCRIBERS_DATA={"json":"backup","data":"here"}
```

## Development Setup

### Prerequisites

- Node.js >= 18.0.0
- npm >= 8.0.0
- SendGrid account (for email notifications)
- GitHub account (for automatic backup - recommended)

### Local Development

1. Clone the repository:
```bash
git clone https://github.com/YOUR_USERNAME/ysba-9u-standings.git
cd ysba-9u-standings
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables (create `.env` file):
```bash
# Email Service (optional for basic functionality)
SENDGRID_API_KEY=your_sendgrid_api_key_here
FROM_EMAIL=notifications@yourdomain.com
FROM_NAME=YSBA 9U Standings

# GitHub Gist Backup (recommended for subscriber persistence)
GITHUB_TOKEN=your_github_token_here
# GIST_ID=your_gist_id_here (optional - will be created automatically)

# Environment Variable Backup (fallback)
SUBSCRIBERS_DATA=your_json_backup_data_here

# Base URL (for email links)
BASE_URL=http://localhost:3000
```

4. Start the development server:
```bash
npm run dev
```

5. Open your browser to `http://localhost:3000`

### Production Build

```bash
npm start
```

## Deployment to Render

This application is configured for easy deployment to Render.com:

1. Push your code to GitHub
2. Connect your GitHub repository to Render
3. Render will automatically use the `render.yaml` configuration
4. Set up environment variables in Render dashboard
5. Your app will be live at `https://your-app-name.onrender.com`

### Critical Environment Variables

**Required for email notifications:**
```bash
SENDGRID_API_KEY=your_sendgrid_api_key
FROM_EMAIL=notifications@yourdomain.com
FROM_NAME=YSBA 9U Standings
BASE_URL=https://your-app-name.onrender.com
```

**Recommended for automatic subscriber backup:**
```bash
GITHUB_TOKEN=your_github_token_here
# GIST_ID will be created automatically on first save
```

**Automatically configured by Render:**
```bash
NODE_ENV=production
PUPPETEER_ARGS=--no-sandbox,--disable-setuid-sandbox,--disable-dev-shm-usage...
```

### Setting Up GitHub Gist Backup

**🎯 Recommended approach for reliable, automatic backups:**

1. **Create GitHub Token** (one-time setup):
   - Go to [GitHub Settings → Personal Access Tokens](https://github.com/settings/tokens/new)
   - Click "Generate new token (classic)"
   - Name: "YSBA Standings Backup"
   - Scope: **✅ gist** (only this permission needed)
   - Generate and copy the token

2. **Add to Render Environment Variables:**
   - Go to Render Dashboard → Your Service → Environment
   - Add: `GITHUB_TOKEN` = `your_github_token_here`
   - Deploy

3. **Automatic Setup:**
   - Gist will be created automatically on first subscriber save
   - Check `/backup.html` to view gist status and get the gist URL
   - All future backups happen automatically

### Alternative: Environment Variable Backup

**⚠️ Only if GitHub Gist is not available:**

1. **Subscribe at least one email** on your live site
2. **Go to** `https://your-app.onrender.com/backup.html`
3. **Click "Export for Environment Variable"**
4. **Copy the JSON data**
5. **In Render Dashboard** → Environment → Add `SUBSCRIBERS_DATA`
6. **Paste JSON and deploy**
7. **Repeat before each deployment**

## API Endpoints

### Core Endpoints
- `GET /` - Main standings page
- `GET /api/standings` - JSON standings data
- `GET /api/status` - Application status and cache info
- `GET /api/team/:teamCode/schedule` - Team schedule data

### Email & Subscriber Endpoints
- `POST /api/subscribe` - Subscribe to email notifications
- `POST /api/unsubscribe` - Unsubscribe from notifications
- `POST /api/unsubscribe-token` - Unsubscribe via secure token
- `GET /api/subscribers/count` - Current subscriber count
- `GET /api/subscribers/export` - Export subscriber data (admin)
- `GET /api/subscriber/:token` - Get subscriber info
- `PUT /api/subscriber/:token` - Update subscriber preferences

### Backup Endpoints
- `GET /api/backup/gist-status` - GitHub Gist backup status
- `POST /api/backup/sync-to-gist` - Force sync to GitHub Gist
- `GET /backup.html` - Admin backup interface

### Admin Endpoints
- `GET /manage.html?token=:token` - Individual subscriber management
- `POST /api/test-email` - Send test email (development)

## Key Pages

- **`/`** - Main standings display
- **`/backup.html`** - Admin interface for backup management (GitHub Gist + env var)
- **`/manage.html?token=...`** - Individual subscriber preference management
- **`/unsubscribe.html`** - Unsubscribe interface

## Subscriber Data Management

### GitHub Gist Backup System
- **Automatic backup** on every subscriber change
- **Private gist** created automatically
- **Metadata tracking** with timestamps and counts
- **Version history** available on GitHub
- **No size limits** - supports hundreds of subscribers
- **Admin interface** at `/backup.html`

### Environment Variable Fallback
- **Manual backup** for deployment persistence
- **4KB limit** (~15 subscribers maximum)
- **Export/import** via web interface
- **Backward compatibility** with existing systems

### Capacity
- **GitHub Gist:** Unlimited subscribers
- **Environment Variable:** ~15 subscribers max
- **Local Files:** Used for performance, backed up to gist/env var

## Configuration

The application can be configured through `config.js`:

- `SCRAPE_INTERVAL_MINUTES`: How often to automatically scrape (default: 30 minutes)
- `MAX_RETRIES`: Maximum retry attempts for failed scrapes (default: 3)
- `REQUEST_TIMEOUT`: Timeout for web requests in milliseconds (default: 30000)
- `USER_AGENT`: Browser user agent string for scraping
- `DIVISION_VALUE`: YSBA division ID for 9U Select (default: '13')
- `TIER_VALUE`: Tier selection (default: '__ALL__')

## How It Works

### Web Scraping Process

1. **Navigation**: Uses Puppeteer to navigate to the YSBA standings page
2. **Form Interaction**: Automatically selects the correct division ([Sel] 9U) and tier (All Tiers)
3. **Data Extraction**: Scrapes the standings table and extracts team statistics
4. **Data Processing**: Calculates win percentages and formats the data
5. **Change Detection**: Compares with previous standings to detect updates
6. **Email Notifications**: Sends alerts to subscribers when changes are detected
7. **Caching**: Stores results in memory with timestamp for efficient serving

### Email Notification System

1. **Change Detection**: Compares current standings with previous scrape
2. **Subscriber Loading**: Loads active subscribers from persistent storage
3. **Email Generation**: Creates HTML and text versions of notifications
4. **Batch Sending**: Efficiently sends emails via SendGrid
5. **Error Handling**: Graceful degradation if email service is unavailable

### Deployment Safety

1. **Environment Variable Backup**: Subscriber data stored in Render environment
2. **Automatic Recovery**: Loads from backup if local file is missing
3. **Data Validation**: Prevents accidental mass unsubscriptions
4. **Manual Backup Interface**: Admin tools for data management

## Security Features

- **Helmet.js**: Security headers for XSS protection
- **Content Security Policy**: Prevents inline script execution
- **CORS Configuration**: Proper cross-origin resource sharing setup
- **Input Sanitization**: HTML escaping for all displayed data
- **Secure Tokens**: Cryptographically secure subscriber management tokens
- **Email Validation**: Proper email format validation
- **Error Boundaries**: Safe error handling without exposing internals

## Browser Support

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+
- ✅ Mobile browsers (iOS Safari, Chrome Mobile)
- ✅ Progressive Web App support

## Performance

- **Intelligent Caching**: Reduces server load and improves response times
- **Background Schedule Caching**: Pre-loads team schedules for faster modal display
- **Compression**: Automatic response compression
- **CDN Assets**: Bootstrap and icons served from CDN
- **Minimal Dependencies**: Lightweight client-side code
- **Service Worker**: Offline functionality and app-like experience

## Troubleshooting

### Common Issues

1. **"Failed to scrape" errors**: 
   - Check internet connection
   - YSBA website might be down
   - Try refreshing manually

2. **"No standings data" message**:
   - The season might not have started
   - Division might not have any games yet

3. **Email notifications not working**:
   - Check SendGrid API key configuration
   - Verify FROM_EMAIL is properly set
   - Check Render environment variables

4. **Subscriber data lost after deployment**:
   - Ensure SUBSCRIBERS_DATA environment variable is set
   - Use `/backup.html` to export and update the backup
   - Check server logs for backup loading messages

5. **CSP errors in console**:
   - All JavaScript is properly externalized
   - Report any remaining inline script issues

### Debug Mode

Check browser console for detailed error messages and enable verbose logging by setting:
```javascript
localStorage.setItem('debug', 'true');
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly (including email functionality)
5. Update documentation if needed
6. Submit a pull request

## Disclaimer

This tool is for educational and personal use. Please respect the YSBA website's terms of service and don't abuse their servers with excessive requests.

## Data Source

Data is sourced from the official [York Simcoe Baseball Association website](https://www.yorksimcoebaseball.com/Club/xStanding.aspx).

---

*Made with ⚾ for baseball parents who want better standings visualization and timely updates* 