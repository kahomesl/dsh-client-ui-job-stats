/**
 * Preview renderer: draws the plugin's own dock components in a headless browser
 * and writes the screenshots the README and storefronts show.
 *
 * The markup, styles and copy are the shipped ones: the bundle is the same file the
 * Host serves, mounted with the props the renderer composes and with the dark-theme
 * token values taken from the app's own palette. Only the job rows are sample data,
 * because a screenshot of a live session would leak whatever that session ran.
 *
 * Usage: `pnpm preview` (writes docs/screenshot-*.png).
 */
import { build } from 'esbuild';
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..', '..');
const out = join(here, 'build');
mkdirSync(out, { recursive: true });

// 1. The browser half, exactly as the Host serves it.
copyFileSync(join(repo, 'client', 'client.js'), join(out, 'client.js'));

// 2. The preview host: React, the dock frame, and the sample rows.
await build({
  entryPoints: [join(here, 'host.js')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  outfile: join(out, 'host.js'),
  logLevel: 'warning',
});

// 3. The page: the classic script first (it only registers a lazy factory), then the
//    host that mounts it — the same order a real page loads them in.
writeFileSync(join(out, 'index.html'), `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>job-stats preview</title></head>
<body style="margin:0;background:#1a1a1b">
<div id="dock"></div>
<script>
// The page shell installs the module table before any plugin script runs; a real
// page does this too, and the bundle registers into it on load.
window.__registrations = [];
window.__ModuleLoader__ = { load: (registration) => window.__registrations.push(registration) };
</script>
<script src="./client.js"></script>
<script src="./host.js"></script>
<script>
try { window.__preview.mount(new URLSearchParams(location.search)); }
catch (error) {
  document.body.insertAdjacentHTML('afterbegin',
    '<pre id="preview-error" style="color:#f25a5a;padding:12px;white-space:pre-wrap">' + String((error && error.stack) || error) + '</pre>');
}
</script>
</body>
</html>
`);

// 4. Screenshot each state.
const browser = [
  process.env.PREVIEW_BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].find((candidate) => candidate !== undefined && existsSync(candidate));
if (browser === undefined) {
  throw new Error('no headless browser found; set PREVIEW_BROWSER to one');
}

const shots = [
  // `--window-size` is in CSS pixels and `--force-device-scale-factor=2` doubles the
  // output, so this is the dock's real 380px column in a retina image.
  { state: 'list', file: 'screenshot-jobs.png', width: 420, height: 720 },
  { state: 'expanded', file: 'screenshot-detail.png', width: 420, height: 640 },
];
const docs = join(repo, 'docs');
mkdirSync(docs, { recursive: true });
for (const shot of shots) {
  const png = join(out, `${shot.state}.png`);
  if (existsSync(png)) unlinkSync(png);
  execFileSync(browser, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=2',
    `--window-size=${shot.width},${shot.height}`,
    '--virtual-time-budget=5000',
    `--screenshot=${png}`,
    `file:///${join(out, 'index.html').replace(/\\/gu, '/')}?state=${shot.state}`,
  ], { stdio: 'ignore' });
  copyFileSync(png, join(docs, shot.file));
  console.log(`${shot.file}: ${String(readFileSync(png).length)} bytes`);
}
