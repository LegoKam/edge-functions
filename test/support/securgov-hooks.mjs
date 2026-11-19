/*
 * Node module hooks for the tests: resolve `securgov/...` imports from the site
 * checkout exactly as the build does (see scripts/securgov.mjs).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolveSecurgov } from '../../scripts/securgov.mjs';

// eslint-disable-next-line import/prefer-default-export
export async function resolve(specifier, context, nextResolve) {
  const importer = context.parentURL?.startsWith('file:') ? fileURLToPath(context.parentURL) : undefined;
  const resolved = resolveSecurgov(specifier, importer);
  return resolved
    ? { url: pathToFileURL(resolved).href, format: 'module', shortCircuit: true }
    : nextResolve(specifier, context);
}
