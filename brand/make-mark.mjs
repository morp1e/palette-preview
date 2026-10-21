import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const polygonPath = (points) => `M${points.map(([x, y]) => `${x} ${y}`).join('L')}Z`;
const socialText = {
  left: 500,
  titleSize: 60,
  subtitleSize: 24,
  urlSize: 24,
};

function cardPolygon(point, length, halfWidth, radius) {
  const local = [
    [radius, -halfWidth], [length, -halfWidth], [length, halfWidth], [radius, halfWidth],
  ];
  for (let i = 0; i <= 4; i++) {
    const angle = Math.PI / 2 - i * Math.PI / 8;
    local.push([radius + Math.cos(angle) * radius, halfWidth - radius + Math.sin(angle) * radius]);
  }
  local.push([0, -halfWidth + radius]);
  for (let i = 0; i <= 4; i++) {
    const angle = Math.PI + i * Math.PI / 8;
    local.push([radius + Math.cos(angle) * radius, -halfWidth + radius + Math.sin(angle) * radius]);
  }
  return local.map(([along, across]) => point(along, across));
}

function boundsOf(points) {
  return points.reduce((box, [x, y]) => ({ minX: Math.min(box.minX, x), minY: Math.min(box.minY, y), maxX: Math.max(box.maxX, x), maxY: Math.max(box.maxY, y) }),
    { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity });
}

export function markGeometry() {
  // Angles are ordered from the rear card to the front card.
  const angles = [0, 20, 40, 60];
  const length = 74;
  const width = 16;
  const chipSize = 10;
  const chipGap = 3;
  const localStrips = angles.map((angle, index) => {
    const radians = angle * Math.PI / 180;
    const unit = { x: Math.sin(radians), y: -Math.cos(radians) };
    const side = { x: Math.cos(radians), y: Math.sin(radians) };
    const point = (along, across) => [unit.x * along + side.x * across, unit.y * along + side.y * across];
    const outline = cardPolygon(point, length, width / 2, 1.5);
    const centers = Array.from({ length: index + 2 }, (_, chipIndex) =>
      length - 3 - chipSize / 2 - chipIndex * (chipSize + chipGap));
    const chips = centers.map((along) => {
      const half = chipSize / 2;
      return [point(along - half, -half), point(along + half, -half), point(along + half, half), point(along - half, half)];
    });
    return { index, angle, count: index + 2, outline, chips, bounds: boundsOf(outline), unit, side };
  });
  const localBounds = boundsOf(localStrips.flatMap((strip) => strip.outline));
  const rivet = { radius: 8, hole: 3.5 };
  localBounds.minX = Math.min(localBounds.minX, -rivet.radius);
  localBounds.maxX = Math.max(localBounds.maxX, rivet.radius);
  localBounds.minY = Math.min(localBounds.minY, -rivet.radius);
  localBounds.maxY = Math.max(localBounds.maxY, rivet.radius);
  const offset = { x: 50 - (localBounds.minX + localBounds.maxX) / 2, y: 50 - (localBounds.minY + localBounds.maxY) / 2 };
  const translate = (points) => points.map(([x, y]) => [+(x + offset.x).toFixed(3), +(y + offset.y).toFixed(3)]);
  const strips = localStrips.map((strip) => {
    const outline = translate(strip.outline);
    return { ...strip, outline, chips: strip.chips.map(translate), bounds: boundsOf(outline) };
  });
  return { strips, pivot: offset, rivet, width, length, gap: 3 };
}

function circlePath(cx, cy, radius) {
  return `M${cx - radius} ${cy}a${radius} ${radius} 0 1 0 ${radius * 2} 0a${radius} ${radius} 0 1 0 ${-radius * 2} 0`;
}

function markContents(idPrefix) {
  const { strips, pivot, rivet, gap } = markGeometry();
  // Each rear mask clears a three unit halo around every card drawn in front.
  const defs = strips.map((strip, index) => {
    const later = strips.slice(index + 1).map((behind) =>
      `<path d="${polygonPath(behind.outline)}" fill="black" stroke="black" stroke-width="${gap * 2}" stroke-linejoin="round"/>`
    ).join('');
    const chips = strip.chips.map((chip, chipIndex) => `<path data-chip="${strip.index + 1}-${chipIndex + 1}" d="${polygonPath(chip)}" fill="black"/>`).join('');
    return `<mask id="${idPrefix}-strip-${strip.index + 1}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect x="0" y="0" width="100" height="100" fill="white"/>${chips}${later}</mask>`;
  }).join('');
  const rivetMask = `<mask id="${idPrefix}-rivet" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><rect x="0" y="0" width="100" height="100" fill="white"/><circle data-hole="rivet" cx="${pivot.x}" cy="${pivot.y}" r="${rivet.hole}" fill="black"/></mask>`;
  const shapes = strips.map((strip) => `<path data-strip="${strip.index + 1}" data-angle="${strip.angle}" d="${polygonPath(strip.outline)}" fill="currentColor" mask="url(#${idPrefix}-strip-${strip.index + 1})"/>`).join('');
  const rivetShape = `<circle data-rivet="true" cx="${pivot.x}" cy="${pivot.y}" r="${rivet.radius}" fill="currentColor" mask="url(#${idPrefix}-rivet)"/>`;
  return `<defs>${defs}${rivetMask}</defs>${shapes}${rivetShape}`;
}

export function markSvg(idPrefix = 'pp-mark-asset') {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="Palette Preview mark">${markContents(idPrefix)}</svg>\n`;
}

function inlineMark(className, idPrefix, dimensions = '') {
  return `<svg class="${className}"${dimensions} viewBox="0 0 100 100" aria-hidden="true">${markContents(idPrefix)}</svg>`;
}

function writeMarkupCopies() {
  const headerPath = resolve(here, '../palette.html');
  const header = readFileSync(headerPath, 'utf8');
  const headerMarkup = `<!-- mark:start -->${inlineMark('brand-mark', 'pp-mark-header', ' width="32" height="32"')}<!-- mark:end -->`;
  if (!/<!-- mark:start -->[\s\S]*?<!-- mark:end -->/.test(header)) throw new Error('palette.html must contain mark:start and mark:end comments');
  writeFileSync(headerPath, header.replace(/<!-- mark:start -->[\s\S]*?<!-- mark:end -->/, headerMarkup));

  const socialPath = resolve(here, 'social-preview.html');
  let social = readFileSync(socialPath, 'utf8');
  const socialMarkup = inlineMark('mark', 'pp-mark-social');
  if (!/<svg class="mark"[\s\S]*?<\/svg>/.test(social)) throw new Error('social-preview.html must contain its mark SVG');
  social = social.replace(/<svg class="mark"[\s\S]*?<\/svg>/, socialMarkup);
  social = social.replace(/html,body\{[^}]*\}/, 'html,body{width:1280px;height:640px;margin:0}');
  social = social.replace(/\.title\{[^}]*\}/, `.title{position:absolute;left:${socialText.left}px;top:185px;margin:0;font-size:${socialText.titleSize}px;font-weight:600;line-height:1.2;white-space:nowrap}`);
  social = social.replace(/\.tagline\{[^}]*\}/, `.tagline{position:absolute;left:${socialText.left}px;top:310px;margin:0;font-size:${socialText.subtitleSize}px;font-weight:400;line-height:1.5;white-space:nowrap}`);
  social = social.replace(/\.url\{[^}]*\}/, `.url{position:absolute;left:${socialText.left}px;bottom:48px;margin:0;font-size:${socialText.urlSize}px;font-weight:400;line-height:1.4}`);
  writeFileSync(socialPath, social);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const output = resolve(here, 'mark.svg');
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, markSvg());
  writeMarkupCopies();
  console.log(`wrote ${output}`);
  console.log('updated palette.html and social-preview.html from shared mark geometry');
}
