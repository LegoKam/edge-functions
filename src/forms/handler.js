/// <reference types="@fastly/js-compute" />
/*
 * Serves SecurGov pages from the Edge Delivery origin with their adaptive
 * forms rendered into the HTML. Anything that is not an HTML page (and any
 * page without an embedded form) is passed through unchanged.
 */
import { ConfigStore } from 'fastly:config-store';
import { renderPageForms } from './page.js';

const DEFAULT_ORIGIN_HOSTNAME = 'main--securgov--kradhakrish.aem.live';
// page paths the CDN routes here (see config/cdn.yaml)
const FORM_PAGE_PREFIXES = ['/secure/'];
// cache tags that must also cover the embedded form, so publishing it purges the page
const CACHE_TAG_HEADERS = ['surrogate-key', 'cache-tag', 'edge-cache-tag'];

export const isFormPage = (pathname) => FORM_PAGE_PREFIXES
  .some((prefix) => pathname.startsWith(prefix));

function getOriginHostname() {
  try {
    return new ConfigStore('config_default').get('EDS_ORIGIN_HOSTNAME') || DEFAULT_ORIGIN_HOSTNAME;
  } catch (e) {
    // no config store (local run or sandbox program)
    return DEFAULT_ORIGIN_HOSTNAME;
  }
}

function originRequest(req, pathAndSearch, originHostname) {
  const headers = new Headers(req.headers);
  // the HTML is rewritten here, so ask for an uncompressed, unconditional response
  ['accept-encoding', 'if-none-match', 'if-modified-since', 'host'].forEach((name) => headers.delete(name));
  headers.set('x-forwarded-host', new URL(req.url).host);
  return new Request(`https://${originHostname}${pathAndSearch}`, { method: 'GET', headers });
}

export async function formPageHandler(req) {
  const url = new URL(req.url);
  const originHostname = getOriginHostname();
  const response = await fetch(originRequest(req, `${url.pathname}${url.search}`, originHostname));

  const isHtmlPage = response.status === 200
    && !url.pathname.endsWith('.plain.html')
    && response.headers.get('content-type')?.includes('text/html');
  if (!isHtmlPage) return response;

  const cacheTags = {};
  const loadFormMarkup = async (formPath) => {
    const formResponse = await fetch(originRequest(req, `${formPath}.plain.html`, originHostname));
    if (!formResponse.ok || !formResponse.headers.get('content-type')?.includes('text/html')) {
      return null;
    }
    CACHE_TAG_HEADERS.forEach((name) => {
      const value = formResponse.headers.get(name);
      if (value) cacheTags[name] = [...(cacheTags[name] || []), value];
    });
    return formResponse.text();
  };

  const { html, forms } = await renderPageForms(await response.text(), url, loadFormMarkup);

  const headers = new Headers(response.headers);
  // the body no longer matches what the origin described
  ['etag', 'last-modified', 'content-length', 'content-encoding'].forEach((name) => headers.delete(name));
  Object.entries(cacheTags).forEach(([name, values]) => {
    const separator = name === 'surrogate-key' ? ' ' : ',';
    headers.set(name, [headers.get(name), ...values].filter(Boolean).join(separator));
  });
  headers.set('x-edge-forms', forms.length
    ? forms.map(({ rendered }) => (rendered ? 'rendered' : 'inlined')).join(',')
    : 'none');
  return new Response(html, { status: response.status, headers });
}
