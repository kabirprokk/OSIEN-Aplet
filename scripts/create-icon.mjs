import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pngToIco from 'png-to-ico';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, 'src', 'assets', 'osien-logo.png');
const target = path.join(root, 'src', 'assets', 'osien-logo.ico');
await writeFile(target, await pngToIco(source));
console.log(`Created ${target}`);
