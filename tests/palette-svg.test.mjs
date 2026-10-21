import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeColor, isHexColor, extractColorsFromText, sanitizeSvgDocument, colorToken, rewriteCssDeclarations, groupColors, rankMapping, remapAlpha, rewritePaintValue, ensureImplicitBlack, lab, labDistance, paletteHasColorNear, pngExportDimensions, formatPaletteName, paletteSwatchLabel, paletteThumbnailCacheKey, reduceColorGroups, selectLightnessSpread, applyLockedColors } from '../lib/palette-svg.mjs';

test('validates editable hex colours with digits and rejects malformed values',()=>{
 assert.equal(isHexColor('#123456'),true);assert.equal(isHexColor('#abc'),true);assert.equal(isHexColor('#ABC123'),true);
 assert.equal(isHexColor('zz'),false);assert.equal(isHexColor('#12345'),false);
});

test('reduces colour groups to N while keeping original groups outside the limit',()=>{
 const groups=[['#000000'],['#101010'],['#808080'],['#ffffff']];
 const reduced=reduceColorGroups(groups,2,{keep:[3]});
 assert.equal(reduced.length,3);assert.equal(reduced.find(g=>g.keep).members[0],'#ffffff');
 assert.equal(reduced.filter(g=>!g.keep).length,2);
 assert.deepEqual(reduced.find(g=>g.sourceIndices.length===2).members,['#000000','#101010']);
});
test('selects evenly spaced lightness ranks and lock colours replace nearest slots once',()=>{
 assert.deepEqual(selectLightnessSpread(['#000000','#333333','#777777','#bbbbbb','#ffffff'],3),['#000000','#777777','#ffffff']);
 const base={id:'test',colors:[{hex:'#000000'},{hex:'#777777'},{hex:'#ffffff'}]};
 const replaced=applyLockedColors(base,[{hex:'#080808'},{hex:'#090909'},{hex:'#eeeeee'},{hex:'#ff0000'}]);
 assert.deepEqual(replaced.colors.map(c=>c.hex),['#080808','#090909','#eeeeee','#ff0000']);
 assert.equal(replaced.lockedCount,4);
});

test('normalizes solid hex, short hex, rgb and common named colours', () => {
  assert.equal(normalizeColor('#AbC'), '#aabbcc');
  assert.equal(normalizeColor('#123456'), '#123456');
  assert.equal(normalizeColor('rgb(255, 16, 0)'), '#ff1000');
  assert.equal(normalizeColor('red'), '#ff0000');
  assert.equal(normalizeColor('none'), null);
  assert.equal(normalizeColor('transparent'), null);
  assert.equal(normalizeColor('url(#gradient)'), null);
});

test('parses alpha, percentage RGB, HSL and important colour tokens',()=>{
  assert.equal(normalizeColor('#1234'),'#11223344'); assert.equal(normalizeColor('#11223380'),'#11223380');
  assert.equal(normalizeColor('rgb(100%, 0%, 50%)'),'#ff0080'); assert.equal(normalizeColor('hsl(0, 100%, 50%)'),'#ff0000');
  assert.equal(normalizeColor('hsla(0, 100%, 50%, 25%)'),'#ff000040');
  assert.equal(colorToken('#abc !important'),'#aabbcc');
  assert.equal(normalizeColor('darkslateblue'),'#483d8b');
  assert.equal(remapAlpha('#12345680','#abcdef'),'#abcdef80');
  assert.equal(remapAlpha('rgba(1,2,3,.25)','#abcdef'),'#abcdef40');
});
test('rewrites CSS declaration text in nested-rule contents and preserves important',()=>{
 const css='path,.x{fill:#000!important;stroke:red}@media(x){.a{fill:#fff}}';
 assert.match(rewriteCssDeclarations(css,v=>v==='#000'?'#123456':v==='#fff'?'#eeeeee':v),/fill:#123456!important/);
 assert.match(rewriteCssDeclarations(css,v=>v==='#000'?'#123456':v==='#fff'?'#eeeeee':v),/fill:#eeeeee/);
});
test('groups near colours and maps lightness ranks across palette sizes',()=>{
 assert.equal(groupColors(['#ff0000','#fe0000'],6).length,1);
 assert.deepEqual(Object.values(rankMapping(['#000000','#111111','#222222','#333333','#444444','#555555','#666666','#777777','#888888','#ffffff'],['#000000','#555555','#aaaaaa','#ffffff'])),[0,0,0,1,1,2,2,2,3,3]);
 assert.equal(rankMapping(['#000000','#ffffff'],['#000000','#ffffff','#ff0000','#00ff00','#0000ff'])[0],0);
 assert.equal(rankMapping(['#000000'],['#ffffff'],{0:5})[0],0);
});
test('Keep original rows do not consume the reduced palette lightness ranks',()=>{
 const groups=[['#000000'],['#777777'],['#ffffff']],mapping=rankMapping(groups,['#000000','#ffffff'],{2:'keep'});
 assert.equal(mapping[2],'keep');assert.deepEqual([mapping[0],mapping[1]],[0,1]);
 const reduced=reduceColorGroups([['#000000'],['#111111'],['#555555'],['#aaaaaa'],['#ffffff']],2,{keep:[4]});
 assert.equal(reduced.filter(g=>!g.keep).length,2);assert.deepEqual(reduced.find(g=>g.keep).members,['#ffffff']);
});

test('extracts fill and stroke declarations from inline CSS and style rules', () => {
  assert.deepEqual(extractColorsFromText('.st0{fill:#abc;stroke:rgb(0, 12, 255)} path{fill:red}'),
    ['#aabbcc', '#000cff', '#ff0000']);
  assert.deepEqual(extractColorsFromText('fill:none;stroke:transparent;fill:url(#paint)'), []);
});

class Element {
  constructor(name, attrs = {}, text = '') { this.localName = name; this._attrs = new Map(Object.entries(attrs)); this.textContent = text; this.removed = false; this.children = []; }
  get attributes() { return [...this._attrs].map(([name, value]) => ({ name, value })); }
  getAttribute(name) { return this._attrs.get(name) ?? null; }
  removeAttribute(name) { this._attrs.delete(name); }
  setAttribute(name,value) { this._attrs.set(name,String(value)); }
  hasAttribute(name) { return this._attrs.has(name); }
  remove() { this.removed = true; }
  querySelectorAll(selector) {
    const all = this.children.flatMap((child) => [child, ...child.querySelectorAll('*')]);
    if (selector === '*') return all;
    if (selector.includes(',')) { const names = selector.split(',').map((name) => name.trim()); return all.filter((e) => names.includes(e.localName)); }
    if (selector === 'image') return all.filter((e) => e.localName === 'image');
    if (selector === 'style') return all.filter((e) => e.localName === 'style');
    return [];
  }
}

test('sanitizer drops executable nodes, event handlers, external references and remote images', () => {
  const root = new Element('svg', { onload: 'run()' });
  const script = new Element('script');
  const foreign = new Element('foreignObject');
  const linked = new Element('use', { href: 'https://bad.test/a.svg#x', onclick: 'run()' });
  const local = new Element('use', { href: '#shape' });
  const remoteImage = new Element('image', { href: 'https://bad.test/image.png' });
  const dataImage = new Element('image', { href: 'data:image/png;base64,AA==' });
  const remoteCss = new Element('style', {}, '.x{fill:url(https://bad.test/x)}');
  const safeCss = new Element('style', {}, '.x{fill:url(#gradient)}');
  const set = new Element('set', { attributeName: 'href', to: 'javascript:alert(1)' });
  const animate = new Element('animate');
  const animateMotion = new Element('animateMotion');
  const animateTransform = new Element('animateTransform');
  const frame = new Element('iframe'), embed = new Element('embed'), object = new Element('object');
  const audio = new Element('audio'), video = new Element('video');
  root.children = [script, foreign, linked, local, remoteImage, dataImage, remoteCss, safeCss, set, animate, animateMotion, animateTransform, frame, embed, object, audio, video];
  const doc = { documentElement: root };
  sanitizeSvgDocument(doc);
  assert.equal(root.getAttribute('onload'), null);
  assert.equal(script.removed, true);
  assert.equal(foreign.removed, true);
  assert.equal(linked.getAttribute('href'), null);
  assert.equal(linked.getAttribute('onclick'), null);
  assert.equal(local.getAttribute('href'), '#shape');
  assert.equal(remoteImage.removed, true);
  assert.equal(dataImage.removed, false);
  assert.equal(remoteCss.removed, true);
  assert.equal(safeCss.removed, false);
  for (const el of [set, animate, animateMotion, animateTransform, frame, embed, object, audio, video]) assert.equal(el.removed, true);
});

test('sanitizer removes namespaced remote href, xml base and escaped remote URLs',()=>{
 const root=new Element('svg',{'xml:base':'https://bad.test/'});
 const prefixed=new Element('use',{'x:href':'https://bad.test/s.svg#x'});
 const escaped=new Element('path',{style:'fill:url(\\68 ttps://bad.test/p.svg#x)'});
 const escapedBlock=new Element('style',{},'.x{fill:url(\\68 ttps://bad.test/p.svg#x)}');
 root.children=[prefixed,escaped,escapedBlock];sanitizeSvgDocument({documentElement:root});
 assert.equal(root.getAttribute('xml:base'),null);assert.equal(prefixed.getAttribute('x:href'),null);assert.equal(escaped.getAttribute('style'),null);assert.equal(escapedBlock.removed,true);
});
test('paint attribute mapping handles gradient stop-color and default black',()=>{
 assert.equal(rewritePaintValue('stop-color','#abc',()=> '#123456'),'#123456');
 assert.equal(rewritePaintValue('fill','rgba(10,20,30,.5)',()=> '#ffffff80'),'#ffffff80');
 assert.equal(rewritePaintValue('stroke','url(#g)',()=> '#fff'),'url(#g)');
 const root=new Element('svg');ensureImplicitBlack(root);assert.equal(root.getAttribute('fill'),'#000000');
 const explicit=new Element('svg',{fill:'red'});ensureImplicitBlack(explicit);assert.equal(explicit.getAttribute('fill'),'red');
});test('sanitizer removes external presentation paint URLs and preserves local fragments',()=>{
 const remote=new Element('path',{fill:'url(https://bad.test/a.svg#paint)'});
 const local=new Element('path',{fill:'url(#paint)'});
 const escaped=new Element('path',{fill:String.raw`u\72l(https://bad.test/a.svg#paint)`});
 const root=new Element('svg');root.children=[remote,local,escaped];sanitizeSvgDocument({documentElement:root});
 assert.equal(remote.getAttribute('fill'),null);assert.equal(local.getAttribute('fill'),'url(#paint)');assert.equal(escaped.getAttribute('fill'),null);
});
test('grouping does not chain a broad grayscale ramp into one near-colour group',()=>{
 const ramp=Array.from({length:25},(_,i)=>{const n=Math.round(i*255/24).toString(16).padStart(2,'0');return `#${n}${n}${n}`});
 const groups=groupColors(ramp,6);assert.ok(groups.length>1);assert.ok(!groups.some(g=>g.includes('#000000')&&g.includes('#ffffff')));
 for(const g of groups)for(const a of g)for(const b of g){const la=lab(a),lb=lab(b);assert.ok(Math.hypot(...la.map((v,i)=>v-lb[i]))<=6)}
});

test('default Lab threshold groups the requested similar colours and separates distinct colours',()=>{
 assert.equal(groupColors(['#fffbef','#ffffff']).length,1);
 assert.equal(groupColors(['#d5a537','#d2a514']).length,1);
 const golds=groupColors(['#efcd80','#d5a537','#d2a514','#c89e44','#8b6424']);assert.ok(golds.some(g=>g.length>=3&&g.includes('#d5a537')&&g.includes('#d2a514')));
 assert.equal(groupColors(['#e94e1b','#1d1d1b']).length,2);
 assert.ok(labDistance('#e94e1b','#1d1d1b')>10.5);
});
test('seed-anchored groups do not chain beyond the seed threshold',()=>{
 const chain=['#000000','#101010','#202020'];const groups=groupColors(chain,5);
 assert.equal(groups.length,2);assert.ok(labDistance(groups[0][0],groups[0][1])<=5);assert.ok(labDistance(groups[0][0],groups[1][0])>5);
});
test('near-colour filter uses a wider perceptual Lab threshold',()=>{
 const palette={colors:[{hex:'#d2a514'},{hex:'#204060'}]};
 assert.equal(paletteHasColorNear(palette,'#d5a537'),true);
 assert.equal(paletteHasColorNear(palette,'#d5a537',5),false);
 assert.equal(paletteHasColorNear({colors:[{hex:'#ff0000'}]},'#ff0000'),true);
 assert.equal(paletteHasColorNear(palette,'#ff0000'),false);
});
test('PNG export uses intrinsic SVG dimensions, 2x scale, and edge limits',()=>{
 assert.deepEqual(pngExportDimensions(null,null,'0 0 400 560'),[800,1120]);
 assert.deepEqual(pngExportDimensions('1in','2in','0 0 40 80'),[500,1000]);
 assert.deepEqual(pngExportDimensions('10mm','20mm','0 0 10 20'),[500,1000]);
 assert.deepEqual(pngExportDimensions('3000px','4000px','0 0 300 400'),[3000,4000]);
});
test('palette display names use one stable format',()=>{
 assert.equal(formatPaletteName({source:'wada',id:'Wada No. 241'}),'Wada 241');
 assert.equal(formatPaletteName({source:'colourlovers',id:'ColourLovers #34'}),'ColourLovers 34');
 assert.equal(formatPaletteName({source:'colorhunt',id:'Color Hunt e3fdfd…',code:'e3fdfdcbf1f5a6e3e971c9ce'}),'Color Hunt e3fdfdcbf1f5a6e3e971c9ce');
});
test('swatch labels prefer Custom, then original names, then hex',()=>{
 assert.equal(paletteSwatchLabel({hex:'#abcdef'}),'#ABCDEF');
 assert.equal(paletteSwatchLabel({hex:'#abcdef',name:'Rose'}),'Rose');
 assert.equal(paletteSwatchLabel({hex:'#abcdef',name:'Rose',custom:true}),'Custom');
});
test('thumbnail cache keys change with palette and mapping or paper signature',()=>{
 const key=paletteThumbnailCacheKey('wada-1','file-1|mapping-a|paper-white');
 assert.equal(key,paletteThumbnailCacheKey('wada-1','file-1|mapping-a|paper-white'));
 assert.notEqual(key,paletteThumbnailCacheKey('wada-2','file-1|mapping-a|paper-white'));
 assert.notEqual(key,paletteThumbnailCacheKey('wada-1','file-1|mapping-b|paper-white'));
 assert.notEqual(key,paletteThumbnailCacheKey('wada-1','file-1|mapping-a|paper-offwhite'));
 assert.notEqual(key,paletteThumbnailCacheKey('wada-1','file-2|mapping-a|paper-white'));
});
