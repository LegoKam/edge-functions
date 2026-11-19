/*
 * Builds the edge function: bundles src/index.js together with the form
 * renderer taken from the SecurGov site checkout (see scripts/securgov.mjs),
 * then compiles the bundle to bin/main.wasm.
 */
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';
import { assertSecurgovRepo, resolveSecurgov, securgovRepo } from './securgov.mjs';

const BUNDLE = 'build/index.js';
const COMPILER = 'node_modules/@fastly/js-compute/dist/cli/js-compute-runtime-cli.js';

assertSecurgovRepo();

await build({
  entryPoints: ['src/index.js'],
  outfile: BUNDLE,
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  conditions: ['worker', 'import', 'default'],
  external: ['fastly:*'],
  logLevel: 'warning',
  plugins: [{
    name: 'securgov',
    setup({ onResolve }) {
      onResolve({ filter: /^(securgov\/|\.)/ }, ({ path, importer }) => {
        const resolved = resolveSecurgov(path, importer);
        return resolved ? { path: resolved } : null;
      });
    },
  }],
});
console.log(`Bundled with the form renderer from ${securgovRepo}`);

const { status } = spawnSync(process.execPath, [COMPILER, BUNDLE, './bin/main.wasm'], {
  stdio: 'inherit',
});
process.exit(status ?? 1);
