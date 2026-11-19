/*
 * Resolves imports of the SecurGov site code.
 *
 * The edge function renders adaptive forms with the site's own form renderer.
 * That code is never copied into this repository: `securgov/<path>` imports are
 * resolved straight from a checkout of the site repo, by the build
 * (scripts/build.mjs) and by the tests (test/support/securgov-hooks.mjs).
 *
 * The checkout is taken from the SECURGOV_REPO environment variable, or the
 * sibling directory ../../securgov by default.
 */
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const SECURGOV_PREFIX = 'securgov/';
export const securgovRepo = resolve(root, process.env.SECURGOV_REPO || '../../securgov');

// Site modules that only work in a browser, and the edge stand-in for each.
const STUBS = {
  'scripts/aem.js': 'aem.js',
  'blocks/form/mappings.js': 'mappings.js',
  'blocks/form/submit.js': 'submit.js',
  'blocks/form/integrations/recaptcha.js': 'recaptcha.js',
  'blocks/form/rules-doc/index.js': 'rules-doc.js',
  'blocks/form/rules/index.js': 'rules.js',
  'blocks/form/components/repeat/repeat.js': 'repeat.js',
};
const stubs = new Map(Object.entries(STUBS).map(([sitePath, stub]) => [
  resolve(securgovRepo, sitePath),
  resolve(root, 'src/forms/stubs', stub),
]));

export function assertSecurgovRepo() {
  if (!existsSync(resolve(securgovRepo, 'blocks/form/form.js'))) {
    throw new Error(`SecurGov site checkout not found at ${securgovRepo}. `
      + 'Clone it next to this repository or set SECURGOV_REPO to its path.');
  }
}

/**
 * Maps an import to a file of the site checkout or to its edge stand-in.
 * @param {string} specifier the import specifier
 * @param {string} [importerPath] absolute path of the importing file
 * @returns {string|null} the absolute path to load, or null to resolve normally
 */
export function resolveSecurgov(specifier, importerPath) {
  let path;
  if (specifier.startsWith(SECURGOV_PREFIX)) {
    path = resolve(securgovRepo, specifier.slice(SECURGOV_PREFIX.length));
  } else if (specifier.startsWith('.') && importerPath?.startsWith(`${securgovRepo}/`)) {
    path = resolve(dirname(importerPath), specifier);
  } else {
    return null;
  }
  return stubs.get(path) || path;
}
