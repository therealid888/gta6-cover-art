// Vice Cover Studio — the entry program for gta6-cover-art-01 (Node 22,
// standard library only).
//
// It hands the app in: it copies app/ and screenshots/ from beside this
// file into the output directory and writes the dossier the judge reads,
// using buildDossier from the kit's vendored library. Outside the grader,
// MAKEFUN_OUTPUT_DIR stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { buildDossier } from './vendor/makefun-app.ts';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** Copy a directory tree, files and subdirectories, into a fresh folder. */
function copyTree(from: string, to: string): number {
  mkdirSync(to, { recursive: true });
  let copied = 0;
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const src = join(from, entry.name);
    const dst = join(to, entry.name);
    if (entry.isDirectory()) {
      copied += copyTree(src, dst);
    } else if (entry.isFile()) {
      copyFileSync(src, dst);
      copied++;
    }
  }
  return copied;
}

function main(): void {
  const appDir = join(repoRoot, 'app');
  const shotsDir = join(repoRoot, 'screenshots');
  if (!existsSync(appDir) || !statSync(appDir).isDirectory()) {
    throw new Error(`app/ not found beside main.ts (${appDir})`);
  }
  if (!existsSync(shotsDir) || !statSync(shotsDir).isDirectory()) {
    throw new Error(`screenshots/ not found beside main.ts (${shotsDir})`);
  }

  mkdirSync(outputDir, { recursive: true });
  // Clear any earlier copy first, so a stale file from a previous build
  // can never leak into this dossier.
  for (const sub of ['app', 'screenshots']) {
    rmSync(join(outputDir, sub), { recursive: true, force: true });
  }
  const appFiles = copyTree(appDir, join(outputDir, 'app'));
  const shotFiles = copyTree(shotsDir, join(outputDir, 'screenshots'));

  const dossier = buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
  });
  // buildDossier hands back bytes, not a string: decode them to text
  // before parsing, or JSON.parse would read the byte list as numbers.
  const dossierText = typeof dossier === 'string'
    ? dossier
    : Buffer.from(dossier as Uint8Array).toString('utf8');
  // Read the dossier back and prove it is well-formed JSON under the
  // 1.5 MiB cap, instead of trusting the bytes we just wrote.
  const parsed = JSON.parse(dossierText) as Record<string, unknown>;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('dossier.json did not parse as a JSON object');
  }
  const dossierBytes = Buffer.byteLength(dossierText, 'utf8');
  if (dossierBytes >= 1572864) {
    throw new Error(`dossier.json is ${dossierBytes} bytes, over the 1.5 MiB cap`);
  }
  writeFileSync(join(outputDir, 'dossier.json'), dossierText);
  console.log(
    `Vice Cover Studio: copied ${appFiles} app files and ${shotFiles} screenshots, ` +
      `dossier.json is ${dossierBytes} bytes`,
  );
}

main();
