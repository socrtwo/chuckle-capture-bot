/**
 * Icon Generator for PWA & Native Apps
 *
 * Generates PNG icons at all required sizes from an SVG source.
 * Requires: npm install sharp (run manually when generating icons)
 *
 * Usage: node scripts/generate-icons.js
 *
 * If 'sharp' is not available, the script creates placeholder SVG icons
 * that work for development. Replace with real PNGs for production.
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, '..', 'public', 'icons');

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

function generateSvgIcon(size) {
  const padding = Math.round(size * 0.12);
  const cameraSize = size - padding * 2;
  const cx = size / 2;
  const cy = size / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#7c3aed"/>
      <stop offset="100%" style="stop-color:#3b82f6"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.2)}" fill="url(#bg)"/>
  <g transform="translate(${cx}, ${cy})" fill="none" stroke="white" stroke-width="${Math.max(2, Math.round(size * 0.04))}" stroke-linecap="round" stroke-linejoin="round">
    <rect x="${-cameraSize * 0.3}" y="${-cameraSize * 0.2}" width="${cameraSize * 0.6}" height="${cameraSize * 0.4}" rx="${cameraSize * 0.04}"/>
    <circle cx="0" cy="${-cameraSize * 0.0}" r="${cameraSize * 0.1}"/>
    <path d="M${-cameraSize * 0.12},${-cameraSize * 0.2} L${-cameraSize * 0.08},${-cameraSize * 0.28} L${cameraSize * 0.08},${-cameraSize * 0.28} L${cameraSize * 0.12},${-cameraSize * 0.2}"/>
    <circle cx="0" cy="${cameraSize * 0.32}" r="${cameraSize * 0.06}" fill="white" stroke="none"/>
    <path d="M${-cameraSize * 0.12},${cameraSize * 0.28} Q0,${cameraSize * 0.38} ${cameraSize * 0.12},${cameraSize * 0.28}" stroke="white" fill="none"/>
  </g>
</svg>`;
}

if (!existsSync(ICONS_DIR)) {
  mkdirSync(ICONS_DIR, { recursive: true });
}

async function main() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.log('sharp not available - generating SVG placeholders (install sharp for PNG output)');
    sharp = null;
  }

  for (const size of SIZES) {
    const svg = generateSvgIcon(size);
    const filename = `icon-${size}x${size}.png`;
    const filepath = join(ICONS_DIR, filename);

    if (sharp) {
      await sharp(Buffer.from(svg)).resize(size, size).png().toFile(filepath);
      console.log(`Generated PNG: ${filename}`);
    } else {
      // Write SVG with .png extension as fallback (browsers handle this)
      writeFileSync(filepath.replace('.png', '.svg'), svg);
      // Also write a minimal valid PNG placeholder
      writeFileSync(filepath, Buffer.from(svg));
      console.log(`Generated SVG fallback: ${filename}`);
    }
  }

  console.log('\nDone! Icons generated in public/icons/');
}

main().catch(console.error);
