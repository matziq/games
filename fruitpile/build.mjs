import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(process.argv[2] || String.raw`D:\AI_Output\Fruitpile_PC_and_mobile`);
const vendor = fs.readFileSync(path.join(sourceDir, 'vendor', 'matter-0.20.0.min.js'), 'utf8');
let html = fs.readFileSync(path.join(sourceDir, 'fruitpile.html'), 'utf8');
const dependency = '<script src="vendor/matter-0.20.0.min.js"></script>';
if (!html.includes(dependency)) throw new Error('Matter dependency marker not found');
html = html.replace(dependency, () => `<script>\n${vendor.replace(/<\/script/gi, '<\\/script')}\n</script>`);
if (/<(?:script|link|img)\b[^>]*(?:src|href)=["'](?!data:)/i.test(html)) {
    throw new Error('Standalone release contains an external asset');
}
fs.mkdirSync(output, { recursive: true });
const target = path.join(output, 'FruitPile-2.0.0.html');
fs.writeFileSync(target, html);
fs.writeFileSync(path.join(output, 'HTML-SHA256.txt'), `${crypto.createHash('sha256').update(html).digest('hex')}  ${path.basename(target)}\n`);
console.log(`${target} (${Buffer.byteLength(html)} bytes)`);
