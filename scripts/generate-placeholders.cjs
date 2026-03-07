/**
 * Generate placeholder images for development.
 * Run: node scripts/generate-placeholders.js
 * 
 * In production, replace these with real photos:
 * - hero-clean.jpg: Bright sunny photo of clean windows on a nice home
 * - dirty-window.png: Transparent PNG with water stains and grime
 * - og-image.jpg: 1200x630 social sharing image
 */

const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');

// Create a simple 1x1 pixel placeholder PNG (gray-ish for hero)  
// In production, replace with an actual photo from Unsplash/Pexels
function createMinimalPlaceholder(filename, r, g, b) {
  // Minimal valid PNG: 1x1 pixel
  // For development, we'll use CSS gradients instead of actual photos
  // This is just to prevent 404 errors
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41,
    0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x00, 0x02, 0x00, 0x01, 0xe2, 0x21, 0xbc,
    0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
    0x44, 0xae, 0x42, 0x60, 0x82
  ]);
  
  fs.writeFileSync(path.join(publicDir, filename), png);
  console.log(`Created ${filename}`);
}

// Create placeholders
createMinimalPlaceholder('hero-clean.jpg', 135, 206, 235); // sky blue
createMinimalPlaceholder('dirty-window.png', 180, 160, 130); // grime
createMinimalPlaceholder('og-image.jpg', 12, 74, 110); // ocean-900

console.log('\nPlaceholders created! Replace with real images for production:');
console.log('  hero-clean.jpg  — Bright sunny photo of clean windows on a home');
console.log('  dirty-window.png — (optional) Texture overlay for animation');
console.log('  og-image.jpg     — 1200x630 social sharing image');
console.log('  logo.png         — Company logo (already attached)');
