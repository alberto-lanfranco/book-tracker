const fs = require('fs');

// SVG for 512x512 icon
const svg512 = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <rect width="512" height="512" fill="#000000"/>
  <text x="256" y="340" font-size="340" text-anchor="middle" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">📖</text>
</svg>`;

// SVG for 192x192 icon
const svg192 = `<svg width="192" height="192" xmlns="http://www.w3.org/2000/svg">
  <rect width="192" height="192" fill="#000000"/>
  <text x="96" y="128" font-size="128" text-anchor="middle" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">📖</text>
</svg>`;

// SVG for favicon (32x32)
const svgFavicon = `<svg width="32" height="32" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" fill="#000000"/>
  <text x="16" y="24" font-size="24" text-anchor="middle" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">📖</text>
</svg>`;

fs.writeFileSync('icon-512.svg', svg512);
fs.writeFileSync('icon-192.svg', svg192);
fs.writeFileSync('favicon.svg', svgFavicon);

console.log('✅ SVG icons generated successfully!');
console.log('   - icon-512.svg (512x512)');
console.log('   - icon-192.svg (192x192)');
console.log('   - favicon.svg (32x32)');
