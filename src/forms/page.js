/*
 * Server-side rendering of the SecurGov `embed-adaptive-form` block.
 *
 * The page published by Edge Delivery only links to the adaptive form. For each
 * block this replaces the link with the form rendered to HTML, plus the form's
 * published markup (which carries the definition) so the browser can swap in
 * the live, rule-driven form. The site's blocks/embed-adaptive-form block
 * understands this markup; a link that cannot be resolved is left untouched and
 * the block then loads the form itself.
 */
import { extractFormDefinition, renderFormHtml } from './render.js';

const BLOCK_START = /<div class="embed-adaptive-form(?:\s[^"]*)?">/g;
const BLOCK_LINK = /<a\s[^>]*href="([^"]+)"[^>]*>[\s\S]*?<\/a>/;
// the authored link sits right inside the block's first cell
const LINK_SEARCH_WINDOW = 1000;
// only forms published from the AEM Forms content tree may be embedded
const FORM_PATH_PATTERN = /^\/content\/forms\/af\/[\w\-/]+$/;

const escapeAttribute = (value) => value
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;');

/**
 * Returns the site-relative form path for a block link, or null when the link
 * does not point at a form on this site.
 * @param {string} href the authored link
 * @param {URL} pageUrl the URL of the page being rendered
 * @returns {string|null} the form path
 */
export function getFormPath(href, pageUrl) {
  let target;
  try {
    target = new URL(href.replace(/&amp;/g, '&'), pageUrl);
  } catch (e) {
    return null;
  }
  if (target.host !== pageUrl.host) return null;
  const path = target.pathname.replace(/(\.plain)?\.html$/, '');
  return FORM_PATH_PATTERN.test(path) ? path : null;
}

/**
 * Builds the markup that replaces the block's link.
 * @param {string} formPath the site-relative form path
 * @param {string} markup the form's published .plain.html
 * @returns {Promise<{html: string, rendered: boolean}>} the replacement
 */
export async function buildEmbed(formPath, markup) {
  let formHtml = null;
  try {
    formHtml = await renderFormHtml(extractFormDefinition(markup));
  } catch (e) {
    console.log(`Unable to render form ${formPath} at the edge: ${e.message}`);
  }
  const path = escapeAttribute(formPath);
  if (!formHtml) {
    // definition only: the browser renders the form, but needs no extra request
    return {
      html: `<div class="embed-adaptive-form-inlined" data-form-path="${path}">${markup}</div>`,
      rendered: false,
    };
  }
  return {
    html: `<div class="embed-adaptive-form-inlined" data-form-path="${path}" data-rendered="true">`
      // same wrappers the site puts around a form block, so the site's form styles apply
      + '<div class="embed-adaptive-form-rendered form-container"><div class="form-wrapper"><div class="form"><div><div>'
      + `${formHtml}</div></div></div></div></div>`
      + `<template class="embed-adaptive-form-source">${markup}</template>`
      + '</div>',
    rendered: true,
  };
}

/**
 * Renders every embed-adaptive-form block in a page.
 * @param {string} html the page HTML from the origin
 * @param {URL} pageUrl the URL of the page
 * @param {(formPath: string) => Promise<string|null>} loadFormMarkup returns the
 *   form's published .plain.html, or null when it is unavailable
 * @returns {Promise<{html: string, forms: Array<{path: string, rendered: boolean}>}>}
 */
export async function renderPageForms(html, pageUrl, loadFormMarkup) {
  const links = [];
  for (const block of html.matchAll(BLOCK_START)) {
    const from = block.index + block[0].length;
    const link = BLOCK_LINK.exec(html.slice(from, from + LINK_SEARCH_WINDOW));
    const formPath = link && getFormPath(link[1], pageUrl);
    if (formPath) {
      links.push({ start: from + link.index, end: from + link.index + link[0].length, formPath });
    }
  }

  const embeds = await Promise.all(links.map(async ({ formPath }) => {
    try {
      const markup = (await loadFormMarkup(formPath))?.trim();
      return markup ? await buildEmbed(formPath, markup) : null;
    } catch (e) {
      console.log(`Unable to load form ${formPath}: ${e.message}`);
      return null;
    }
  }));

  let result = '';
  let cursor = 0;
  const forms = [];
  links.forEach(({ start, end, formPath }, index) => {
    const embed = embeds[index];
    if (!embed) return;
    result += html.slice(cursor, start) + embed.html;
    cursor = end;
    forms.push({ path: formPath, rendered: embed.rendered });
  });
  return { html: result + html.slice(cursor), forms };
}
