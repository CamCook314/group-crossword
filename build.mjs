// Builds the guest page and/or the Firefox extension.
//   node build.mjs              both
//   node build.mjs guest        guest page only (add --serve for a local dev server)
//   node build.mjs extension    extension only
import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const targets = process.argv.slice(2).filter(a => !a.startsWith('--'));
const serve = process.argv.includes('--serve');
const want = t => targets.length === 0 || targets.includes(t);

const common = {
  bundle: true,
  format: 'iife',
  target: 'firefox115',
  jsx: 'automatic',
  jsxImportSource: 'preact',
  logLevel: 'info',
};

if (want('guest')) {
  rmSync('guest/dist', { recursive: true, force: true });
  mkdirSync('guest/dist', { recursive: true });
  cpSync('guest/index.html', 'guest/dist/index.html');
  cpSync('guest/style.css', 'guest/dist/style.css');
  cpSync('shared/grid.css', 'guest/dist/grid.css');
  const options = { ...common, entryPoints: ['guest/src/main.tsx'], outfile: 'guest/dist/main.js', target: 'es2020' };
  if (serve) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    const { port } = await ctx.serve({ servedir: 'guest/dist', port: 8000 });
    console.log(`Guest page: http://localhost:${port}/#<room id>`);
  } else {
    await esbuild.build(options);
  }
}

if (want('extension')) {
  rmSync('extension/dist', { recursive: true, force: true });
  mkdirSync('extension/dist', { recursive: true });
  for (const f of ['manifest.json', 'sidebar.html', 'sidebar.css', 'icon.svg']) cpSync(`extension/${f}`, `extension/dist/${f}`);
  cpSync('shared/grid.css', 'extension/dist/grid.css');
  await esbuild.build({
    ...common,
    entryPoints: {
      background: 'extension/src/background.ts',
      sidebar: 'extension/src/sidebar.tsx',
      'content-crosshare': 'extension/src/content/crosshare.ts',
      'content-puzzleme': 'extension/src/content/puzzleme.ts',
    },
    outdir: 'extension/dist',
  });
}
