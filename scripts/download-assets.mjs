import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

async function download(url, destination) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const filename = path.join(root, destination);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, bytes);
  console.log(`${destination}: ${bytes.length} bytes`);
  return bytes.toString('utf8');
}

async function localizeStylesheet(url, destination) {
  let css = await download(url, destination);
  const urls = [...new Set([...css.matchAll(/url\(\s*['"]?([^\s)'"\n]+)['"]?\s*\)/g)].map(match => match[1]))];
  const downloaded = await Promise.all(urls.filter(url => !url.startsWith('data:')).map(async source => {
    const resolved = new URL(source, url);
    const local = `assets/fonts/${path.basename(resolved.pathname)}`;
    await download(resolved.href, local);
    return [source, `./fonts/${path.basename(resolved.pathname)}`];
  }));
  for (const [source, local] of downloaded) css = css.replaceAll(source, local);
  await writeFile(path.join(root, destination), css);
}

await Promise.all([
  download('https://i.imgur.com/RiynkUX.png', 'assets/logo.png'),
  download('https://i.imgur.com/GoM3th9.jpeg', 'assets/background.jpeg'),
  localizeStylesheet('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Poppins:wght@400;500;600&display=swap', 'assets/fonts.css'),
  localizeStylesheet('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css', 'assets/fontawesome.css'),
]);

let html = await readFile(path.join(root, 'index.html'), 'utf8');
html = html
  .replace(/<!-- This site is hosted on Netlify\.[\s\S]*?-->/, '')
  .replaceAll('https://i.imgur.com/RiynkUX.png', './assets/logo.png')
  .replaceAll('https://i.imgur.com/GoM3th9.jpeg', './assets/background.jpeg')
  .replace('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Poppins:wght@400;500;600&display=swap', './assets/fonts.css')
  .replace('https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css', './assets/fontawesome.css')
  .replaceAll('target="_blank" class=', 'target="_blank" rel="noopener noreferrer" class=');
await writeFile(path.join(root, 'index.html'), html);
