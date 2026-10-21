import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { create1BitPng } from '../tools/make-1bit-png.mjs';
import { markGeometry, markSvg } from '../brand/make-mark.mjs';

function assertWellFormedXml(svg) {
  const tokens = svg.match(/<!--[\s\S]*?-->|<\?[^>]*\?>|<![^>]*>|<[^>]+>|[^<]+/g) ?? [];
  const stack = [];
  for (const token of tokens) {
    if (token.startsWith('<!--') || token.startsWith('<?') || token.startsWith('<!')) continue;
    if (!token.startsWith('<')) { assert.ok(!token.includes('&') || /&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/i.test(token), `unescaped XML text: ${token}`); continue; }
    const closing = /^<\//.test(token), selfClosing = /\/>$/.test(token);
    const name = /^<\/?([A-Za-z_][\w:.-]*)/.exec(token)?.[1];
    assert.ok(name, `invalid XML tag ${token}`);
    if (closing) assert.equal(stack.pop(), name, `mismatched closing tag ${token}`);
    else {
      const attrs = token.slice(name.length + 1, token.length - (selfClosing ? 2 : 1));
      const attrPattern = /\s+([A-Za-z_][\w:.-]*)\s*=\s*("[^"]*"|'[^']*')/gy;
      let pos = 0;
      while (pos < attrs.length) {
        attrPattern.lastIndex = pos;
        if (!/^\s*$/.test(attrs.slice(pos))) { const match = attrPattern.exec(attrs); assert.ok(match, `invalid XML attributes: ${attrs.slice(pos)}`); pos = attrPattern.lastIndex; }
        else break;
      }
      if (!selfClosing) stack.push(name);
    }
  }
  assert.deepEqual(stack, [], 'unclosed XML elements');
}

test('generated SVG mark is well formed, has four strips and chip counts 2, 3, 4, 5, and uses one ink', () => {
  const svg = markSvg(); assertWellFormedXml(svg);
  assert.equal((svg.match(/data-strip=/g) ?? []).length, 4);
  assert.deepEqual([...svg.matchAll(/data-strip="(\d+)"/g)].map((m) => Number(m[1])), [1, 2, 3, 4]);
  assert.deepEqual([1, 2, 3, 4].map((strip) => [...svg.matchAll(new RegExp(`data-chip="${strip}-`, 'g'))].length), [2, 3, 4, 5]);
  assert.equal((svg.match(/<mask\b/g) ?? []).length, 5);
  assert.match(svg, /data-hole="rivet"/);
  assert.match(svg, /stroke-width="6"/);
  const geometry = markGeometry();
  for (const strip of geometry.strips) {
    const centers = strip.chips.map((chip) => chip.reduce((out, point) => [out[0] + point[0] / 4, out[1] + point[1] / 4], [0, 0]));
    for (let index = 0; index < strip.chips.length; index++) {
      const chip = strip.chips[index], center = centers[index];
      const sideA = Math.hypot(chip[1][0] - chip[0][0], chip[1][1] - chip[0][1]);
      const sideB = Math.hypot(chip[2][0] - chip[1][0], chip[2][1] - chip[1][1]);
      assert.ok(Math.abs(sideA - 10) < 0.001 && Math.abs(sideB - 10) < 0.001, 'chips are 10 unit squares');
      const across = (center[0] - geometry.pivot.x) * strip.side.x + (center[1] - geometry.pivot.y) * strip.side.y;
      assert.ok(Math.abs(across) < 0.001, 'chips are centred across their strip');
      if (index > 0) {
        const along = (centers[index - 1][0] - center[0]) * strip.unit.x + (centers[index - 1][1] - center[1]) * strip.unit.y;
        assert.ok(Math.abs(along - 13) < 0.001, 'chips have a 3 unit gap');
      }
    }
    const firstAlong = (centers[0][0] - geometry.pivot.x) * strip.unit.x + (centers[0][1] - geometry.pivot.y) * strip.unit.y;
    assert.ok(Math.abs((geometry.length - firstAlong) - 8) < 0.001, 'first chip begins 3 units from the free end');
  }
  for (const shape of svg.match(/<(?:path|circle)\b[^>]*(?:data-strip|data-rivet)[^>]*>/g) ?? []) assert.match(shape, /fill="currentColor"/);
  assert.match(svg, /id="pp-mark-asset-strip-1"/);
  const header = readFileSync(new URL('../palette.html', import.meta.url), 'utf8');
  const inline = /<svg class="brand-mark"[\s\S]*?<\/svg>/.exec(header)?.[0];
  assert.ok(inline); assertWellFormedXml(inline.replace('class="brand-mark"', 'xmlns="http://www.w3.org/2000/svg" class="brand-mark"'));
  assert.match(inline, /width="32" height="32"/);
  assert.match(header, /\.brand-mark\{[^}]*width:32px;[^}]*height:32px;[^}]*flex-shrink:0/);
  assert.match(header, /\.page-title\{[^}]*align-items:center;[^}]*gap:12px/);
  const svgTags = [...header.matchAll(/<svg\b[^>]*>/g)].map(([tag]) => tag);
  assert.ok(svgTags.length > 0);
  for (const tag of svgTags) assert.match(tag, /\bwidth="[^"]+"/), `inline SVG has explicit width: ${tag}`;
  for (const tag of svgTags) assert.match(tag, /\bheight="[^"]+"/), `inline SVG has explicit height: ${tag}`;
  assert.deepEqual([1, 2, 3, 4].map((strip) => [...inline.matchAll(new RegExp(`data-chip="${strip}-`, 'g'))].length), [2, 3, 4, 5]);
  assert.match(inline, /id="pp-mark-header-strip-1"/);
  assert.match(inline, /aria-hidden="true"/);
  const social = readFileSync(new URL('../brand/social-preview.html', import.meta.url), 'utf8');
  assert.match(social, /width:1280px;height:640px/);
  assert.match(social, /href="\.\.\/fonts\/fonts-mm\.css"/);
  assert.doesNotMatch(social, /overflow\s*:\s*hidden/i);
  const textBlockLeft = 500;
  const socialLines = [
    { selector: 'title', text: 'Palette Preview', fontSize: 60 },
    { selector: 'tagline', text: 'Your SVG in 2,125 palettes, in the browser', fontSize: 24 },
    { selector: 'url', text: 'morpeia.com/palette', fontSize: 24 },
  ];
  for (const line of socialLines) {
    assert.match(social, new RegExp(`\\.${line.selector}\\{[^}]*left:${textBlockLeft}px;[^}]*font-size:${line.fontSize}px`));
    assert.ok(textBlockLeft + line.text.length * 0.64 * line.fontSize <= 1180, `${line.selector} line fits by the Martian Mono width estimate`);
    assert.ok(social.includes(`>${line.text}<`), `${line.selector} text matches the measured line`);
  }
  // The PNG is rendered from social-preview.html in a browser by the maintainer; if present it must be 1280x640.
  const socialPng = new URL('../brand/social-preview.png', import.meta.url);
  if (existsSync(socialPng)) {
    const png = readFileSync(socialPng);
    assert.equal(png.toString('ascii', 1, 4), 'PNG');
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1280, 640]);
  }

  const sourceSvg = readFileSync(new URL('../brand/mark.svg', import.meta.url), 'utf8');
  const socialSvg = /<svg class="mark"[\s\S]*?<\/svg>/.exec(social)?.[0];
  assert.ok(socialSvg);
  const paths = (markup) => [...markup.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)].map(([, d]) => d);
  assert.deepEqual(paths(sourceSvg), paths(socialSvg), 'social preview uses the generated mark path geometry');
  assert.deepEqual(paths(sourceSvg), paths(inline), 'page header uses the generated mark path geometry');
});

test('1-bit PNG has exact paper and ink palette and renders both indices', () => {
  const paper = '#fdd4bd', ink = '#112f2c';
  const width = 128, height = 128;
  const png = create1BitPng({ width, height, paper, ink, scale: 1 });
  assert.equal(png.toString('hex', 0, 8), '89504e470d0a1a0a');
  let offset = 8, ihdr, plte, idat;
  while (offset < png.length) {
    const length = png.readUInt32BE(offset), type = png.toString('ascii', offset + 4, offset + 8), data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') ihdr = data;
    if (type === 'PLTE') plte = data;
    if (type === 'IDAT') idat = data;
    offset += 12 + length;
  }
  assert.equal(ihdr.readUInt32BE(0), width); assert.equal(ihdr.readUInt32BE(4), height);
  assert.equal(ihdr[8], 1); assert.equal(ihdr[9], 3);
  assert.deepEqual([...plte], [...Buffer.from(`${paper.slice(1)}${ink.slice(1)}`, 'hex')]);
  const rows = inflateSync(idat), rowBytes = width / 8; let hasPaper = false, hasInk = false;
  for (let y = 0; y < height; y++) {
    assert.equal(rows[y * (rowBytes + 1)], 0);
    for (let x = 0; x < 64; x++) ((rows[y * (rowBytes + 1) + 1 + (x >> 3)] >> (7 - (x & 7))) & 1 ? hasInk = true : hasPaper = true);
  }
  assert.ok(hasPaper && hasInk);
  const pixelIsInk = (x, y) => Boolean((rows[Math.floor(y) * (rowBytes + 1) + 1 + (Math.floor(x) >> 3)] >> (7 - (Math.floor(x) & 7))) & 1);
  const geometry = markGeometry(), chip = geometry.strips[3].chips[2];
  const chipCenter = chip.reduce((out, point) => [out[0] + point[0] / 4, out[1] + point[1] / 4], [0, 0]);
  const pixelAt = ([x, y]) => [width / 2 + (x - 50) * width / 100, height / 2 + (y - 50) * height / 100];
  assert.equal(pixelIsInk(...pixelAt(chipCenter)), false, 'chip center is transparent');
  const back = geometry.strips[0], front = geometry.strips[1];
  const point = (along, across) => [geometry.pivot.x + front.unit.x * along + front.side.x * across, geometry.pivot.y + front.unit.y * along + front.side.y * across];
  assert.equal(pixelIsInk(...pixelAt(point(20, -10))), false, 'three unit gap beside the front strip is transparent');
  assert.equal(pixelIsInk(...pixelAt(point(20, -13.5))), true, 'back strip remains ink beyond the gap');
});
