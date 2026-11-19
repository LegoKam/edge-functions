import assert from 'assert';
import { extractFormDefinition, needsBrowser, renderFormHtml } from '../src/forms/render.js';
import { getFormPath, renderPageForms } from '../src/forms/page.js';

const field = (name, fieldType, extra = {}) => ({
  id: `${name}-id`, name, fieldType, label: { value: `${name} label` }, ':type': `core/fd/components/form/${fieldType}/v1/${fieldType}`, ...extra,
});

const formDef = (items) => ({
  id: 'form-id',
  fieldType: 'form',
  ':itemsOrder': items.map((item) => item.name),
  ':items': Object.fromEntries(items.map((item) => [item.name, item])),
});

const publishedMarkup = (def) => `<div><div class="form"><div><div><pre><code>${
  JSON.stringify(JSON.stringify(def)).replace(/&/g, '&amp;').replace(/</g, '&lt;')
}</code></pre></div></div></div></div>`;

const simpleForm = formDef([
  field('fullName', 'text-input', { required: true }),
  field('email', 'email'),
  field('submit', 'button', { buttonType: 'submit' }),
]);

const page = (href) => `<main><div><div class="embed-adaptive-form"><div><div><a href="${href}">${href}</a></div></div></div></div></main>`;
const pageUrl = new URL('https://www.example.com/secure/apply');

describe('Adaptive form rendering at the edge', function () {
  describe('renderFormHtml', function () {
    it('should render the fields of a form definition to HTML', async function () {
      const html = await renderFormHtml(simpleForm);
      assert.match(html, /^<form[^>]*novalidate/);
      assert.match(html, /<label[^>]*>fullName label<\/label>/);
      assert.match(html, /<input[^>]*name="fullName"/);
      assert.match(html, /<input[^>]*type="email"/);
      assert.match(html, /<button[^>]*type="submit"/);
    });

    it('should stop the static form from submitting natively', async function () {
      assert.match(await renderFormHtml(simpleForm), /^<form[^>]*onsubmit="return false"/);
    });

    it('should not leave DOM globals behind', async function () {
      await renderFormHtml(simpleForm);
      assert.equal(typeof globalThis.document, 'undefined');
      assert.equal(typeof globalThis.window, 'undefined');
    });

    it('should leave forms with browser-only components to the browser', async function () {
      const wizard = formDef([field('steps', 'panel', { ':type': 'wizard' })]);
      const repeatable = formDef([field('people', 'panel', { repeatable: true })]);
      const nestedUpload = formDef([{
        ...field('group', 'panel'),
        ...formDef([field('upload', 'file-input')]),
        id: 'group-id',
        fieldType: 'panel',
      }]);
      assert.equal(needsBrowser(simpleForm), false);
      assert.equal(await renderFormHtml(wizard), null);
      assert.equal(await renderFormHtml(repeatable), null);
      assert.equal(await renderFormHtml(nestedUpload), null);
    });
  });

  describe('extractFormDefinition', function () {
    it('should read the definition from the published form markup', function () {
      assert.deepEqual(extractFormDefinition(publishedMarkup(simpleForm)), simpleForm);
    });

    it('should return null when the markup holds no definition', function () {
      assert.equal(extractFormDefinition('<div><p>No form here</p></div>'), null);
      assert.equal(extractFormDefinition('<div class="form"><pre><code>"not json</code></pre></div>'), null);
    });
  });

  describe('getFormPath', function () {
    it('should accept forms on this site only', function () {
      assert.equal(getFormPath('/content/forms/af/site/apply', pageUrl), '/content/forms/af/site/apply');
      assert.equal(getFormPath('/content/forms/af/site/apply.html', pageUrl), '/content/forms/af/site/apply');
      assert.equal(getFormPath('https://evil.example/content/forms/af/site/apply', pageUrl), null);
      assert.equal(getFormPath('/content/dam/secret', pageUrl), null);
      assert.equal(getFormPath('/content/forms/af/../../admin', pageUrl), null);
    });
  });

  describe('renderPageForms', function () {
    it('should replace the block link with the rendered form and its definition', async function () {
      const markup = publishedMarkup(simpleForm);
      const requested = [];
      const { html, forms } = await renderPageForms(page('/content/forms/af/site/apply'), pageUrl, async (path) => {
        requested.push(path);
        return markup;
      });
      assert.deepEqual(requested, ['/content/forms/af/site/apply']);
      assert.deepEqual(forms, [{ path: '/content/forms/af/site/apply', rendered: true }]);
      assert.ok(!html.includes('<a href='));
      assert.match(html, /<div class="embed-adaptive-form-inlined" data-form-path="\/content\/forms\/af\/site\/apply" data-rendered="true">/);
      assert.match(html, /<div class="embed-adaptive-form-rendered form-container"><div class="form-wrapper"><div class="form"><div><div><form/);
      assert.ok(html.includes(`<template class="embed-adaptive-form-source">${markup}</template>`));
    });

    it('should inline only the definition when the form needs a browser', async function () {
      const markup = publishedMarkup(formDef([field('steps', 'panel', { ':type': 'wizard' })]));
      const { html, forms } = await renderPageForms(page('/content/forms/af/site/apply'), pageUrl, async () => markup);
      assert.deepEqual(forms, [{ path: '/content/forms/af/site/apply', rendered: false }]);
      assert.ok(html.includes(`data-form-path="/content/forms/af/site/apply">${markup}</div>`));
      assert.ok(!html.includes('embed-adaptive-form-rendered'));
    });

    it('should leave the page untouched when the form cannot be loaded', async function () {
      const original = page('/content/forms/af/site/apply');
      assert.equal((await renderPageForms(original, pageUrl, async () => null)).html, original);
      assert.equal((await renderPageForms(original, pageUrl, async () => { throw new Error('offline'); })).html, original);
    });

    it('should not fetch links that are not forms on this site', async function () {
      const original = page('https://evil.example/content/forms/af/site/apply');
      let calls = 0;
      const { html } = await renderPageForms(original, pageUrl, async () => { calls += 1; return ''; });
      assert.equal(calls, 0);
      assert.equal(html, original);
    });

    it('should leave pages without the block untouched', async function () {
      const original = '<main><div><p>Hello</p><a href="/content/forms/af/site/apply">form</a></div></main>';
      assert.equal((await renderPageForms(original, pageUrl, async () => 'x')).html, original);
    });
  });
});
