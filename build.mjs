// Builds the app (the web page everyone uses, hosts included) and/or the connector (the Firefox extension).
//   node build.mjs              both
//   node build.mjs app          the app only (add --serve for a local dev server)
//   node build.mjs connector    the connector only
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

if (want('app')) {
  rmSync('app/dist', { recursive: true, force: true });
  mkdirSync('app/dist', { recursive: true });
  for (const f of ['index.html', 'style.css', 'games.css', 'trivia.css', 'clues.css', 'panel.css', 'host.css']) cpSync(`app/${f}`, `app/dist/${f}`);
  for (const f of ['grid.css', 'anagram.css', 'replay.css']) cpSync(`shared/${f}`, `app/dist/${f}`);
  const options = { ...common, entryPoints: ['app/src/main.tsx'], outfile: 'app/dist/main.js', target: 'es2020' };
  if (serve) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    const { port } = await ctx.serve({ servedir: 'app/dist', port: 8000 });
    console.log(`App: http://localhost:${port}/ (#host to host)`);
  } else {
    await esbuild.build(options);
  }
}

if (want('connector')) {
  rmSync('connector/dist', { recursive: true, force: true });
  mkdirSync('connector/dist', { recursive: true });
  for (const f of ['manifest.json', 'icon.svg']) cpSync(`connector/${f}`, `connector/dist/${f}`);
  await esbuild.build({
    ...common,
    entryPoints: {
      background: 'connector/src/background.ts',
      bridge: 'connector/src/bridge.ts',
      'content-crosshare': 'connector/src/content/crosshare.ts',
      'content-puzzleme': 'connector/src/content/puzzleme.ts',
    },
    outdir: 'connector/dist',
  });
}
