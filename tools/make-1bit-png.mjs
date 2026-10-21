import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';
import { markGeometry } from '../brand/make-mark.mjs';

function parseArgs(args) {
  const values = {};
  for (let i = 2; i < args.length; i += 2) {
    const key = args[i];
    if (!key.startsWith('--') || i + 1 >= args.length) throw new Error(`Expected --name value, got ${key}`);
    values[key.slice(2)] = args[i + 1];
  }
  for (const key of ['svg', 'out', 'width', 'height', 'ink', 'paper']) if (!values[key]) throw new Error(`Missing --${key}`);
  values.width = Number(values.width); values.height = Number(values.height); values.scale = Number(values.scale ?? 0.8);
  if (!Number.isInteger(values.width) || !Number.isInteger(values.height) || values.width < 1 || values.height < 1) throw new Error('Width and height must be positive integers');
  if (!Number.isFinite(values.scale) || values.scale <= 0 || values.scale > 1) throw new Error('--scale must be greater than 0 and at most 1');
  for (const key of ['ink', 'paper']) if (!/^#[\da-f]{6}$/i.test(values[key])) throw new Error(`--${key} must be a six digit hex colour`);
  return values;
}

const insidePolygon = (x, y, polygon) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if (((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
const polygonDistance = (x, y, polygon) => {
  if (insidePolygon(x, y, polygon)) return 0;
  let nearest = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    const [ax, ay] = polygon[i], [bx, by] = polygon[(i + 1) % polygon.length];
    const dx = bx - ax, dy = by - ay;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) continue;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared));
    nearest = Math.min(nearest, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return nearest;
};
const hexBytes = (hex) => Buffer.from(hex.slice(1), 'hex');
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
function crc32(buffer) { let crc = 0xffffffff; for (const byte of buffer) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data = Buffer.alloc(0)) {
  const name = Buffer.from(type), length = Buffer.alloc(4), checksum = Buffer.alloc(4);
  length.writeUInt32BE(data.length); checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

export function create1BitPng({ width, height, ink, paper, scale = 0.8, centerX = width / 2, centerY = height / 2 }) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('Invalid PNG dimensions');
  const geometry = markGeometry();
  const size = Math.min(width, height) * scale;
  const xMin = Math.max(0, Math.floor(centerX - size * 0.45));
  const xMax = Math.min(width, Math.ceil(centerX + size * 0.45));
  const yMin = Math.max(0, Math.floor(centerY - size * 0.45));
  const yMax = Math.min(height, Math.ceil(centerY + size * 0.45));
  const insideCircle = (x, y, radius) => (x - geometry.pivot.x) ** 2 + (y - geometry.pivot.y) ** 2 <= radius ** 2;
  const rowBytes = Math.ceil(width / 8);
  const raw = Buffer.alloc(height * (rowBytes + 1));
  let sawPaper = false, sawInk = false;
  for (let py = yMin; py < yMax; py++) {
    const row = py * (rowBytes + 1); raw[row] = 0;
    for (let px = xMin; px < xMax; px++) {
      let inkSamples = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const gx = px + (sx + 0.5) / 4, gy = py + (sy + 0.5) / 4;
        const x = (gx - centerX) * 100 / size + 50, y = (gy - centerY) * 100 / size + 50;
        let painted = false;
        for (let stripIndex = 0; stripIndex < geometry.strips.length; stripIndex++) {
          const strip = geometry.strips[stripIndex];
          if (x < strip.bounds.minX || x > strip.bounds.maxX || y < strip.bounds.minY || y > strip.bounds.maxY) continue;
          if (!insidePolygon(x, y, strip.outline) || strip.chips.some((chip) => insidePolygon(x, y, chip))) continue;
          let cutOut = false;
          for (let later = stripIndex + 1; later < geometry.strips.length; later++) {
            const foreground = geometry.strips[later], gap = geometry.gap;
            if (x < foreground.bounds.minX - gap || x > foreground.bounds.maxX + gap || y < foreground.bounds.minY - gap || y > foreground.bounds.maxY + gap) continue;
            if (polygonDistance(x, y, foreground.outline) <= gap) { cutOut = true; break; }
          }
          if (!cutOut) { painted = true; break; }
        }
        if (insideCircle(x, y, geometry.rivet.radius) && !insideCircle(x, y, geometry.rivet.hole)) painted = true;
        if (insideCircle(x, y, geometry.rivet.hole)) painted = false;
        if (painted) inkSamples++;
      }
      const isInk = inkSamples >= 8;
      if (isInk) { raw[row + 1 + (px >> 3)] |= 0x80 >> (px & 7); sawInk = true; } else sawPaper = true;
    }
  }
  if (!sawInk || !sawPaper) throw new Error('Rendered image must contain both palette colours');
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 1; ihdr[9] = 3;
  const plte = Buffer.concat([hexBytes(paper), hexBytes(ink)]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('PLTE', plte), chunk('IDAT', deflateSync(raw)), chunk('IEND')]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = parseArgs(process.argv);
    const svgSource = readFileSync(resolve(args.svg), 'utf8');
    if ((svgSource.match(/data-strip=/g) ?? []).length !== 4) throw new Error('--svg must be the generated four-strip mark');
    const png = create1BitPng({ width: args.width, height: args.height, ink: args.ink, paper: args.paper, scale: args.scale, centerX: args.x ? Number(args.x) : undefined, centerY: args.y ? Number(args.y) : undefined });
    const output = resolve(args.out); mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, png);
    console.log(`wrote ${output}: ${args.width}x${args.height}, 1-bit indexed`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
