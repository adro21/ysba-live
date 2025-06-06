// Run this in browser console or save as HTML and open
// Copy this code into your browser console on any page:

function generatePNGIcon(size, filename) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // Background (blue rounded rectangle)
    ctx.fillStyle = '#2b6cb0';
    ctx.beginPath();
    const radius = size * 0.15;
    ctx.roundRect(0, 0, size, size, radius);
    ctx.fill();
    
    // Baseball (white circle)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(size/2, size/2, size * 0.25, 0, 2 * Math.PI);
    ctx.fill();
    
    // Baseball stitching
    ctx.strokeStyle = '#e53e3e';
    ctx.lineWidth = Math.max(2, size * 0.008);
    ctx.beginPath();
    // Left curve
    ctx.moveTo(size * 0.35, size * 0.35);
    ctx.quadraticCurveTo(size * 0.45, size * 0.5, size * 0.35, size * 0.65);
    // Right curve  
    ctx.moveTo(size * 0.65, size * 0.35);
    ctx.quadraticCurveTo(size * 0.55, size * 0.5, size * 0.65, size * 0.65);
    ctx.stroke();
    
    // "9U" text
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${size * 0.12}px Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('9U', size/2, size * 0.85);
    
    // Small trophy
    ctx.fillStyle = '#ffd700';
    const trophySize = size * 0.08;
    const trophyX = size/2;
    const trophyY = size * 0.15;
    
    // Trophy cup
    ctx.beginPath();
    ctx.moveTo(trophyX - trophySize/2, trophyY);
    ctx.lineTo(trophyX + trophySize/2, trophyY);
    ctx.lineTo(trophyX + trophySize/3, trophyY + trophySize/2);
    ctx.lineTo(trophyX - trophySize/3, trophyY + trophySize/2);
    ctx.closePath();
    ctx.fill();
    
    // Trophy base
    ctx.fillRect(trophyX - trophySize/4, trophyY + trophySize/2, trophySize/2, trophySize/4);
    
    // Download the PNG
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

// Add roundRect polyfill if needed
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, width, height, radius) {
        this.beginPath();
        this.moveTo(x + radius, y);
        this.lineTo(x + width - radius, y);
        this.quadraticCurveTo(x + width, y, x + width, y + radius);
        this.lineTo(x + width, y + height - radius);
        this.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        this.lineTo(x + radius, y + height);
        this.quadraticCurveTo(x, y + height, x, y + height - radius);
        this.lineTo(x, y + radius);
        this.quadraticCurveTo(x, y, x + radius, y);
        this.closePath();
    };
}

// Generate and download all icons
console.log('Generating PNG icons...');
generatePNGIcon(180, 'icon-180.png');
generatePNGIcon(192, 'icon-192.png');
generatePNGIcon(512, 'icon-512.png');
console.log('Done! Check your downloads folder for the PNG files.'); 