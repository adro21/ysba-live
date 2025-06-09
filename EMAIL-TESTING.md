# Email Notification Testing Guide

This guide explains how to test the enhanced multi-division email notification system.

## Prerequisites

1. **SendGrid Configuration**: Set `SENDGRID_API_KEY` environment variable
2. **GitHub Gist Storage**: Set `GITHUB_TOKEN` and optionally `GIST_ID` for subscriber data backup
3. **Server Running**: Start the server with `npm run dev` or `npm start`

## Testing Endpoints

### 1. Test Email to Specific Address

Send a test email to any email address:

```bash
# Local testing
curl -X POST http://localhost:3000/api/test-email/9U-select-all-tiers \
  -H "Content-Type: application/json" \
  -d '{"testEmail": "your-email@example.com"}'

# Production testing
curl -X POST https://your-domain.com/api/test-email/13U-rep-tier-2 \
  -H "Content-Type: application/json" \
  -d '{"testEmail": "your-email@example.com"}'
```

### 2. Test Notifications to Actual Subscribers

Send test notifications to all subscribers of a specific division:

```bash
# Test 9U Select notifications
curl -X POST http://localhost:3000/api/test-email/9U-select-all-tiers

# Test 13U Rep Tier 2 notifications  
curl -X POST http://localhost:3000/api/test-email/13U-rep-tier-2

# Test 8U Rep Tier 3 notifications
curl -X POST http://localhost:3000/api/test-email/8U-rep-tier-3
```

### 3. Subscribe with Division Preferences

Test the new subscription system with multiple divisions:

```bash
curl -X POST http://localhost:3000/api/subscribe \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "name": "Test User",
    "divisionPreferences": [
      "9U-select-all-tiers",
      "13U-rep-tier-2",
      "15U-select-all-tiers"
    ]
  }'
```

### 4. Check Available Divisions

Get list of all available divisions for subscription:

```bash
curl http://localhost:3000/api/available-divisions
```

### 5. Check Subscriber Info

Get subscriber details by token (replace TOKEN with actual subscriber token):

```bash
curl http://localhost:3000/api/subscriber/TOKEN
```

### 6. Update Subscriber Preferences

Update division preferences for existing subscriber:

```bash
curl -X PUT http://localhost:3000/api/subscriber/TOKEN \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Updated Name",
    "divisionPreferences": [
      "11U-rep-tier-2",
      "14U-rep-tier-3"
    ]
  }'
```

## Available Division Keys

All available division/tier combinations:

### Rep Divisions (by tier)
- `8U-rep-tier-3`
- `9U-rep-tier-3`
- `10U-rep-tier-2`, `10U-rep-tier-3`
- `11U-rep-tier-2`, `11U-rep-tier-3`
- `12U-rep-tier-2`, `12U-rep-tier-3`
- `13U-rep-tier-2`, `13U-rep-tier-3`
- `14U-rep-tier-3`
- `15U-rep-tier-2`, `15U-rep-tier-3`
- `16U-rep-tier-2`
- `18U-rep-no-tier`
- `22U-rep-no-tier`

### Select Divisions (all teams)
- `9U-select-all-tiers`
- `11U-select-all-tiers`
- `13U-select-all-tiers`
- `15U-select-all-tiers`

## Testing the UI

### Subscription Form
1. Visit any division page (e.g., `/9U-select/all-tiers`)
2. Scroll to subscription section
3. Enter email and name
4. Select desired divisions from checkboxes
5. Submit form

### Management Page
1. Subscribe to get management token
2. Visit management link from email
3. Update name and division preferences
4. Save changes

## Browser Console Testing

Enable debug mode for detailed logging:

```javascript
localStorage.setItem('debugMode', 'true');
```

Test subscription form functionality:

```javascript
// Test getting selected divisions
const app = window.ysbaApp;
const selected = app.getSelectedDivisionPreferences();
console.log('Selected divisions:', selected);

// Test resetting preferences
app.resetDivisionPreferences();
```

## Production Safety

- The system includes production safeguards to prevent data loss
- GitHub Gist provides automatic backup of subscriber data
- Local file backup system creates timestamped backups
- Environment variable fallback for legacy support

## Troubleshooting

### Common Issues

1. **Email not sending**: Check `SENDGRID_API_KEY` environment variable
2. **Subscriber data lost**: Check GitHub Gist backup with `/api/subscribers/export`
3. **Division not found**: Verify division key matches available divisions list
4. **UI not loading**: Check browser console for JavaScript errors

### Debug Commands

```bash
# Check email service configuration
curl http://localhost:3000/api/status

# Export subscriber data (admin only)
curl http://localhost:3000/api/subscribers/export

# Get subscriber count
curl http://localhost:3000/api/subscribers/count
```

## Integration with Scraper

The email system integrates with the background scraper to send notifications when standings change. The scraper should call:

```javascript
// Send notifications for specific division
await emailService.sendDivisionStandingsUpdate(
  '9U-select-all-tiers',  // division key
  standingsData,          // array of team standings
  changes                 // array of detected changes
);
```

This will automatically filter subscribers and send emails only to those who have that division in their preferences.