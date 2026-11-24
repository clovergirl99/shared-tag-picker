import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { setImmediate as tick } from 'node:timers/promises';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';

const frontend = readFileSync(new URL('../frontend.js', import.meta.url), 'utf8');
const summary = (id, extra = {}) => ({ id, name: 'Alex', tags: [], ...extra });
function card({ id, src = '', name = 'Alex', row = false } = {}) {
  return `<div class="${row ? '_row_test' : '_card_test'}"><div class="${row ? '_avatar_test' : '_imageWrap_test'}"><img src="${src}" alt="${name}"></div>${id ? `<span data-spindle-mount="character_browser_card_actions" data-spindle-scope="character-card:${id}:actions"></span>` : ''}<div class="_info_test"><span class="_name_test">${name}</span></div></div>`;
}
function deferred() {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
}
async function settle() { await tick(); await tick(); }
async function harness(characters, html, detail = id => ({ ...characters.find(item => item.id === id), creator_notes: `Notes ${id}` })) {
  const { document, window } = parseHTML(`<html><body><div class="_browser_test">${html}</div></body></html>`);
  Object.defineProperty(document, 'baseURI', { value: 'http://lumiverse.test/' });
  const events = new Map(), requests = [];
  let observer;
  const context = {
    document, window, console, URL, queueMicrotask,
    Node: window.Node, HTMLElement: window.HTMLElement,
    HTMLDivElement: window.HTMLDivElement, HTMLInputElement: window.HTMLInputElement,
    localStorage: { getItem: () => null, setItem() {} },
    MutationObserver: class { constructor(callback) { observer = callback; } observe() {} disconnect() {} },
    fetch: async path => {
      requests.push(path);
      let body;
      if (path === '/api/v1/characters/tags') body = [];
      else if (path.startsWith('/api/v1/characters?')) body = { data: characters, total: characters.length };
      else if (path.startsWith('/api/v1/characters/')) body = await detail(decodeURIComponent(path.split('/').at(-1)));
      else throw Error(`Unexpected request: ${path}`);
      return { ok: true, json: async () => body };
    },
    ctx: {
      dom: {
        addStyle: () => () => {},
        inject(target, html) { const wrapper = document.createElement('div'); wrapper.dataset.spindleExt = 'shared_tag_picker'; wrapper.innerHTML = html; target.append(wrapper); return wrapper; },
        uninject: wrapper => wrapper.remove(),
      },
      events: { on(type, fn) { events.set(type, fn); return () => events.delete(type); } },
    },
  };
  const source = frontend.replace(/export\s*\{\s*setup\s*\};?\s*$/, '');
  const destroy = runInNewContext(source + '\nsetup(ctx);', context);
  await settle();
  return {
    document, requests, destroy,
    notes: () => [...document.querySelectorAll('.stp-card-notes')].map(item => item.textContent),
    changed: async () => { observer(); await settle(); },
    edited: async () => { events.get('CHARACTER_EDITED')(); await settle(); },
  };
}

test('same-name cards load separate creator notes by character ID', async () => {
  const h = await harness([summary('a'), summary('b')], card({ id: 'a' }) + card({ id: 'b' }));
  assert.deepEqual(h.notes(), ['Notes a', 'Notes b']);
  assert.ok(h.requests.includes('/api/v1/characters/a'));
  assert.ok(h.requests.includes('/api/v1/characters/b'));
  h.destroy();
});

test('list rows with duplicate names resolve unique original and cropped image IDs', async () => {
  const h = await harness([
    summary('a', { image_id: 'original-a' }),
    summary('b', { image_id: 'original-b', extensions: { avatar_crop_image_id: 'crop-b' } }),
  ], card({ row: true, src: '/api/v1/images/original-a?size=sm' }) + card({ row: true, src: '/api/v1/images/crop-b?size=sm' }));
  assert.deepEqual(h.notes(), ['Notes a', 'Notes b']);
  h.destroy();
});

test('legacy character avatar URLs and explicit data-character-id identify duplicates', async () => {
  const h = await harness([summary('a'), summary('b')], card({ row: true, src: '/api/v1/characters/a/avatar?size=sm' }) + card().replace('class="_card_test"', 'class="_card_test" data-character-id="b"'));
  assert.deepEqual(h.notes(), ['Notes a', 'Notes b']);
  h.destroy();
});

test('ambiguous names and shared images never guess another card\'s notes', async () => {
  const h = await harness([summary('a', { image_id: 'shared' }), summary('b', { image_id: 'shared' })], card({ src: '/api/v1/images/shared' }) + card({ src: '/missing.png' }));
  assert.deepEqual(h.notes(), []);
  h.destroy();
});

test('an unknown explicit ID cannot fall back to a unique matching name', async () => {
  const h = await harness([summary('a')], card({ id: 'unknown' }) + card({ src: '/api/v1/characters/unknown/avatar' }));
  assert.deepEqual(h.notes(), []);
  h.destroy();
});

test('a unique legacy name still displays notes when no ID is exposed', async () => {
  const h = await harness([summary('a')], card());
  assert.deepEqual(h.notes(), ['Notes a']);
  h.destroy();
});

test('reused card elements replace old notes and ignore late results for the previous character', async () => {
  const pending = deferred();
  const h = await harness([summary('a'), summary('b')], card({ id: 'a' }), id => id === 'a' ? pending.promise : { id, creator_notes: 'Correct B notes' });
  h.document.querySelector('[data-spindle-scope]').dataset.spindleScope = 'character-card:b:actions';
  await h.changed();
  assert.deepEqual(h.notes(), ['Correct B notes']);
  pending.resolve({ id: 'a', creator_notes: 'Late A notes' }); await settle();
  assert.deepEqual(h.notes(), ['Correct B notes']);
  assert.equal(h.document.querySelectorAll('.stp-card-extra').length, 1);
  h.destroy();
});

test('a refresh prevents an old detail response from replacing newer creator notes', async () => {
  const old = deferred(); let calls = 0;
  const h = await harness([summary('a')], card({ id: 'a' }), () => ++calls === 1 ? old.promise : { id: 'a', creator_notes: 'Updated notes' });
  await h.edited();
  assert.deepEqual(h.notes(), ['Updated notes']);
  old.resolve({ id: 'a', creator_notes: 'Stale notes' }); await settle();
  assert.deepEqual(h.notes(), ['Updated notes']);
  h.destroy();
});

test('a detail response for a different ID never appears on the requested card', async () => {
  const h = await harness([summary('a')], card({ id: 'a' }), () => ({ id: 'b', creator_notes: 'Wrong card notes' }));
  assert.deepEqual(h.notes(), ['Creator notes unavailable']);
  h.destroy();
});

test('list previews strip HTML and Markdown without modifying saved creator notes', async () => {
  const original = '# Creator notes\n\n<b>Bold</b> and **strong**, *emphasis*, __bold__, _italic_, ~~old~~ and `code`.\n\n[Read more](https://example.com)\n\n<div>First line<br>Second &amp; third</div>';
  const record = summary('a', { creator_notes: original });
  const before = structuredClone(record);
  const pending = deferred();
  const h = await harness([record], card({ id: 'a' }), () => pending.promise);
  const expected = 'Creator notes\n\nBold and strong, emphasis, bold, italic, old and code.\n\nRead more\n\nFirst line\nSecond & third';
  assert.deepEqual(h.notes(), [expected], 'summary preview is plain text');
  pending.resolve({ ...record }); await settle();
  assert.deepEqual(h.notes(), [expected], 'fetched detail is plain text too');
  assert.deepEqual(record, before, 'stored notes are untouched');
  assert.equal(h.document.querySelector('.stp-card-notes').querySelector('b, a'), null);
  h.destroy();
});

for (const [name, raw, expected] of [
  ['HTML blocks and entities', '<p>Hello&nbsp;<b>world</b></p><p>Next &lt; 3</p>', 'Hello world\n\nNext < 3'],
  ['escaped HTML', '&lt;b&gt;Hello&lt;/b&gt; &amp; welcome', 'Hello & welcome'],
  ['hidden HTML content', 'Hi<script>doNotRun()</script><style>.x{color:red}</style><!-- hidden --> there', 'Hi there'],
  ['images and links', '![Portrait](https://example.com/a.png) [Website](https://example.com/path_(detail))', 'Portrait Website'],
  ['reference links', '[Website][site]\n\n[site]: https://example.com', 'Website'],
  ['lists and quotes', '> Quote\n- One\n- [x] Two\n1. Three', 'Quote\nOne\nTwo\nThree'],
  ['fenced code', '```html\n<b>Hello</b>\n```', 'Hello'],
  ['ordinary underscores and autolinks', 'snake_case and https://example.com/my_file <https://example.com>', 'snake_case and https://example.com/my_file https://example.com'],
  ['escaped punctuation', '\\*literal\\* and **bold**', '*literal* and bold'],
  ['formatting-only notes', '<b></b>\n---\n<style>hidden</style>', 'No creator notes'],
]) {
  test(`creator-note plain text: ${name}`, async () => {
    const h = await harness([summary('a')], card({ id: 'a' }), () => ({ id: 'a', creator_notes: raw }));
    assert.deepEqual(h.notes(), [expected]);
    h.destroy();
  });
}
