/**
 * Icon Generator for PWA & Native Apps
 *
 * Generates valid PNG icons at all required sizes.
 * Uses a pure-Node.js PNG encoder (no external deps needed).
 * Icons are a purple-to-blue gradient rounded rectangle with a camera icon.
 *
 * For higher quality icons with SVG rendering, install sharp:
 *   npm install sharp
 *   node scripts/generate-icons.js
 *
 * Usage: node scripts/generate-icons.js
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { deflateSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ICONS_DIR = join(__dirname, '..', 'public', 'icons');

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];

/**
 * Encode raw RGBA pixel data as a PNG file (minimal valid PNG).
 */
function encodePng(width, height, rgba) {
  // PNG signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // IDAT: filter rows (prepend 0 = None filter to each row)
  const rawData = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter byte: None
    rgba.copy(rawData, y * (1 + width * 4) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const compressed = deflateSync(rawData);

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuffer = Buffer.from(type, 'ascii');
    const crcData = Buffer.concat([typeBuffer, data]);

    // CRC32
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < crcData.length; i++) {
      crc ^= crcData[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
      }
    }
    crc ^= 0xFFFFFFFF;
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc >>> 0, 0);

    return Buffer.concat([len, typeBuffer, data, crcBuf]);
  }

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Generate a gradient icon with camera shape at the given size.
 */
function generateIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = Math.round(size * 0.2);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Check if inside rounded rect
      const inRoundedRect = isInsideRoundedRect(x, y, size, size, radius);
      if (!inRoundedRect) {
        rgba[idx] = 0;
        rgba[idx + 1] = 0;
        rgba[idx + 2] = 0;
        rgba[idx + 3] = 0;
        continue;
      }

      // Gradient: purple (#7c3aed) to blue (#3b82f6) diagonal
      const t = (x / size + y / size) / 2;
      const r = Math.round(124 + (59 - 124) * t);
      const g = Math.round(58 + (130 - 58) * t);
      const b = Math.round(237 + (246 - 237) * t);

      // Draw camera icon (white) in center
      const cx = size / 2;
      const cy = size / 2;
      const iconR = size * 0.28;

      // Camera body
      const bodyW = iconR * 1.6;
      const bodyH = iconR * 1.1;
      const bodyTop = cy - bodyH * 0.35;
      const bodyLeft = cx - bodyW / 2;

      // Camera top (viewfinder bump)
      const bumpW = bodyW * 0.35;
      const bumpH = bodyH * 0.22;
      const bumpLeft = cx - bumpW / 2;
      const bumpTop = bodyTop - bumpH;

      // Lens circle
      const lensR = bodyH * 0.32;
      const lensCx = cx;
      const lensCy = bodyTop + bodyH * 0.55;

      let isIcon = false;

      // Body rectangle (with small radius)
      const br = bodyH * 0.12;
      if (isInsideRoundedRect(x - bodyLeft, y - bodyTop, bodyW, bodyH, br)) {
        isIcon = true;
      }

      // Bump rectangle
      if (x >= bumpLeft && x <= bumpLeft + bumpW && y >= bumpTop && y <= bodyTop + 1) {
        isIcon = true;
      }

      // Lens ring (outline)
      const dx = x - lensCx;
      const dy = y - lensCy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const stroke = Math.max(2, size * 0.025);
      if (dist >= lensR - stroke && dist <= lensR + stroke) {
        isIcon = true;
      }

      // Small smile below camera
      const smileCy = cy + iconR * 0.85;
      const smileR = iconR * 0.35;
      const sdx = x - cx;
      const sdy = y - smileCy;
      const sDist = Math.sqrt(sdx * sdx + sdy * sdy);
      if (sDist >= smileR - stroke && sDist <= smileR + stroke && sdy > 0) {
        isIcon = true;
      }

      if (isIcon) {
        rgba[idx] = 255;
        rgba[idx + 1] = 255;
        rgba[idx + 2] = 255;
        rgba[idx + 3] = 230;
      } else {
        rgba[idx] = r;
        rgba[idx + 1] = g;
        rgba[idx + 2] = b;
        rgba[idx + 3] = 255;
      }
    }
  }

  return encodePng(size, size, rgba);
}

function isInsideRoundedRect(x, y, w, h, r) {
  if (x < 0 || x >= w || y < 0 || y >= h) return false;

  // Check corners
  if (x < r && y < r) {
    return (x - r) * (x - r) + (y - r) * (y - r) <= r * r;
  }
  if (x >= w - r && y < r) {
    return (x - (w - r)) * (x - (w - r)) + (y - r) * (y - r) <= r * r;
  }
  if (x < r && y >= h - r) {
    return (x - r) * (x - r) + (y - (h - r)) * (y - (h - r)) <= r * r;
  }
  if (x >= w - r && y >= h - r) {
    return (x - (w - r)) * (x - (w - r)) + (y - (h - r)) * (y - (h - r)) <= r * r;
  }

  return true;
}

// Main
if (!existsSync(ICONS_DIR)) {
  mkdirSync(ICONS_DIR, { recursive: true });
}

for (const size of SIZES) {
  const png = generateIcon(size);
  const filename = `icon-${size}x${size}.png`;
  writeFileSync(join(ICONS_DIR, filename), png);
  console.log(`Generated ${filename} (${png.length} bytes)`);
}

console.log('\nDone! Icons generated in public/icons/');
