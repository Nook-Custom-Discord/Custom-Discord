// Baut die Oberfläche (renderer/src) zu renderer/bundle.js
const esbuild = require('esbuild');
const watch = process.argv.includes('--watch');
const opts = {
  entryPoints: ['renderer/src/app.jsx'],
  bundle: true,
  outfile: 'renderer/bundle.js',
  format: 'iife',
  target: ['chrome120'],
  jsx: 'automatic',
  jsxImportSource: 'preact',
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  logLevel: 'info',
  loader: { '.js': 'jsx' },
};
if (watch) esbuild.context(opts).then((c) => c.watch());
else esbuild.build(opts).catch(() => process.exit(1));
