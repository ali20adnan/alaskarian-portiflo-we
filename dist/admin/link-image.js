import { validateLinkIcon } from '../assets/site-model.js';

// Keep icons inside the page backup so they also work on static hosting.
export async function prepareLinkIcon(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a PNG, JPG, or WebP image.');
  if (file.size > 5 * 1024 * 1024) throw new Error('Choose an image smaller than 5 MB.');
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('This image could not be opened. Try another picture.'));
    reader.readAsDataURL(file);
  });
  const picture = new Image();
  picture.src = source;
  try { await picture.decode(); } catch { throw new Error('This image could not be opened. Try another picture.'); }
  if (!picture.naturalWidth || !picture.naturalHeight) throw new Error('This image could not be opened. Try another picture.');
  if (picture.naturalWidth > 8000 || picture.naturalHeight > 8000) throw new Error('Choose an image up to 8000 × 8000 pixels.');
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  const scale = Math.min(128 / picture.naturalWidth, 128 / picture.naturalHeight);
  const width = picture.naturalWidth * scale, height = picture.naturalHeight * scale;
  context.drawImage(picture, (128 - width) / 2, (128 - height) / 2, width, height);
  picture.src = '';
  return validateLinkIcon(canvas.toDataURL('image/webp', 0.9));
}
