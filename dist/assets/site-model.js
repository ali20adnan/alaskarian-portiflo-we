export const MAX_ICON_BYTES = 48 * 1024;
export const MAX_SITE_BYTES = 3 * 1024 * 1024;
export const platforms = {
  facebook: { name: 'Facebook', icon: 'fa-brands fa-facebook', color: '#1877f2' },
  instagram: { name: 'Instagram', icon: 'fa-brands fa-instagram', color: '#c54479' },
  telegram: { name: 'Telegram', icon: 'fa-brands fa-telegram', color: '#279dcc' },
  youtube: { name: 'YouTube', icon: 'fa-brands fa-youtube', color: '#e43c3c' },
  tiktok: { name: 'TikTok', icon: 'fa-brands fa-tiktok', color: '#252525' },
  twitter: { name: 'Twitter / X', icon: 'fa-brands fa-x-twitter', color: '#252525' },
  website: { name: 'Website', icon: 'fa-solid fa-globe', color: '#34765c' },
  custom: { name: 'Custom link', icon: 'fa-solid fa-link', color: '#967341' },
};

export function validateLinkIcon(icon) {
  if (typeof icon !== 'string') throw new Error('The link icon must be a valid PNG, JPG, or WebP image.');
  if (icon.length > Math.ceil(MAX_ICON_BYTES / 3) * 4 + 32) throw new Error('The link icon is too large. Choose another image.');
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(icon);
  if (!match || match[2].length % 4 !== 0) throw new Error('The link icon must be a valid PNG, JPG, or WebP image.');
  let bytes;
  try { bytes = atob(match[2]); } catch { throw new Error('The link icon must be a valid PNG, JPG, or WebP image.'); }
  if (bytes.length > MAX_ICON_BYTES) throw new Error('The link icon is too large. Choose another image.');
  const valid = match[1] === 'png' ? bytes.startsWith('\x89PNG\r\n\x1a\n') : match[1] === 'jpeg' ? bytes.startsWith('\xff\xd8\xff') : bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
  if (!valid) throw new Error('The link icon must be a valid PNG, JPG, or WebP image.');
  return icon;
}

export function validateSite(input) {
  if (!input || input.version !== 1) throw new Error('This is not a supported page backup.');
  const string = (value, max, name) => {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${name} must contain 1–${max} characters.`);
    return value.trim();
  };
  const profile = {
    name: string(input.profile?.name, 60, 'Page name'),
    subtitle: string(input.profile?.subtitle, 160, 'Page description'),
  };
  const appearance = input.appearance;
  if (!appearance || !['shrine', 'solid'].includes(appearance.background) || !/^#[0-9a-f]{6}$/i.test(appearance.color) || !['rounded', 'pill', 'square'].includes(appearance.buttonStyle) || typeof appearance.animation !== 'boolean') throw new Error('Choose valid appearance settings.');
  if (!Array.isArray(input.links) || input.links.length > 30) throw new Error('A page can have up to 30 links.');
  const ids = new Set();
  const links = input.links.map(link => {
    if (!link || typeof link !== 'object' || Array.isArray(link)) throw new Error('Choose a valid platform and visibility.');
    const id = string(link.id, 80, 'Link ID');
    if (!/^[a-zA-Z0-9_-]+$/.test(id) || ids.has(id)) throw new Error('Each link must have a unique, valid ID.');
    ids.add(id);
    if (!Object.hasOwn(platforms, link.platform) || typeof link.visible !== 'boolean') throw new Error('Choose a valid platform and visibility.');
    const url = string(link.url, 2048, 'Link URL');
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error('Enter a complete website address, starting with https://.'); }
    if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) throw new Error('Links must use an http:// or https:// address without credentials.');
    return { id, platform: link.platform, label: string(link.label, 60, 'Link title'), url, visible: link.visible, ...(link.icon != null && link.icon !== '' ? { icon: validateLinkIcon(link.icon) } : {}) };
  });
  const updatedAt = input.updatedAt == null ? null : input.updatedAt;
  if (updatedAt !== null && (typeof updatedAt !== 'string' || !Number.isFinite(Date.parse(updatedAt)))) throw new Error('Invalid publication date.');
  return { version: 1, updatedAt, profile, appearance: { background: appearance.background, color: appearance.color, buttonStyle: appearance.buttonStyle, animation: appearance.animation }, links };
}
