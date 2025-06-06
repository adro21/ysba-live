#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Generate a cache version based on current timestamp
const cacheVersion = Date.now().toString().slice(-6); // Last 6 digits of timestamp

console.log(`🔄 Updating cache version to: ${cacheVersion}`);

// Files to update
const filesToUpdate = [
  'public/index.html',
  'public/backup.html',
  'public/manage.html'
];

// Update each file
filesToUpdate.forEach(filePath => {
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Update CSS and JS version numbers
    content = content.replace(/\/css\/styles\.css\?v=\d+/g, `/css/styles.css?v=${cacheVersion}`);
    content = content.replace(/\/js\/app\.js\?v=\d+/g, `/js/app.js?v=${cacheVersion}`);
    content = content.replace(/\/js\/dev-utils\.js\?v=\d+/g, `/js/dev-utils.js?v=${cacheVersion}`);
    content = content.replace(/\/js\/backup\.js\?v=\d+/g, `/js/backup.js?v=${cacheVersion}`);
    content = content.replace(/js\/manage\.js\?v=\d+/g, `js/manage.js?v=${cacheVersion}`);
    
    // Update icon version numbers (favicon and app icons)
    content = content.replace(/\/icons\/icon\.svg(\?v=\d+)?/g, `/icons/icon.svg?v=${cacheVersion}`);
    content = content.replace(/\/icons\/AppIcon@3x\.png(\?v=\d+)?/g, `/icons/AppIcon@3x.png?v=${cacheVersion}`);
    content = content.replace(/\/icons\/AppIcon@2x\.png(\?v=\d+)?/g, `/icons/AppIcon@2x.png?v=${cacheVersion}`);
    content = content.replace(/\/icons\/AppIcon@2x~ipad\.png(\?v=\d+)?/g, `/icons/AppIcon@2x~ipad.png?v=${cacheVersion}`);
    content = content.replace(/\/icons\/AppIcon-83\.5@2x~ipad\.png(\?v=\d+)?/g, `/icons/AppIcon-83.5@2x~ipad.png?v=${cacheVersion}`);
    content = content.replace(/\/icons\/icon-192\.png(\?v=\d+)?/g, `/icons/icon-192.png?v=${cacheVersion}`);
    content = content.replace(/\/icons\/icon-512\.png(\?v=\d+)?/g, `/icons/icon-512.png?v=${cacheVersion}`);
    
    fs.writeFileSync(filePath, content);
    console.log(`✅ Updated ${filePath}`);
  } else {
    console.log(`⚠️  File not found: ${filePath}`);
  }
});

console.log(`🎉 Cache version update complete!`); 