// Simple icon generator for YSBA PWA
// Run this in browser console to generate base64 icons

function generateIcon(size) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    
    // Blue background
    ctx.fillStyle = '#2b6cb0';
    ctx.fillRect(0, 0, size, size);
    
    // White circle (baseball)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(size/2, size/2, size/3, 0, 2 * Math.PI);
    ctx.fill();
    
    // 9U text
    ctx.fillStyle = '#2b6cb0';
    ctx.font = `bold ${size/6}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText('9U', size/2, size/2 + size/18);
    
    return canvas.toDataURL('image/png');
}

// Copy this to browser console and run:
// console.log('192x192:', generateIcon(192));

console.log('Run generateIcon(192) in console to get base64 icon data'); 