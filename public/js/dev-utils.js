// Development utilities for YSBA Standings
// This module provides debugging tools for development

if (window.location.hostname === 'localhost') {
    console.log('🚫 PWA features are disabled on localhost for development');
    console.log('📝 Regular browser caching will be used instead');
    
    // Development utilities
    window.devUtils = {
        // Hard reload utility
        hardReload() {
            console.log('🔄 Performing hard reload...');
            window.location.reload(true);
        },

        // Simple cache status check
        async checkCacheStatus() {
            console.log('🔍 Checking browser cache status...');
            
            if ('caches' in window) {
                try {
                    const cacheNames = await caches.keys();
                    console.log('Browser caches:', cacheNames);
                } catch (error) {
                    console.log('Error checking caches:', error);
                }
            } else {
                console.log('Cache API not supported in this browser');
            }
        }
    };

    console.log('🛠️ Development utilities available at window.devUtils');
    console.log('📋 Available methods:');
    console.log('   - devUtils.hardReload() - Force page reload');
    console.log('   - devUtils.checkCacheStatus() - Check browser cache');
} 