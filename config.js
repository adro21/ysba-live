module.exports = {
  PORT: process.env.PORT || 3000,
  SCRAPE_INTERVAL_MINUTES: 30,
  CACHE_DURATION: 30 * 60 * 1000, // 30 minutes in milliseconds
  MAX_RETRIES: 3,
  REQUEST_TIMEOUT: process.env.NODE_ENV === 'production' ? 60000 : 30000, // 60s for production, 30s for development
  USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  YSBA_URL: 'https://www.yorksimcoebaseball.com/Club/xStanding.aspx',
  YSBA_SCHEDULE_URL: 'https://www.yorksimcoebaseball.com/Club/xScheduleMM.aspx',
  
  // Standardized theme - green primary with yellow accent
  STANDARD_THEME: {
    primary: '#024220',
    secondary: '#015c2a',
    accent: '#facc15',  // Yellow accent
    text: '#14532d',
    background: '#f0fdf4',
    headerBg: 'linear-gradient(135deg, #024220, #015c2a)',
    brandSubtitle: '#6b7280'
  },
  
  // Multi-Division Configuration
  DIVISIONS: {
    // Rep Divisions (based on actual YSBA website values)
    '8U-rep': {
      displayName: 'Rep 8U',
      shortName: '8U Rep',
      ysbaValue: '1',
      tiers: {
        'no-tier': { displayName: 'No Tier', ysbaValue: '-10' },
        'tier-1': { displayName: 'Tier 1', ysbaValue: '1' },
        'tier-2': { displayName: 'Tier 2', ysbaValue: '2' },
        'tier-3': { displayName: 'Tier 3', ysbaValue: '3' }
      },
      theme: {
        primary: '#024220',
        secondary: '#015c2a',
        accent: '#facc15',
        text: '#14532d',
        background: '#f0fdf4',
        headerBg: 'linear-gradient(135deg, #024220, #015c2a)',
        brandSubtitle: '#6b7280'
      },
      features: {
        divisionFilter: false,
        schedules: true,
        emailNotifications: true
      }
    },
    '9U-rep': {
      displayName: 'Rep 9U',
      shortName: '9U Rep',
      ysbaValue: '2',
      tiers: {
        'no-tier': { displayName: 'No Tier', ysbaValue: '-10' },
        'tier-1': { displayName: 'Tier 1', ysbaValue: '1' },
        'tier-2': { displayName: 'Tier 2', ysbaValue: '2' },
        'tier-3': { displayName: 'Tier 3', ysbaValue: '3' }
      },
      theme: {
        primary: '#024220',
        secondary: '#015c2a',
        accent: '#facc15',
        text: '#14532d',
        background: '#f0fdf4',
        headerBg: 'linear-gradient(135deg, #024220, #015c2a)',
        brandSubtitle: '#6b7280'
      },
      features: {
        divisionFilter: false,
        schedules: true,
        emailNotifications: true
      }
    },
    '10U-rep': {
      displayName: 'Rep 10U',
      shortName: '10U Rep',
      ysbaValue: '3',
      tiers: {
        'no-tier': { displayName: 'No Tier', ysbaValue: '-10' },
        'tier-1': { displayName: 'Tier 1', ysbaValue: '1' },
        'tier-2': { displayName: 'Tier 2', ysbaValue: '2' },
        'tier-3': { displayName: 'Tier 3', ysbaValue: '3' }
      },
      theme: {
        primary: '#024220',
        secondary: '#015c2a',
        accent: '#facc15',
        text: '#14532d',
        background: '#f0fdf4',
        headerBg: 'linear-gradient(135deg, #024220, #015c2a)',
        brandSubtitle: '#6b7280'
      },
      features: {
        divisionFilter: false,
        schedules: true,
        emailNotifications: true
      }
    },
    '11U-rep': {
      displayName: 'Rep 11U',
      shortName: '11U Rep',
      ysbaValue: '4',
      tiers: {
        'no-tier': { displayName: 'No Tier', ysbaValue: '-10' },
        'tier-1': { displayName: 'Tier 1', ysbaValue: '1' },
        'tier-2': { displayName: 'Tier 2', ysbaValue: '2' },
        'tier-3': { displayName: 'Tier 3', ysbaValue: '3' }
      },
      theme: {
        primary: '#024220',
        secondary: '#015c2a',
        accent: '#facc15',
        text: '#14532d',
        background: '#f0fdf4',
        headerBg: 'linear-gradient(135deg, #024220, #015c2a)',
        brandSubtitle: '#6b7280'
      },
      features: {
        divisionFilter: false,
        schedules: true,
        emailNotifications: true
      }
    },
    '12U-rep': {
      displayName: 'Rep 12U',
      shortName: '12U Rep',
      ysbaValue: '5',
      tiers: {
        'no-tier': { displayName: 'No Tier', ysbaValue: '-10' },
        'tier-1': { displayName: 'Tier 1', ysbaValue: '1' },
        'tier-2': { displayName: 'Tier 2', ysbaValue: '2' },
        'tier-3': { displayName: 'Tier 3', ysbaValue: '3' }
      },
      theme: {
        primary: '#024220',
        secondary: '#015c2a',
        accent: '#facc15',
        text: '#14532d',
        background: '#f0fdf4',
        headerBg: 'linear-gradient(135deg, #024220, #015c2a)',
        brandSubtitle: '#6b7280'
      },
      features: {
        divisionFilter: false,
        schedules: true,
        emailNotifications: true
      }
    },
    '13U-rep': {
      displayName: 'Rep 13U',
      shortName: '13U Rep',
      ysbaValue: '6',
      tiers: {
        'no-tier': { displayName: 'No Tier', ysbaValue: '-10' },
        'tier-1': { displayName: 'Tier 1', ysbaValue: '1' },
        'tier-2': { displayName: 'Tier 2', ysbaValue: '2' },
        'tier-3': { displayName: 'Tier 3', ysbaValue: '3' }
      },
      theme: {
        primary: '#024220',
        secondary: '#015c2a',
        accent: '#facc15',
        text: '#14532d',
        background: '#f0fdf4',
        headerBg: 'linear-gradient(135deg, #024220, #015c2a)',
        brandSubtitle: '#6b7280'
      },
      features: {
        divisionFilter: false,
        schedules: true,
        emailNotifications: true
      }
    },
    '14U-rep': {
      displayName: 'Rep 14U',
      shortName: '14U Rep',
      ysbaValue: '7',
      tiers: {
        'no-tier': { displayName: 'No Tier', ysbaValue: '-10' },
        'tier-1': { displayName: 'Tier 1', ysbaValue: '1' },
        'tier-2': { displayName: 'Tier 2', ysbaValue: '2' },
        'tier-3': { displayName: 'Tier 3', ysbaValue: '3' }
      },
      theme: {
        primary: '#024220',
        secondary: '#015c2a',
        accent: '#facc15',
        text: '#14532d',
        background: '#f0fdf4',
        headerBg: 'linear-gradient(135deg, #024220, #015c2a)',
        brandSubtitle: '#6b7280'
      },
      features: {
        divisionFilter: false,
        schedules: true,
        emailNotifications: true
      }
    },
    '15U-rep': {
      displayName: 'Rep 15U',
      shortName: '15U Rep',
      ysbaValue: '8',
      tiers: {
        'no-tier': { displayName: 'No Tier', ysbaValue: '-10' },
        'tier-1': { displayName: 'Tier 1', ysbaValue: '1' },
        'tier-2': { displayName: 'Tier 2', ysbaValue: '2' },
        'tier-3': { displayName: 'Tier 3', ysbaValue: '3' }
      },
      theme: {
        primary: '#024220',
        secondary: '#015c2a',
        accent: '#facc15',
        text: '#14532d',
        background: '#f0fdf4',
        headerBg: 'linear-gradient(135deg, #024220, #015c2a)',
        brandSubtitle: '#6b7280'
      },
      features: {
        divisionFilter: false,
        schedules: true,
        emailNotifications: true
      }
    },
    '16U-rep': {
      displayName: 'Rep 16U',
      shortName: '16U Rep',
      ysbaValue: '9',
      tiers: {
        'no-tier': { displayName: 'No Tier', ysbaValue: '-10' },
        'tier-1': { displayName: 'Tier 1', ysbaValue: '1' },
        'tier-2': { displayName: 'Tier 2', ysbaValue: '2' },
        'tier-3': { displayName: 'Tier 3', ysbaValue: '3' }
      },
      theme: {
        primary: '#024220',
        secondary: '#015c2a',
        accent: '#facc15',
        text: '#14532d',
        background: '#f0fdf4',
        headerBg: 'linear-gradient(135deg, #024220, #015c2a)',
        brandSubtitle: '#6b7280'
      },
      features: {
        divisionFilter: false,
        schedules: true,
        emailNotifications: true
      }
    },
    '18U-rep': {
      displayName: 'Rep 18U',
      shortName: '18U Rep',
      ysbaValue: '10',
      tiers: {
        'no-tier': { displayName: 'No Tier', ysbaValue: '-10' },
        'tier-1': { displayName: 'Tier 1', ysbaValue: '1' },
        'tier-2': { displayName: 'Tier 2', ysbaValue: '2' },
        'tier-3': { displayName: 'Tier 3', ysbaValue: '3' }
      },
      theme: {
        primary: '#024220',
        secondary: '#015c2a',
        accent: '#facc15',
        text: '#14532d',
        background: '#f0fdf4',
        headerBg: 'linear-gradient(135deg, #024220, #015c2a)',
        brandSubtitle: '#6b7280'
      },
      features: {
        divisionFilter: false,
        schedules: true,
        emailNotifications: true
      }
    },
    '22U-rep': {
      displayName: 'Rep 22U',
      shortName: '22U Rep',
      ysbaValue: '11',
      tiers: {
        'no-tier': { displayName: 'No Tier', ysbaValue: '-10' },
        'tier-1': { displayName: 'Tier 1', ysbaValue: '1' },
        'tier-2': { displayName: 'Tier 2', ysbaValue: '2' },
        'tier-3': { displayName: 'Tier 3', ysbaValue: '3' }
      },
      theme: {
        primary: '#024220',
        secondary: '#015c2a',
        accent: '#facc15',
        text: '#14532d',
        background: '#f0fdf4',
        headerBg: 'linear-gradient(135deg, #024220, #015c2a)',
        brandSubtitle: '#6b7280'
      },
      features: {
        divisionFilter: false,
        schedules: true,
        emailNotifications: true
      }
    },
    'senior-rep': {
      displayName: 'Rep Senior',
      shortName: 'Senior Rep',
      ysbaValue: '12',
      tiers: {
        'no-tier': { displayName: 'No Tier', ysbaValue: '-10' },
        'tier-1': { displayName: 'Tier 1', ysbaValue: '1' },
        'tier-2': { displayName: 'Tier 2', ysbaValue: '2' },
        'tier-3': { displayName: 'Tier 3', ysbaValue: '3' }
      },
      theme: {
        primary: '#024220',
        secondary: '#015c2a',
        accent: '#facc15',
        text: '#14532d',
        background: '#f0fdf4',
        headerBg: 'linear-gradient(135deg, #024220, #015c2a)',
        brandSubtitle: '#6b7280'
      },
      features: {
        divisionFilter: false,
        schedules: true,
        emailNotifications: true
      }
    },
    
    // Select Divisions
    '9U-select': {
      displayName: '9U Select',
      shortName: '9U Sel',
      ysbaValue: '13', // Current working division
      tiers: {
        'all-tiers': { displayName: 'All Teams', ysbaValue: '__ALL__' }
      },
      theme: {
        primary: '#024220',
        secondary: '#015c2a',
        accent: '#22c55e',
        text: '#14532d',
        background: '#f0fdf4',
        headerBg: 'linear-gradient(135deg, #024220, #015c2a)',
        brandSubtitle: '#6b7280'
      },
      features: {
        divisionFilter: true, // Only 9U Select has this feature for now
        schedules: true,
        emailNotifications: true
      },
      divisionMapping: {
        // North Division
        '511105': 'north', // Midland Penetang Twins 9U DS
        '511107': 'north', // Barrie Baycats 9U DS
        '511109': 'north', // Collingwood Jays 9U DS
        '511110': 'north', // Innisfil Cardinals 9U DS
        '511115': 'north', // TNT Thunder 9U DS
        '511108': 'north', // Bradford Tigers 9U DS
        '511116': 'north', // Caledon Nationals 9U HS
        
        // South Division
        '511106': 'south', // Aurora-King Jays 9U DS
        '518965': 'south', // Vaughan Vikings 8U DS
        '511111': 'south', // Markham Mariners 9U DS
        '511112': 'south', // Newmarket Hawks 9U DS
        '511114': 'south', // Thornhill Reds 9U DS
        '518966': 'south', // Vaughan Vikings 9U DS
        '511113': 'south'  // Richmond Hill Phoenix 9U DS
      }
    },
    '11U-select': {
      displayName: '11U Select',
      shortName: '11U Sel',
      ysbaValue: '15',
      tiers: {
        'all-tiers': { displayName: 'All Teams', ysbaValue: '__ALL__' }
      },
      theme: {
        primary: '#024220',
        secondary: '#015c2a',
        accent: '#facc15',
        text: '#14532d',
        background: '#f0fdf4',
        headerBg: 'linear-gradient(135deg, #024220, #015c2a)',
        brandSubtitle: '#6b7280'
      },
      features: {
        divisionFilter: false,
        schedules: true,
        emailNotifications: true
      }
    },
    '13U-select': {
      displayName: '13U Select',
      shortName: '13U Sel',
      ysbaValue: '16',
      tiers: {
        'all-tiers': { displayName: 'All Teams', ysbaValue: '__ALL__' }
      },
      theme: {
        primary: '#024220',
        secondary: '#015c2a',
        accent: '#facc15',
        text: '#14532d',
        background: '#f0fdf4',
        headerBg: 'linear-gradient(135deg, #024220, #015c2a)',
        brandSubtitle: '#6b7280'
      },
      features: {
        divisionFilter: false,
        schedules: true,
        emailNotifications: true
      }
    },
    '15U-select': {
      displayName: '15U Select',
      shortName: '15U Sel',
      ysbaValue: '18',
      tiers: {
        'all-tiers': { displayName: 'All Teams', ysbaValue: '__ALL__' }
      },
      theme: {
        primary: '#024220',
        secondary: '#015c2a',
        accent: '#facc15',
        text: '#14532d',
        background: '#f0fdf4',
        headerBg: 'linear-gradient(135deg, #024220, #015c2a)',
        brandSubtitle: '#6b7280'
      },
      features: {
        divisionFilter: false,
        schedules: true,
        emailNotifications: true
      }
    }
  },

  // Legacy single-division support (for backwards compatibility)
  DIVISION_VALUE: '13', // [Sel] 9U
  TIER_VALUE: '__ALL__', // All Tiers
  
  // Performance optimization settings
  CACHE_SETTINGS: {
    DEFAULT_BATCH_SIZE: process.env.NODE_ENV === 'production' ? 4 : 3,
    BATCH_DELAY_MS: process.env.NODE_ENV === 'production' ? 500 : 1000,
    ELEMENT_DELAY_MS: process.env.NODE_ENV === 'production' ? 500 : 1000,
    STATUS_UPDATE_INTERVAL: 2000, // 2 seconds for real-time updates
    AGGRESSIVE_OPTIMIZATIONS: process.env.NODE_ENV === 'production'
  },

  // Helper functions
  getDivisionConfig: function(divisionKey, tierKey = null) {
    const division = this.DIVISIONS[divisionKey];
    if (!division) return null;
    
    // If only division key provided, return division config
    if (!tierKey) return division;
    
    const tier = division.tiers[tierKey];
    if (!tier) return null;
    
    // Clean up tier display name to remove redundant prefixes
    let cleanTierDisplayName = tier.displayName;
    if (divisionKey.includes('rep') && cleanTierDisplayName.toLowerCase().includes('rep')) {
      cleanTierDisplayName = cleanTierDisplayName.replace(/^Rep\s*/i, '');
    } else if (divisionKey.includes('select') && cleanTierDisplayName.toLowerCase().includes('select')) {
      cleanTierDisplayName = cleanTierDisplayName.replace(/^Select\s*/i, '');
    }
    
    // Generate clean URL path without redundant prefixes
    let cleanUrlTier = tierKey;
    if (divisionKey.includes('rep') && tierKey.startsWith('rep-')) {
      cleanUrlTier = tierKey.substring(4); // Remove "rep-" prefix from URL
    } else if (divisionKey.includes('select') && tierKey.startsWith('select-')) {
      cleanUrlTier = tierKey.substring(7); // Remove "select-" prefix from URL
    }
    
    return {
      division,
      tier,
      fullName: `${division.displayName} - ${cleanTierDisplayName}`,
      urlPath: `/${divisionKey}/${cleanUrlTier}`,
      ysbaParams: {
        division: division.ysbaValue,
        tier: tier.ysbaValue
      }
    };
  },

  getAllDivisions: function() {
    return Object.keys(this.DIVISIONS).map(key => ({
      key,
      ...this.DIVISIONS[key]
    }));
  },

  parseUrlPath: function(path) {
    const segments = path.split('/').filter(s => s);
    if (segments.length !== 2) return null;
    
    const [divisionKey, urlTierKey] = segments;
    
    // Convert clean URL tier key back to internal tier key for lookup
    let internalTierKey = urlTierKey;
    if (divisionKey.includes('rep') && !urlTierKey.startsWith('rep-') && urlTierKey !== 'no-tier') {
      internalTierKey = `rep-${urlTierKey}`;
    } else if (divisionKey.includes('select') && !urlTierKey.startsWith('select-')) {
      internalTierKey = `select-${urlTierKey}`;
    }
    
    return this.getDivisionConfig(divisionKey, internalTierKey);
  }
}; 