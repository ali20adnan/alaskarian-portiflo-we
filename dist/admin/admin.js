import { platforms, validateSite, MAX_SITE_BYTES } from '../assets/site-model.js';
import { t, translateError, getLanguage, getLocale, setLanguage } from '../assets/language.js';
import { prepareLinkIcon } from './link-image.js';

const $ = selector => document.querySelector(selector);
const draftKey = 'alaskariannet.admin.draft.v1';
let site, published, canPublish = false, protectedMode = false, editingId = null, toastTimer, pendingConfirmation, publishing = false;
let editingIcon = '', imageLoading = false, imageVersion = 0, workspaceMessage = 'Your page workspace';
const headings = {
  overview: ['Overview', 'Your page, at a glance', 'A little care for the links that bring your community together.'],
  links: ['Social links', 'Your community starts here', 'Manage the channels that connect people to the holy shrine.'],
  appearance: ['Appearance', 'A familiar place to land', 'Give your public page a look that feels unmistakably yours.'],
  settings: ['Page settings', 'The details make it yours', 'Your page identity, content backups, and a fresh start when you need one.'],
};
const clone = value => structuredClone(value);
const isDirty = () => site && published && JSON.stringify(site) !== JSON.stringify(published);

function toast(message, error = false) {
  clearTimeout(toastTimer);
  setMessage('#toast', message);
  $('#toast').classList.toggle('error', error);
  $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, error ? 8000 : 4500);
}

function preview() {
  if (site) $('#preview').contentWindow?.postMessage({ type: 'site-preview', site, language: getLanguage() }, location.origin);
}

function setMessage(selector, message, values = {}) {
  const element = $(selector);
  element.dataset.message = message;
  element.dataset.messageValues = JSON.stringify(values);
  element.textContent = translateError(t(message, values));
}

function persistDraft() {
  try {
    if (isDirty()) localStorage.setItem(draftKey, JSON.stringify({ site, baseUpdatedAt: published.updatedAt }));
    else localStorage.removeItem(draftKey);
    return true;
  } catch { return false; }
}

function updateStatus(saved = true) {
  const dirty = isDirty();
  const invalid = site && (!site.profile.name.trim() || !site.profile.subtitle.trim());
  $('#save-state').classList.toggle('dirty', !!dirty);
  $('#save-state').replaceChildren();
  const dot = document.createElement('span'); dot.className = 'status-dot';
  $('#save-state').append(dot, t(dirty ? (saved ? 'Draft saved' : 'Unsaved draft') : 'All changes published'));
  $('#publish').disabled = !dirty || !canPublish || publishing || invalid;
  $('#discard').disabled = !dirty;
  const number = value => value.toLocaleString(getLocale());
  $('#stat-total').textContent = number(site.links.length);
  $('#nav-count').textContent = number(site.links.length);
  $('#link-count').textContent = number(site.links.length);
  const visible = site.links.filter(link => link.visible).length;
  $('#stat-visible').textContent = number(visible);
  $('#stat-visible-note').textContent = site.links.length === 0 ? t('Add your first channel') : visible === site.links.length ? t('All channels are visible') : t('{count} hidden from your page', { count: number(site.links.length - visible) });
  $('#stat-published').textContent = published.updatedAt ? new Date(published.updatedAt).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' }) : t('Original page');
  $('#stat-published-note').textContent = published.updatedAt ? new Date(published.updatedAt).toLocaleString(getLocale(), { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'long', year: 'numeric' }) : t('Ready for your next update');
}

function changed({ links = false } = {}) {
  const saved = persistDraft();
  updateStatus(saved);
  if (links) renderLinks();
  preview();
}

function iconButton(icon, label, action, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = `icon-button ${action === 'delete' ? 'delete-link' : ''}`;
  button.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i>`;
  button.setAttribute('aria-label', label); button.title = label; button.dataset.action = action; button.disabled = disabled;
  return button;
}

function renderLinks() {
  if (!site) return;
  const query = $('#link-search').value.trim().toLowerCase();
  const filter = $('#link-filter').value;
  const links = site.links.filter(link => (!query || `${link.label} ${link.url} ${platforms[link.platform].name} ${t(platforms[link.platform].name)}`.toLowerCase().includes(query)) && (filter === 'all' || link.visible === (filter === 'visible')));
  $('#link-list').replaceChildren();
  if (!links.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state';
    empty.innerHTML = '<i class="fa-solid fa-link" aria-hidden="true"></i>';
    empty.append(t(site.links.length ? 'No matching links. Try another search or filter.' : 'Your next connection starts here. Add your first link.'));
    $('#link-list').append(empty);
  }
  for (const link of links) {
    const row = document.createElement('div'); row.className = `link-row ${link.visible ? '' : 'is-hidden'}`; row.dataset.id = link.id;
    const identity = document.createElement('div'); identity.className = 'link-identity';
    const icon = document.createElement('span'); icon.className = 'platform-icon'; icon.style.setProperty('--platform-color', platforms[link.platform].color);
    const glyph = document.createElement(link.icon ? 'img' : 'i');
    if (link.icon) { glyph.src = link.icon; glyph.alt = ''; } else { glyph.className = platforms[link.platform].icon; }
    glyph.setAttribute('aria-hidden', 'true'); icon.append(glyph);
    const text = document.createElement('div'); text.className = 'link-text';
    const label = document.createElement('strong'); label.textContent = link.label; label.dir = 'auto';
    const url = document.createElement('a'); url.href = link.url; url.dir = 'ltr'; url.textContent = link.url.replace(/^https?:\/\//, '').replace(/\/$/, ''); url.target = '_blank'; url.rel = 'noopener noreferrer'; url.title = link.url;
    text.append(label, url); identity.append(icon, text);
    const toggle = document.createElement('input'); toggle.type = 'checkbox'; toggle.className = 'visibility-switch'; toggle.checked = link.visible; toggle.setAttribute('role', 'switch'); toggle.setAttribute('aria-label', t('Show {name} on public page', { name: link.label })); toggle.dataset.action = 'toggle';
    const actions = document.createElement('div'); actions.className = 'row-actions';
    const index = site.links.indexOf(link);
    actions.append(iconButton('fa-arrow-up', t('Move {name} up', { name: link.label }), 'up', index === 0), iconButton('fa-arrow-down', t('Move {name} down', { name: link.label }), 'down', index === site.links.length - 1), iconButton('fa-pen', t('Edit {name}', { name: link.label }), 'edit'), iconButton('fa-trash-can', t('Delete {name}', { name: link.label }), 'delete'));
    row.append(identity, toggle, actions); $('#link-list').append(row);
  }
}

function renderForms() {
  $('#profile-name').value = site.profile.name;
  $('#profile-subtitle').value = site.profile.subtitle;
  setMessage('#profile-error', '');
  for (const input of $('#appearance-form').elements) {
    if (input.type === 'radio') input.checked = site.appearance[input.name] === input.value;
    if (input.name === 'color') input.value = site.appearance.color;
    if (input.name === 'animation') input.checked = site.appearance.animation;
  }
  $('#solid-sample').style.background = site.appearance.color;
  $('#color-value').textContent = site.appearance.color.toUpperCase();
}

function navigate() {
  const page = Object.hasOwn(headings, location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
  const [name, title, description] = headings[page].map(value => t(value));
  $('#breadcrumb-page').textContent = name;
  $('#page-title').replaceChildren(document.createTextNode(title));
  const dot = document.createElement('span'); dot.textContent = '.'; $('#page-title').append(dot);
  $('#page-description').textContent = description;
  document.title = `${name} · alaskariannet ${t('Admin')}`;
  document.querySelectorAll('[data-section]').forEach(section => { section.hidden = !section.dataset.section.split(' ').includes(page); });
  document.querySelectorAll('[data-page]').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page);
    if (item.dataset.page === page) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
  });
  closeNavigation();
}

function confirmAction(title, description, label, callback) {
  setMessage('#confirm-title', title);
  setMessage('#confirm-description', description);
  setMessage('#confirm-action', label);
  pendingConfirmation = callback;
  $('#confirm-dialog').showModal();
}

function openLink(link) {
  if (!site) return;
  if (!link && site.links.length >= 30) return toast('Your page can have up to 30 links.', true);
  editingId = link?.id ?? null;
  $('#link-dialog-title').textContent = t(link ? 'Edit social link' : 'Add a social link');
  $('#link-platform').value = link?.platform ?? 'custom';
  $('#link-label').value = link?.label ?? '';
  $('#link-url').value = link?.url ?? '';
  $('#link-visible').checked = link?.visible ?? true;
  setMessage('#link-error', '');
  imageVersion++; imageLoading = false; editingIcon = link?.icon || '';
  $('#link-image').value = '';
  $(`input[name="iconSource"][value="${editingIcon ? 'upload' : 'platform'}"]`).checked = true;
  renderImagePicker();
  $('#link-dialog').showModal();
}

async function api(route, options = {}) {
  const response = await fetch(`/api/${route}`, { ...options, headers: { 'Content-Type': 'application/json', 'X-Admin-Request': '1', ...options.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !$('#login-dialog').open) $('#login-dialog').showModal();
    throw new Error(data.error || t('The server could not complete this request ({status}).', { status: response.status }));
  }
  return data;
}

async function checkSession() {
  try {
    const session = await api('session');
    if (typeof session.authenticated !== 'boolean') throw new Error('No admin server');
    canPublish = session.authenticated;
    protectedMode = session.protected;
    workspaceMessage = protectedMode ? 'Protected workspace' : 'Local workspace';
    $('#workspace-mode').textContent = t(workspaceMessage);
    $('#logout').hidden = !protectedMode || !session.authenticated;
    if (!session.authenticated && !$('#login-dialog').open) $('#login-dialog').showModal();
  } catch {
    canPublish = false;
    workspaceMessage = 'Offline workspace';
    $('#workspace-mode').textContent = t(workspaceMessage);
    setMessage('#connection-banner', 'Preview mode: drafts are saved in this browser. To publish to this project, run npm run dev and open /admin/. On a static host, download a backup from Page settings and deploy it as data/site.json.');
    $('#connection-banner').hidden = false;
  }
}

async function initialize() {
  $('#today').textContent = new Date().toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
  for (const [value, platform] of Object.entries(platforms)) { const option = document.createElement('option'); option.value = value; option.textContent = t(platform.name); $('#link-platform').append(option); }
  navigate();
  try {
    const response = await fetch('../data/site.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('The page content could not be loaded. Refresh to try again.');
    published = validateSite(await response.json());
    site = clone(published);
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) || 'null');
      if (saved && saved.baseUpdatedAt === published.updatedAt) { site = validateSite(saved.site); toast('Your unpublished draft has been restored.'); }
      else if (saved) toast('A newer page has been published. Your old draft was not applied.', true);
    } catch { toast('The saved draft could not be loaded. Showing the published page.', true); }
    renderForms(); renderLinks(); preview();
    await checkSession(); updateStatus();
  } catch (error) {
    setMessage('#connection-banner', error.message); $('#connection-banner').hidden = false;
    setMessage('#save-state', 'Page unavailable');
    document.querySelectorAll('.editor-content button, .editor-content input, .editor-content select, .editor-content textarea').forEach(input => { input.disabled = true; });
  }
}

window.addEventListener('message', event => { if (event.origin === location.origin && event.source === $('#preview').contentWindow && event.data?.type === 'preview-ready') preview(); });
window.addEventListener('hashchange', navigate);
window.addEventListener('beforeunload', event => { if (isDirty() && !persistDraft()) { event.preventDefault(); event.returnValue = ''; } });
$('#preview').addEventListener('load', preview);
$('#link-search').addEventListener('input', renderLinks);
$('#link-filter').addEventListener('change', renderLinks);
$('#add-link').addEventListener('click', () => openLink());
$('#link-platform').addEventListener('change', () => { if (!editingId) $('#link-label').value = t(platforms[$('#link-platform').value].name); });
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(`#${button.dataset.close}`).close()));
$('#confirm-action').addEventListener('click', () => { $('#confirm-dialog').close(); pendingConfirmation?.(); pendingConfirmation = null; });
$('#confirm-dialog').addEventListener('close', () => { pendingConfirmation = null; });
$('#link-form').addEventListener('submit', event => {
  event.preventDefault();
  if (imageLoading) return;
  const useImage = $('input[name="iconSource"]:checked').value === 'upload';
  if (useImage && !editingIcon) { setMessage('#link-error', 'Choose a picture or switch to the platform icon.'); return; }
  const link = { id: editingId || `link-${crypto.randomUUID()}`, platform: $('#link-platform').value, label: $('#link-label').value.trim(), url: $('#link-url').value.trim(), visible: $('#link-visible').checked, ...(useImage ? { icon: editingIcon } : {}) };
  const next = clone(site);
  if (editingId) next.links[next.links.findIndex(item => item.id === editingId)] = link; else next.links.push(link);
  try { site = validateSite(next); } catch (error) { setMessage('#link-error', error.message); return; }
  $('#link-dialog').close(); changed({ links: true }); toast('Link saved to your draft.');
});

$('#link-list').addEventListener('click', event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const id = button.closest('[data-id]').dataset.id;
  const index = site.links.findIndex(link => link.id === id);
  const link = site.links[index];
  if (button.dataset.action === 'edit') return openLink(link);
  if (button.dataset.action === 'delete') return confirmAction(t('Remove {name}?', { name: link.label }), 'This link will be removed from your draft. Your public page will change when you publish.', 'Remove link', () => { site.links = site.links.filter(item => item.id !== id); changed({ links: true }); toast('Link removed from your draft.'); });
  const nextIndex = index + (button.dataset.action === 'up' ? -1 : 1);
  if (nextIndex < 0 || nextIndex >= site.links.length) return;
  [site.links[index], site.links[nextIndex]] = [site.links[nextIndex], site.links[index]];
  changed({ links: true });
  const movedRow = Array.from($('#link-list').children).find(row => row.dataset.id === id);
  const target = movedRow?.querySelector(`[data-action="${button.dataset.action}"]`);
  (target?.disabled ? movedRow?.querySelector('[data-action="edit"]') : target)?.focus();
});
$('#link-list').addEventListener('change', event => {
  if (event.target.dataset.action !== 'toggle') return;
  const row = event.target.closest('[data-id]');
  site.links.find(link => link.id === row.dataset.id).visible = event.target.checked;
  row.classList.toggle('is-hidden', !event.target.checked);
  changed({ links: $('#link-filter').value !== 'all' });
});
$('#profile-form').addEventListener('submit', event => event.preventDefault());
$('#profile-form').addEventListener('input', () => {
  site.profile.name = $('#profile-name').value;
  site.profile.subtitle = $('#profile-subtitle').value;
  setMessage('#profile-error', !site.profile.name.trim() || !site.profile.subtitle.trim() ? 'A page name and description are required before publishing.' : '');
  changed();
});
$('#appearance-form').addEventListener('input', () => {
  const form = new FormData($('#appearance-form'));
  site.appearance = { background: form.get('background'), color: form.get('color'), buttonStyle: form.get('buttonStyle'), animation: $('#animation').checked };
  $('#solid-sample').style.background = site.appearance.color;
  $('#color-value').textContent = site.appearance.color.toUpperCase(); changed();
});
$('#publish').addEventListener('click', async () => {
  if (publishing) return;
  publishing = true; updateStatus(); $('#publish span').textContent = t('Publishing…');
  try {
    const originalDraft = JSON.stringify(site);
    const snapshot = validateSite(site);
    const result = await api('site', { method: 'PUT', body: JSON.stringify({ site: snapshot, baseUpdatedAt: published.updatedAt }) });
    published = validateSite(result);
    if (JSON.stringify(site) === originalDraft) site = clone(published); else site.updatedAt = published.updatedAt;
    persistDraft(); toast('Published. Your public page is up to date.');
  } catch (error) { toast(error.message, true); }
  finally { publishing = false; $('#publish span').textContent = t('Publish changes'); updateStatus(); }
});
$('#export').addEventListener('click', () => {
  try {
    const content = validateSite(site);
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2) + '\n'], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'site.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); toast('Page backup downloaded.');
  } catch (error) { toast(error.message, true); }
});
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > MAX_SITE_BYTES) throw new Error('Choose a page backup smaller than 3 MB.');
    const imported = validateSite(JSON.parse(await file.text()));
    confirmAction('Import this page backup?', t('Replace this draft with “{name}” and its {count} links? Your published page will stay as it is until you publish.', { name: imported.profile.name, count: imported.links.length.toLocaleString(getLocale()) }), 'Import backup', () => { imported.updatedAt = published.updatedAt; site = imported; renderForms(); changed({ links: true }); toast('Backup imported into your draft.'); });
  } catch (error) { toast(error instanceof SyntaxError ? 'This file is not a valid JSON page backup.' : error.message, true); }
  event.target.value = '';
});
$('#discard').addEventListener('click', () => confirmAction('Discard your draft?', 'Your unpublished changes will be replaced with the currently published page.', 'Discard draft', () => { site = clone(published); renderForms(); changed({ links: true }); toast('Draft discarded. Showing the published page.'); }));
$('#login-dialog').addEventListener('cancel', event => event.preventDefault());
$('#login-form').addEventListener('submit', async event => {
  event.preventDefault(); const submit = $('#login-form button[type="submit"]'); submit.disabled = true; setMessage('#login-error', '');
  try { await api('login', { method: 'POST', body: JSON.stringify({ password: $('#password').value }) }); $('#password').value = ''; $('#login-dialog').close(); await checkSession(); updateStatus(); toast('Welcome back. Your workspace is ready.'); }
  catch (error) { setMessage('#login-error', error.message); }
  finally { submit.disabled = false; }
});
$('#logout').addEventListener('click', async () => {
  try { await api('logout', { method: 'POST' }); canPublish = false; $('#logout').hidden = true; updateStatus(); $('#login-dialog').showModal(); }
  catch (error) { toast(error.message, true); }
});
function closeNavigation() { $('#sidebar').classList.remove('open'); $('#sidebar-overlay').hidden = true; $('#menu-toggle').setAttribute('aria-expanded', 'false'); $('#menu-toggle').setAttribute('aria-label', t('Open navigation')); }
$('#menu-toggle').addEventListener('click', () => {
  const open = $('#sidebar').classList.toggle('open'); $('#sidebar-overlay').hidden = !open; $('#menu-toggle').setAttribute('aria-expanded', String(open)); $('#menu-toggle').setAttribute('aria-label', t(open ? 'Close navigation' : 'Open navigation'));
});
$('#sidebar-overlay').addEventListener('click', closeNavigation);
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeNavigation(); });
document.addEventListener('invalid', event => {
  if (event.target.validity.valueMissing) event.target.setCustomValidity(t('Please fill out this field.'));
  else if (event.target.validity.typeMismatch) event.target.setCustomValidity(t('Enter a valid website address.'));
}, true);
document.addEventListener('input', event => { event.target.setCustomValidity?.(''); });
function renderImagePicker() {
  const useImage = $('input[name="iconSource"]:checked').value === 'upload';
  $('#image-upload-area').hidden = !useImage;
  $('#uploaded-icon-preview').replaceChildren();
  const picture = document.createElement(editingIcon ? 'img' : 'i');
  if (editingIcon) { picture.src = editingIcon; picture.alt = ''; } else picture.className = 'fa-regular fa-image';
  $('#uploaded-icon-preview').append(picture);
  $('#choose-image-label').textContent = t(editingIcon ? 'Replace image' : 'Choose image');
  $('#image-status').textContent = t(imageLoading ? 'Preparing image…' : editingIcon ? 'Image ready' : '');
  $('#remove-image').hidden = !editingIcon;
  $('#link-form button[type="submit"]').disabled = imageLoading;
}
document.querySelectorAll('input[name="iconSource"]').forEach(input => input.addEventListener('change', () => {
  imageVersion++; imageLoading = false; setMessage('#link-error', ''); renderImagePicker();
}));
$('#link-image').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  const version = ++imageVersion;
  imageLoading = true; setMessage('#link-error', ''); renderImagePicker();
  try { const result = await prepareLinkIcon(file); if (version === imageVersion) editingIcon = result; }
  catch (error) { if (version === imageVersion) setMessage('#link-error', error.message); }
  finally { if (version === imageVersion) { imageLoading = false; event.target.value = ''; renderImagePicker(); } }
});
$('#remove-image').addEventListener('click', () => { imageVersion++; editingIcon = ''; imageLoading = false; $('#link-image').value = ''; renderImagePicker(); });
$('#link-dialog').addEventListener('close', () => { imageVersion++; imageLoading = false; });
document.querySelectorAll('[data-language-select]').forEach(select => select.addEventListener('change', () => setLanguage(select.value)));
window.addEventListener('languagechange', () => {
  document.querySelectorAll('input, select, textarea').forEach(input => input.setCustomValidity(''));
  navigate();
  $('#today').textContent = new Date().toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric' });
  $('#workspace-mode').textContent = t(workspaceMessage);
  $('#publish span').textContent = t(publishing ? 'Publishing…' : 'Publish changes');
  for (const option of $('#link-platform').options) option.textContent = t(platforms[option.value].name);
  document.querySelectorAll('[data-message]').forEach(element => { element.textContent = translateError(t(element.dataset.message, JSON.parse(element.dataset.messageValues || '{}'))); });
  if ($('#link-dialog').open) { $('#link-dialog-title').textContent = t(editingId ? 'Edit social link' : 'Add a social link'); renderImagePicker(); }
  if (site) { updateStatus(); renderLinks(); preview(); }
});
setLanguage(getLanguage(), false);
initialize();
