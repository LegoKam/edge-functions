/*
 * Renders an adaptive form definition to HTML at the edge, using the same
 * renderer the SecurGov site runs in the browser, on top of a lightweight DOM.
 * The renderer is imported from the site checkout at build time and is not
 * copied into this repository (see scripts/securgov.mjs); its browser-only
 * dependencies are replaced by the stand-ins in ./stubs.
 */
import './intl-shim.js';
import { parseHTML } from 'linkedom/worker';
import { generateFormRendition } from 'securgov/blocks/form/form.js';
import { resetIds } from 'securgov/blocks/form/util.js';

// components that are decorated by browser-only code (blocks/form/mappings.js)
const BROWSER_COMPONENTS = [
  'accordion', 'file', 'modal', 'password', 'rating', 'repeat', 'tnc', 'toggleable-link', 'wizard', 'range',
];
const BROWSER_FIELD_TYPES = ['captcha', 'file-input', 'image'];

const getItems = (container) => (container?.[':itemsOrder'] && container[':items']
  ? container[':itemsOrder'].map((key) => container[':items'][key])
  : []);

/**
 * Whether the form uses anything that only works in a browser. Such forms are
 * left for the browser to render, so visitors never see a half-decorated form.
 * @param {object} formDef the adaptive form definition
 * @returns {boolean} true when the form must not be rendered at the edge
 */
export function needsBrowser(formDef) {
  return getItems(formDef).some((item) => {
    const type = item?.[':type'] || '';
    return BROWSER_FIELD_TYPES.includes(item?.fieldType)
      || BROWSER_COMPONENTS.includes(type)
      || type.endsWith('wizard')
      || item?.repeatable === true
      || needsBrowser(item);
  });
}

/**
 * Reads the form definition out of the form's published markup, where it is
 * stored as a JSON string inside <pre><code>.
 * @param {string} markup the form's .plain.html
 * @returns {object|null} the form definition, or null when there is none
 */
export function extractFormDefinition(markup) {
  const { document } = parseHTML(`<!doctype html><html><body>${markup}</body></html>`);
  const content = document.querySelector('.form pre code')?.textContent?.trim();
  if (!content || !content.startsWith('"') || !content.endsWith('"')) return null;
  try {
    const formDef = JSON.parse(JSON.parse(content));
    return formDef?.fieldType === 'form' || formDef?.[':items'] ? formDef : null;
  } catch (e) {
    return null;
  }
}

/**
 * Renders the form definition to the markup the form block produces in the
 * browser. The result is static: the browser replaces it with the live,
 * rule-driven form once that is ready.
 * @param {object} formDef the adaptive form definition
 * @returns {Promise<string|null>} the form HTML, or null when it cannot be rendered here
 */
export async function renderFormHtml(formDef) {
  if (!formDef || needsBrowser(formDef)) return null;

  const { document, window } = parseHTML('<!doctype html><html><body></body></html>');
  const previous = { document: globalThis.document, window: globalThis.window };
  // the renderer reads these as globals, exactly as it does in the browser
  globalThis.document = document;
  globalThis.window = window;
  window.hlx = { codeBasePath: '' };
  try {
    resetIds();
    const form = document.createElement('form');
    form.setAttribute('novalidate', '');
    // the static form must never submit natively (that would put answers in the URL)
    form.setAttribute('onsubmit', 'return false');
    if (formDef.appliedCssClassNames) form.className = formDef.appliedCssClassNames;
    form.dataset.source = 'aem';
    form.dataset.rules = 'true';
    form.dataset.id = formDef.id || '';
    await generateFormRendition(formDef, form, formDef.id, getItems);
    return form.outerHTML;
  } finally {
    globalThis.document = previous.document;
    globalThis.window = previous.window;
  }
}
