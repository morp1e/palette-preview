import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, 'dist');
rmSync(dist, { recursive: true, force: true }); mkdirSync(dist, { recursive: true });
const fragment = readFileSync(join(root, 'palette.html'), 'utf8');
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Palette Preview</title>
<meta name="description" content="Preview your SVG artwork across curated colour palettes in your browser.">
<link rel="stylesheet" href="/fonts/fonts-mm.css">
</head>
<body>
${fragment}
</body>
</html>
`;
writeFileSync(join(dist, 'index.html'), html);
for (const name of ['lib', 'data', 'fonts']) cpSync(join(root, name), join(dist, name), { recursive: true });
console.log('built dist/');
