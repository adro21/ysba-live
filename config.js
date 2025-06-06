module.exports = {
  PORT: process.env.PORT || 3000,
  SCRAPE_INTERVAL_MINUTES: 30,
  CACHE_DURATION: 30 * 60 * 1000, // 30 minutes in milliseconds
  MAX_RETRIES: 3,
  REQUEST_TIMEOUT: process.env.NODE_ENV === 'production' ? 60000 : 30000, // 60s for production, 30s for development
  USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  YSBA_URL: 'https://www.yorksimcoebaseball.com/Club/xStanding.aspx',
  DIVISION_VALUE: '13', // [Sel] 9U
  TIER_VALUE: '__ALL__', // All Tiers
  
  // Performance optimization settings
  CACHE_SETTINGS: {
    DEFAULT_BATCH_SIZE: process.env.NODE_ENV === 'production' ? 4 : 3,
    BATCH_DELAY_MS: process.env.NODE_ENV === 'production' ? 500 : 1000,
    ELEMENT_DELAY_MS: process.env.NODE_ENV === 'production' ? 500 : 1000,
    STATUS_UPDATE_INTERVAL: 2000, // 2 seconds for real-time updates
    AGGRESSIVE_OPTIMIZATIONS: process.env.NODE_ENV === 'production'
  }
}; 