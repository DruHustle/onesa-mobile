import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

// Edit the vector source, then run npm run assets:build and npm run prebuild.
// All installed artwork is derived from this source; no raster is edited in place.
const assets = new URL('../assets/', import.meta.url);
const source = await readFile(new URL('brand-mark.svg', assets));
const background = source.toString('utf8').match(/data-background="(#[0-9A-Fa-f]{6})"/)?.[1];
if (!background) throw new Error('brand-mark.svg must declare its solid icon background.');

const png = { compressionLevel: 9, progressive: false, palette: false, adaptiveFiltering: false };
const mark = (size) => sharp(source, { density: 1152 }).resize(size, size);

// Apple app icons have an opaque background. Platform launchers apply their own mask.
await writeFile(new URL('icon.png', assets), await mark(1024).flatten({ background }).png(png).toBuffer());

// Keep the glyph within the central Android adaptive-icon safe zone, including its slant.
const foreground = await mark(820).png(png).toBuffer();
await writeFile(new URL('adaptive-icon.png', assets), await sharp({
  create: { width: 1024, height: 1024, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
}).composite([{ input: foreground, left: 102, top: 102 }]).png(png).toBuffer());

// Expo places this transparent artwork on the matching background from app.json.
await writeFile(new URL('splash.png', assets), await mark(1024).png(png).toBuffer());
console.log('Generated icon.png, adaptive-icon.png and splash.png from brand-mark.svg.');
