import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { get } from 'node:http';
import { createApp } from '../scripts/serve.mjs';
import { validateSite, validateLinkIcon, MAX_SITE_BYTES, MAX_ICON_BYTES } from '../dist/assets/site-model.js';
import { translate, getLanguage, arabic } from '../dist/assets/language.js';

const original = JSON.parse(await readFile(new URL('../dist/data/site.json', import.meta.url), 'utf8'));
async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'alaskariannet-test-'));
  const dataFile = path.join(directory, 'site.json');
  await writeFile(dataFile, JSON.stringify(original));
  const server = createApp({ dataFile, ...options });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await unlink(dataFile);
    await rmdir(directory);
  });
  const request = (route, data, extra = {}) => fetch(`${origin}${route}`, {
    ...(data === undefined ? {} : { method: 'PUT', body: JSON.stringify(data) }), ...extra,
    headers: { 'Content-Type': 'application/json', 'X-Admin-Request': '1', Origin: origin, ...extra.headers },
  });
  return { request, dataFile, origin };
}

test('admin and public assets load with executable JavaScript and safe headers', async t => {
  const { request, origin } = await fixture(t);
  for (const route of ['/', '/admin/', '/admin/admin.css', '/assets/site-model.js', '/assets/public.js']) {
    const result = await request(route);
    assert.equal(result.status, 200, route);
    assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
    if (route.endsWith('.js')) assert.match(result.headers.get('content-type'), /javascript/);
  }
  const redirect = await request('/admin', undefined, { redirect: 'manual' });
  assert.equal(redirect.headers.get('location'), '/admin/');
  const session = await request('/api/session');
  assert.deepEqual(await session.json(), { authenticated: true, protected: false });
  assert.equal((await request('/.git/config')).status, 403);
  assert.equal((await request('/data/site.json.tmp')).status, 403);
  assert.equal((await request('/%E0%A4%A')).status, 400);
  const foreignHostStatus = await new Promise((resolve, reject) => {
    get(`${origin}/api/session`, { headers: { Host: 'untrusted.example' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
  assert.equal(foreignHostStatus, 403);
});

test('publishing persists profile, appearance, visibility, and order; stale saves cannot overwrite it', async t => {
  const { request, dataFile } = await fixture(t);
  const draft = structuredClone(original);
  draft.profile.name = 'اختبار العتبة';
  draft.links.reverse(); draft.links[0].visible = false;
  draft.appearance = { background: 'solid', color: '#225544', buttonStyle: 'pill', animation: false };
  const saved = await request('/api/site', { site: draft, baseUpdatedAt: original.updatedAt });
  assert.equal(saved.status, 200);
  const result = await saved.json();
  assert.ok(result.updatedAt);
  assert.deepEqual(JSON.parse(await readFile(dataFile, 'utf8')), result);
  assert.deepEqual(await (await request('/data/site.json')).json(), result);
  assert.equal(result.profile.name, draft.profile.name);
  assert.equal(result.links[0].id, draft.links[0].id);
  assert.equal(result.links[0].visible, false);
  assert.deepEqual(result.appearance, draft.appearance);
  const conflict = await request('/api/site', { site: original, baseUpdatedAt: original.updatedAt });
  assert.equal(conflict.status, 409);
  assert.deepEqual(JSON.parse(await readFile(dataFile, 'utf8')), result);
});

test('invalid links and cross-origin requests cannot change public content', async t => {
  const { request, dataFile } = await fixture(t);
  const invalid = structuredClone(original); invalid.links[0].url = 'javascript:alert(1)';
  assert.equal((await request('/api/site', { site: invalid, baseUpdatedAt: original.updatedAt })).status, 400);
  assert.equal((await request('/api/site', { site: original, baseUpdatedAt: original.updatedAt }, { headers: { Origin: 'https://other.example' } })).status, 403);
  assert.equal((await request('/api/site', { site: original, baseUpdatedAt: original.updatedAt }, { headers: { 'X-Admin-Request': '' } })).status, 403);
  assert.equal((await request('/api/site', undefined, { method: 'PUT', body: '{invalid' })).status, 400);
  assert.equal((await request('/api/site', undefined, { method: 'PUT', body: JSON.stringify({ padding: 'x'.repeat(MAX_SITE_BYTES) }) })).status, 413);
  assert.deepEqual(JSON.parse(await readFile(dataFile, 'utf8')), original);
});

const iconPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aPaoAAAAASUVORK5CYII=';
test('uploaded icons survive publishing and backup validation, including pages above the old payload limit', async t => {
  const { request } = await fixture(t);
  const draft = structuredClone(original);
  // PNG decoders allow trailing bytes. Padding gives this fixture a realistic full-page payload size.
  const icon = `data:image/png;base64,${Buffer.concat([Buffer.from(iconPng, 'base64'), Buffer.alloc(6000)]).toString('base64')}`;
  draft.links = Array.from({ length: 30 }, (_, i) => ({ ...original.links[0], id: `icon-${i}`, icon }));
  assert.ok(JSON.stringify(draft).length > 128000);
  const response = await request('/api/site', { site: draft, baseUpdatedAt: original.updatedAt });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.links[29].icon, icon);
  assert.deepEqual(validateSite(JSON.parse(JSON.stringify(result))), result);
  assert.equal((await (await request('/data/site.json')).json()).links[0].icon, icon);
  delete result.links[0].icon;
  const removed = await request('/api/site', { site: result, baseUpdatedAt: result.updatedAt });
  assert.equal(removed.status, 200);
  assert.equal(Object.hasOwn((await removed.json()).links[0], 'icon'), false);
});

test('icon validation rejects scriptable, external, malformed, mismatched, and oversized images', () => {
  const valid = `data:image/png;base64,${iconPng}`;
  assert.equal(validateLinkIcon(valid), valid);
  for (const icon of ['https://example.com/image.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'data:image/png;base64,AAAA', `data:image/jpeg;base64,${iconPng}`, 'data:image/png;base64,***', {}]) {
    const next = structuredClone(original); next.links[0].icon = icon;
    assert.throws(() => validateSite(next), /valid PNG/);
  }
  assert.throws(() => validateLinkIcon(`data:image/png;base64,${Buffer.alloc(MAX_ICON_BYTES + 1).toString('base64')}`), /too large/);
});

test('Arabic is the default and English translations preserve names and variable values', () => {
  assert.equal(getLanguage(), 'ar');
  assert.equal(translate('Publish changes'), 'نشر التغييرات');
  assert.equal(translate('Publish changes', {}, 'en'), 'Publish changes');
  assert.equal(translate('Edit {name}', { name: 'موقعي <test>' }, 'ar'), 'تعديل موقعي <test>');
  assert.equal(translate('Custom content', {}, 'ar'), 'Custom content');
  assert.equal(translate('Language', {}, 'ar'), 'اللغة');
  assert.ok(Object.keys(arabic).length > 150);
});

test('password sessions protect publishing and logout revokes access', async t => {
  const { request } = await fixture(t, { password: 'test-only-admin-password' });
  const data = { site: original, baseUpdatedAt: original.updatedAt };
  assert.equal((await request('/api/session').then(response => response.json())).authenticated, false);
  assert.equal((await request('/api/site', data)).status, 401);
  assert.equal((await request('/api/login', { password: 'incorrect' }, { method: 'POST' })).status, 401);
  const login = await request('/api/login', { password: 'test-only-admin-password' }, { method: 'POST' });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
  const headers = { Cookie: cookie.split(';')[0] };
  assert.equal((await request('/api/site', data, { headers })).status, 200);
  assert.equal((await request('/api/logout', {}, { method: 'POST', headers })).status, 200);
  assert.equal((await request('/api/site', data, { headers })).status, 401);
});

test('sign-in attempts are rate limited', async t => {
  const { request } = await fixture(t, { password: 'test-only-admin-password' });
  for (let i = 0; i < 8; i++) assert.equal((await request('/api/login', { password: 'wrong' }, { method: 'POST' })).status, 401);
  assert.equal((await request('/api/login', { password: 'test-only-admin-password' }, { method: 'POST' })).status, 429);
});

test('shared validation rejects unsafe imports and excessive links', () => {
  assert.deepEqual(validateSite(original), original);
  for (const url of ['javascript:alert(1)', 'data:text/html,test', 'ftp://example.com', 'https://name:password@example.com', 'not a url']) {
    const next = structuredClone(original); next.links[0].url = url;
    assert.throws(() => validateSite(next));
  }
  const duplicates = structuredClone(original); duplicates.links.push(duplicates.links[0]);
  assert.throws(() => validateSite(duplicates), /unique/);
  const excess = structuredClone(original); excess.links = Array.from({ length: 31 }, (_, i) => ({ ...original.links[0], id: `link-${i}` }));
  assert.throws(() => validateSite(excess), /30/);
  const empty = structuredClone(original); empty.profile.name = '  ';
  assert.throws(() => validateSite(empty), /Page name/);
  const badAppearance = structuredClone(original); badAppearance.appearance.color = 'url(evil)';
  assert.throws(() => validateSite(badAppearance), /appearance/);
  assert.throws(() => createApp({ localOnly: false }), /ADMIN_PASSWORD/);
});
