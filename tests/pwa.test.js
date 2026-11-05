const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { buildPWA } = require('../scripts/build-pwa.cjs');
const root = path.resolve(__dirname, '..');
function worker(scope = 'https://example.com/game/', failing = false) {
    const handlers = {}, buckets = new Map(), deleted = [], network = [], old = `trading-pwa:${encodeURIComponent(scope)}:old`, unrelated = 'other-app-cache';
    buckets.set(old, new Map()); buckets.set(unrelated, new Map());
    const self = { registration: { scope }, clients: { claim: async () => {} }, skipWaiting: async () => { self.skipped = true; }, addEventListener: (type, handler) => { handlers[type] = handler; } };
    const caches = { open: async name => {
        if (!buckets.has(name)) buckets.set(name, new Map()); const cache = buckets.get(name);
        return { addAll: async requests => { if (failing) throw Error('network failed'); requests.forEach(r => cache.set(r.url, { source: r.url })); }, match: async request => cache.get(typeof request === 'string' ? request : request.url) };
    }, keys: async () => [...buckets.keys()], delete: async name => { deleted.push(name); return buckets.delete(name); } };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'sw.js'), 'utf8'), { self, caches, URL, Request, fetch: async req => { network.push(req.url); return { network: true }; } });
    const lifecycle = async type => { let promise; handlers[type]({ waitUntil: p => { promise = p; } }); await promise; };
    const request = async (url, mode = 'cors') => { let promise; handlers.fetch({ request: { url, mode, method: 'GET' }, respondWith: p => { promise = p; } }); return promise ? await promise : null; };
    return { self, handlers, buckets, deleted, network, old, unrelated, lifecycle, request };
}
test('release is reproducible and version is sourced from package.json', () => {
    const a = buildPWA(), b = buildPWA(); assert.deepEqual(a.release, b.release); assert.equal(a.release.version, '1.0.0');
    for (const file of a.assets) assert.ok(fs.existsSync(path.join(root, file)), file);
});
test('a content change invalidates the release even without a version bump', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trading-build-'));
    try {
        for (const file of [...buildPWA().assets, 'package.json', 'scripts/sw-template.js']) { fs.mkdirSync(path.dirname(path.join(tmp, file)), { recursive: true }); fs.copyFileSync(path.join(root, file), path.join(tmp, file)); }
        const first = buildPWA(tmp); fs.appendFileSync(path.join(tmp, 'styles.css'), '\n/* changed */'); const next = buildPWA(tmp);
        assert.equal(first.release.version, next.release.version); assert.notEqual(first.release.build, next.release.build);
    } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
test('worker caches app shell in subdirectory and waits for explicit activation', async () => {
    const w = worker(); await w.lifecycle('install'); assert.equal(w.self.skipped, undefined);
    const home = await w.request('https://example.com/game/?source=pwa', 'navigate'); assert.equal(home.source, 'https://example.com/game/index.html');
    assert.equal((await w.request('https://example.com/game/game.js')).source, 'https://example.com/game/game.js');
    assert.equal(await w.request('https://example.com/game/sw.js'), null); assert.equal(await w.request('https://finance.sina.com.cn/stock.js'), null);
    assert.equal(await w.request('https://example.com/another-app/', 'navigate'), null);
});
test('failed install discards incomplete release and retains last working cache', async () => {
    const w = worker(undefined, true); await assert.rejects(w.lifecycle('install'), /failed/); assert.equal(w.buckets.has(w.old), true); assert.equal(w.buckets.has(w.unrelated), true); assert.equal(w.buckets.size, 2);
});
test('activation removes only this app scope old caches', async () => {
    const w = worker(); await w.lifecycle('install'); await w.lifecycle('activate'); assert.equal(w.buckets.has(w.old), false); assert.equal(w.buckets.has(w.unrelated), true); assert.equal(w.buckets.size, 2);
});
test('worker answers version requests and skips waiting only on explicit message', async () => {
    const w = worker(); let reply, task; w.handlers.message({ data: { type: 'GET_RELEASE' }, ports: [{ postMessage: value => { reply = value; } }] }); assert.equal(reply.version, '1.0.0');
    w.handlers.message({ data: { type: 'SKIP_WAITING' }, waitUntil: p => { task = p; } }); await task; assert.equal(w.self.skipped, true);
});
test('manifest is installable under root or a GitHub Pages project path', () => {
    const m = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'))); assert.equal(m.display, 'standalone'); assert.equal(m.start_url, './'); assert.equal(m.scope, './');
    assert.ok(m.icons.some(i => i.sizes === '192x192' && i.purpose === 'any')); assert.ok(m.icons.some(i => i.sizes === '512x512' && i.purpose === 'maskable'));
    for (const icon of m.icons) { const png = fs.readFileSync(path.join(root, icon.src)); const [width, height] = icon.sizes.split('x').map(Number); assert.equal(png.readUInt32BE(16), width); assert.equal(png.readUInt32BE(20), height); }
});
test('install metadata includes the standards-based web app capability', () => {
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.match(html, /<meta name="mobile-web-app-capable" content="yes">/);
    assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/);
});
