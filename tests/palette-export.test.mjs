import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAse, parseAse, createGpl, createCss, createSwatchesJson, createZip, crc32, PaletteHistory } from '../lib/palette-export.mjs';

const sample = { source: 'wada', id: 'Wada 241', colors: [{ name: 'Rose', hex: '#ff0000' }, { name: 'Night', hex: '#123456' }] };

test('ASE writes named global RGB colours and parses its own output', () => {
  const bytes = createAse(sample);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), 'ASEF');
  assert.deepEqual(parseAse(bytes), sample.colors);
});
test('ASE locked palette uses base group and swatch names, with custom edited names',()=>{
 const palette={source:'colorhunt',id:'Color Hunt code + 1 locked',baseId:'Color Hunt code',colors:[
  {hex:'#112233',locked:true,custom:false},{hex:'#ff0000',locked:true,custom:true}
 ]};
 const bytes=createAse(palette);
 assert.deepEqual(parseAse(bytes).map(c=>c.name),['Color Hunt code 1','Custom #ff0000']);
 const be=text=>Uint8Array.from([...text,'\0'].flatMap(ch=>[0,ch.charCodeAt(0)]));
 const has=(haystack,needle)=>haystack.some((_,i)=>needle.every((value,j)=>haystack[i+j]===value));
 assert.equal(has(bytes,be('Color Hunt code')),true);
 assert.equal(has(bytes,be('Color Hunt code + 1 locked')),false);
});

test('GPL and CSS exports contain each palette colour', () => {
  assert.match(createGpl(sample), /GIMP Palette\nName: Wada 241/);
  assert.match(createGpl(sample), /255   0   0\tRose/);
  assert.match(createCss(sample), /--color-2: #123456;/);
});

test('Procreate ZIP is store-only, has valid CRC and Swatches.json HSB data', () => {
  const json = createSwatchesJson(sample), zip = createZip('Swatches.json', json), view = new DataView(zip.buffer);
  assert.equal(view.getUint32(0, true), 0x04034b50);
  assert.equal(view.getUint16(8, true), 0);
  const nameLength = view.getUint16(26, true), dataLength = view.getUint32(22, true);
  const name = new TextDecoder().decode(zip.slice(30, 30 + nameLength));
  const content = zip.slice(30 + nameLength, 30 + nameLength + dataLength);
  assert.equal(name, 'Swatches.json');
  assert.equal(view.getUint32(14, true), crc32(content));
  const parsed = JSON.parse(new TextDecoder().decode(content));
  assert.equal(parsed.name, sample.id);
  assert.deepEqual(parsed.swatches[0], { hue: 0, saturation: 1, brightness: 1, alpha: 1, colorSpace: 0 });
  assert.equal(view.getUint32(zip.length - 22, true), 0x06054b50);
});

test('history supports undo, redo, branching, and a 100 step cap', () => {
  const h = new PaletteHistory({ n: 0 });
  h.push({ n: 1 }); h.push({ n: 2 });
  assert.deepEqual(h.undo(), { n: 1 });
  assert.deepEqual(h.redo(), { n: 2 });
  h.undo(); h.push({ n: 7 });
  assert.deepEqual(h.redo(), { n: 7 });
  for (let n = 0; n < 120; n++) h.push({ n });
  assert.equal(h.items.length, 100);
  while (h.index > 0) h.undo();
  assert.deepEqual(h.current, { n: 20 });
});

test('source parsers yield complete requested collections and MetBrewer order', () => {
  const data = JSON.parse(readFileSync(new URL('../data/palette/palettes.json', import.meta.url), 'utf8'));
  const counts = Object.fromEntries(Object.entries(Object.groupBy(data, (p) => p.source)).map(([key, list]) => [key, list.length]));
  assert.deepEqual(counts, { wada: 348, metbrewer: 56, wesanderson: 22, colourlovers: 992, colorhunt: 707 });
  const buckets = data.reduce((acc, p) => { const n = p.colors.length; acc[n >= 7 ? '7+' : String(n)]++; return acc; }, { '2': 0, '3': 0, '4': 0, '5': 0, '6': 0, '7+': 0 });
  assert.equal(Object.values(buckets).reduce((sum, n) => sum + n, 0), data.length);
  assert.ok(data.every((p) => p.colors.length >= 2 && p.colors.length <= 14));
  assert.equal(data.find((p) => p.id === 'MetBrewer Archambault').colors[0].hex, '#381a61');
  assert.equal(data.find((p) => p.id === 'Wes Anderson Darjeeling1').colors.length, 5);
  assert.ok(data.some((p) => p.id === 'Wada 241'));
});
