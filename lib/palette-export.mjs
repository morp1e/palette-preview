const utf16be = (s) => {
  const out = new Uint8Array((s.length + 1) * 2);
  for (let i = 0; i < s.length; i++) { const n = s.charCodeAt(i); out[i * 2] = n >> 8; out[i * 2 + 1] = n & 255; }
  return out;
};
const concat = (...parts) => { const size = parts.reduce((n, p) => n + p.length, 0), out = new Uint8Array(size); let at = 0; for (const p of parts) { out.set(p, at); at += p.length; } return out; };
const u16 = (n) => Uint8Array.of(n >> 8, n & 255);
const u32 = (n) => Uint8Array.of(n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255);
const float = (n) => { const b = new ArrayBuffer(4); new DataView(b).setFloat32(0, n, false); return new Uint8Array(b); };
const rgb = (hex) => hex.match(/[0-9a-f]{2}/gi).map((x) => parseInt(x, 16) / 255);
const block = (type, body) => concat(u16(type), u32(body.length), body);
export function createAse(palette) {
  const baseName = palette.baseId || palette.id;
  const entries = palette.colors.map((c, i) => {
    const name = utf16be(c.custom && !c.name ? `Custom ${c.hex}` : palette.source === 'wada' && c.name ? c.name : `${baseName} ${i + 1}`), [r, g, b] = rgb(c.hex);
    return block(1, concat(u16(name.length / 2), name, Uint8Array.of(0x52, 0x47, 0x42, 0x20), float(r), float(g), float(b), u16(0)));
  });
  const groupName = utf16be(baseName);
  const blocks = [block(0xc001, concat(u16(groupName.length / 2), groupName)), ...entries, block(0xc002, new Uint8Array())];
  return concat(new TextEncoder().encode('ASEF'), u16(1), u16(0), u32(blocks.length), ...blocks);
}
export function parseAse(bytes) {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (new TextDecoder().decode(bytes.slice(0, 4)) !== 'ASEF' || v.getUint16(4) !== 1) throw Error('Invalid ASE');
  const count = v.getUint32(8), colors = []; let at = 12;
  for (let i = 0; i < count; i++) {
    const type = v.getUint16(at), len = v.getUint32(at + 2), start = at + 6;
    if (type === 1) {
      const chars = v.getUint16(start); let name = '';
      for (let j = 0; j < chars - 1; j++) name += String.fromCharCode(v.getUint16(start + 2 + j * 2));
      const pos = start + 2 + chars * 2 + 4;
      const values = [0, 1, 2].map((j) => Math.round(v.getFloat32(pos + j * 4) * 255).toString(16).padStart(2, '0'));
      colors.push({ name, hex: `#${values.join('')}` });
    }
    at = start + len;
  }
  if (at !== bytes.length) throw Error('Invalid ASE block length');
  return colors;
}
export function createGpl(palette) {
  return `GIMP Palette\nName: ${palette.id}\nColumns: ${palette.colors.length}\n#\n${palette.colors.map((c) => { const [r, g, b] = c.hex.match(/[0-9a-f]{2}/gi).map((x) => parseInt(x, 16)); return `${String(r).padStart(3)} ${String(g).padStart(3)} ${String(b).padStart(3)}\t${c.name || c.hex}`; }).join('\n')}\n`;
}
export function createCss(palette) { return `:root {\n${palette.colors.map((c, i) => `  --color-${i + 1}: ${c.hex};`).join('\n')}\n}\n`; }
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(bytes) { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
const le16 = (n) => Uint8Array.of(n & 255, n >> 8 & 255);
const le32 = (n) => Uint8Array.of(n & 255, n >>> 8 & 255, n >>> 16 & 255, n >>> 24 & 255);
function hsb(hex) {
  const [r0, g0, b0] = rgb(hex), max = Math.max(r0, g0, b0), min = Math.min(r0, g0, b0), d = max - min;
  let h = 0; if (d) h = max === r0 ? ((g0 - b0) / d) % 6 : max === g0 ? (b0 - r0) / d + 2 : (r0 - g0) / d + 4;
  return [((h * 60 + 360) % 360) / 360, max ? d / max : 0, max];
}
export function createSwatchesJson(palette) {
  const swatches = palette.colors.slice(0, 30).map((c) => { const [hue, saturation, brightness] = hsb(c.hex); return { hue, saturation, brightness, alpha: 1, colorSpace: 0 }; });
  return JSON.stringify({ name: palette.id, swatches }, null, 2);
}
export function createZip(filename, content) {
  const name = new TextEncoder().encode(filename), data = new TextEncoder().encode(content), crc = crc32(data);
  const local = concat(le32(0x04034b50), le16(20), le16(0), le16(0), le16(0), le16(0), le32(crc), le32(data.length), le32(data.length), le16(name.length), le16(0), name, data);
  const central = concat(le32(0x02014b50), le16(20), le16(20), le16(0), le16(0), le16(0), le16(0), le32(crc), le32(data.length), le32(data.length), le16(name.length), le16(0), le16(0), le16(0), le16(0), le32(0), le32(0), name);
  const end = concat(le32(0x06054b50), le16(0), le16(0), le16(1), le16(1), le32(central.length), le32(local.length), le16(0));
  return concat(local, central, end);
}
export function createSwatchesZip(palette) { return createZip('Swatches.json', createSwatchesJson(palette)); }

export class PaletteHistory {
  constructor(initial, limit = 100) { this.limit = limit; this.items = [structuredClone(initial)]; this.index = 0; }
  get current() { return structuredClone(this.items[this.index]); }
  push(value) { this.items = this.items.slice(0, this.index + 1); this.items.push(structuredClone(value)); if (this.items.length > this.limit) this.items.shift(); this.index = this.items.length - 1; }
  undo() { if (this.index > 0) this.index--; return this.current; }
  redo() { if (this.index < this.items.length - 1) this.index++; return this.current; }
}
