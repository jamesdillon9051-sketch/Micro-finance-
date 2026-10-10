/**
 * Renders public/icon.svg to the PNG icons the PWA needs (public/icons/*).
 * Run it after changing the artwork:
 *
 *   npx playwright install chromium   # once
 *   node scripts/generate-icons.mjs
 *
 * If Playwright isn't a dependency of this project, point PLAYWRIGHT_MODULE at an install of it.
 */
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');

const svg = await readFile(join(root, 'public/icon.svg'), 'utf8');
// Maskable icons are cropped to a circle or squircle by the OS, so the artwork has to sit inside
// the central 80% "safe zone". The background still bleeds to the edges.
const maskableSvg = svg.replace(
  '<g id="glyph" transform="rotate(-90 256 256)"',
  '<g id="glyph" transform="translate(256 256) scale(0.68) translate(-256 -256) rotate(-90 256 256)"',
);

const targets = [
  { file: 'icon-192.png', size: 192, source: svg },
  { file: 'icon-512.png', size: 512, source: svg },
  { file: 'icon-maskable-512.png', size: 512, source: maskableSvg },
  // iOS draws its own rounded corners, and fills transparent pixels with black, so this is full-bleed.
  { file: 'apple-touch-icon.png', size: 180, source: svg },
  { file: 'favicon-32.png', size: 32, source: svg },
];

await mkdir(join(root, 'public/icons'), { recursive: true });
const browser = await chromium.launch();
for (const { file, size, source } of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<style>html,body{margin:0;background:#000}svg{display:block;width:${size}px;height:${size}px}</style>${source}`,
  );
  await page.screenshot({ path: join(root, 'public/icons', file) });
  await page.close();
  console.log(`wrote public/icons/${file} (${size}x${size})`);
}
await browser.close();
