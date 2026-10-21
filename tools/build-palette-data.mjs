import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, 'data', 'palette', 'sources');
const output = join(root, 'data', 'palette', 'palettes.json');
const read = (path) => readFileSync(path, 'utf8');
const json = (path) => JSON.parse(read(path));
const color = (hex, name = hex) => ({ name, hex: hex.toLowerCase() });
const data = [];

// Each Wada colour lists every combination in which it appears. Preserve the
// names and include combinations of two, three, and four colours.
const wada = json(join(source, 'wada', 'colors.json'));
const combos = new Map();
for (const entry of wada) for (const id of entry.combinations) {
  if (!combos.has(id)) combos.set(id, []);
  combos.get(id).push(entry);
}
for (const [id, entries] of [...combos].sort(([a], [b]) => a - b)) {
  if (entries.length >= 2 && entries.length <= 4) data.push({
    source: 'wada', id: `Wada ${id}`, colors: entries.map((x) => color(x.hex, x.name)),
  });
}

// Extract the literal list in the upstream R source. Palette vectors are the
// first list item; the second, when present, is the documented discrete order.
const met = read(join(source, 'metbrewer', 'PaletteCode.R'));
for (const match of met.matchAll(/^\s{2}([A-Za-z0-9]+)\s*=\s*list\(c\(([^)]*)\)(?:,\s*c\(([^)]*)\))?/gm)) {
  let hexes = [...match[2].matchAll(/"(#[0-9A-Fa-f]{6})"/g)].map((x) => x[1]);
  if (match[3]) {
    const order = [...match[3].matchAll(/\d+/g)].map((x) => Number(x[0]));
    if (order.length === hexes.length && order.every((n) => n >= 1 && n <= hexes.length)) hexes = order.map((n) => hexes[n - 1]);
  }
  if (hexes.length) data.push({ source: 'metbrewer', id: `MetBrewer ${match[1]}`, colors: hexes.map((x) => color(x)) });
}

const wes = read(join(source, 'wesanderson', 'colors.R'));
const seenWes = new Set();
for (const match of wes.matchAll(/^\s{2}([A-Za-z0-9]+)\s*=\s*c\(([^)]*)\)/gm)) {
  if (match[1].endsWith('Continuous')) continue;
  const hexes = [...match[2].matchAll(/"(#[0-9A-Fa-f]{6})"/g)].map((x) => x[1]);
  const signature = hexes.map((x) => x.toLowerCase()).join(',');
  if (hexes.length && !seenWes.has(signature)) {
    seenWes.add(signature);
    data.push({ source: 'wesanderson', id: `Wes Anderson ${match[1]}`, colors: hexes.map((x) => color(x)) });
  }
}

for (const [i, colors] of json(join(source, 'colourlovers', 'nice-color-palettes-1000.json')).entries()) {
  data.push({ source: 'colourlovers', id: `ColourLovers #${i + 1}`, colors: colors.map((hex) => color(hex)) });
}

const hunt = new Map();
const files = ['all', 'retro', 'vintage'].flatMap((tag) => Array.from({ length: 6 }, (_, i) => `${tag}-${i}.json`));
for (const file of files) {
  const tag = file.split('-')[0];
  for (const item of json(join(source, 'colorhunt', file))) {
    const code = item.code.toLowerCase();
    const prior = hunt.get(code);
    if (prior) { if (tag !== 'all') prior.tag = tag; continue; }
    const palette = { source: 'colorhunt', id: `Color Hunt ${code.slice(0, 6)}…`, code, tag: tag === 'all' ? '' : tag,
      colors: Array.from({ length: 4 }, (_, i) => color(`#${code.slice(i * 6, i * 6 + 6)}`)) };
    hunt.set(code, palette);
    data.push(palette);
  }
}

mkdirSync(dirname(output), { recursive: true });
const outputText = JSON.stringify(data) + '\n';
writeFileSync(output, outputText);
console.log(`wrote data/palette/palettes.json: ${data.length} palettes, ${Buffer.byteLength(outputText)} bytes`);
console.log(Object.entries(Object.groupBy(data, (p) => p.source)).map(([s, v]) => `${s}: ${v.length}`).join('\n'));
