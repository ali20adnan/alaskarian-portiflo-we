import { platforms, validateSite } from './site-model.js';
import { t, getLanguage, setLanguage } from './language.js';

let currentSite;
document.querySelector('[data-language-select]').addEventListener('change', event => setLanguage(event.target.value));
window.addEventListener('languagechange', () => {
  if (currentSite) render(currentSite);
  else document.querySelectorAll('.link-btn .text-center').forEach(label => {
    label.dataset.originalLabel ||= label.textContent;
    label.textContent = t(label.dataset.originalLabel);
  });
});
setLanguage(getLanguage(), false);

function render(input) {
  const site = validateSite(input);
  currentSite = site;
  document.querySelector('.title-en').textContent = site.profile.name;
  document.querySelector('.subtitle-ar').textContent = site.profile.subtitle;
  document.title = `${site.profile.name} - ${site.profile.subtitle}`;
  document.body.style.backgroundColor = site.appearance.color;
  document.body.style.backgroundImage = site.appearance.background === 'shrine' ? "url('./assets/background.jpeg')" : 'none';
  document.body.classList.toggle('no-animation', !site.appearance.animation);
  document.body.dataset.buttonStyle = site.appearance.buttonStyle;
  document.querySelectorAll('.link-btn').forEach(link => link.remove());
  site.links.filter(link => link.visible).forEach((link, index) => {
    const anchor = document.createElement('a');
    anchor.className = 'link-btn';
    anchor.href = link.url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.style.animationDelay = `${index * .07}s`;
    const left = document.createElement('span');
    left.className = 'icon-left';
    const icon = document.createElement(link.icon || link.platform === 'website' ? 'img' : 'i');
    if (link.icon) {
      icon.className = 'uploaded-link-icon'; icon.src = link.icon; icon.alt = '';
    } else if (link.platform === 'website') {
      icon.className = 'custom-logo-icon'; icon.src = './assets/logo.png'; icon.alt = '';
    } else {
      icon.className = platforms[link.platform].icon + (link.platform === 'instagram' ? ' instagram-icon' : '');
      icon.style.color = platforms[link.platform].color;
    }
    icon.setAttribute('aria-hidden', 'true');
    left.append(icon);
    const label = document.createElement('span');
    label.className = 'text-center';
    label.dir = 'auto';
    label.textContent = link.label === platforms[link.platform].name ? t(link.label) : link.label;
    const right = document.createElement('span');
    right.className = 'icon-right';
    right.innerHTML = '<i class="fa-solid fa-ellipsis-vertical" aria-hidden="true"></i>';
    anchor.append(left, label, right);
    document.querySelector('.container').append(anchor);
  });
}

if (new URLSearchParams(location.search).has('preview') && window.parent !== window) {
  document.body.classList.add('is-preview');
  window.addEventListener('message', event => {
    if (event.origin !== location.origin || event.source !== window.parent || event.data?.type !== 'site-preview') return;
    try { if (event.data.language && event.data.language !== getLanguage()) setLanguage(event.data.language, false); render(event.data.site); } catch { /* Keep the last valid preview while a field is incomplete. */ }
  });
  document.addEventListener('click', event => { if (event.target.closest('a')) event.preventDefault(); });
  window.parent.postMessage({ type: 'preview-ready' }, location.origin);
} else {
  fetch('./data/site.json', { cache: 'no-store' }).then(response => {
    if (!response.ok) throw new Error('Page data unavailable');
    return response.json();
  }).then(render).catch(() => { /* The original HTML remains available offline and through file://. */ });
}
