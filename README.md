# alaskariannet

A faithful copy of https://asskaarian.netlify.app/ with the original layout, Arabic and English text, background, logo, fonts, icons, animations, and all seven social links.

## Preview

Run `npm run dev`, then visit http://localhost:3000.

Use Node.js 20 or newer. No dependencies or build step are required. The complete site is in `dist/`. All visual assets are stored locally, so the page itself does not require third-party asset requests. Social links open in a new tab.

## Admin dashboard

Run `npm run dev` and visit **http://localhost:3000/admin/**.

- Add, edit, remove, search, hide, and reorder social links.
- Arabic is the default language. Use the language selector to switch between Arabic and English; the choice is remembered in this browser. The dashboard and public page both support right-to-left Arabic layouts. Custom names and descriptions remain as entered; built-in platform labels on the public page follow the selected language.
- In **Add link** or **Edit social link**, choose **Platform icon** or **Upload image**. PNG, JPG, and WebP files up to 5 MB and 8000 × 8000 pixels are supported. Images are fitted into a 128 × 128 icon while preserving their proportions, and can be replaced or removed before saving.
- Edit the page name and Arabic or English description.
- Choose the shrine photograph or a solid background, button shapes, and animations.
- See changes immediately in the phone preview.
- Drafts are saved in this browser. **Publish changes** writes the content to `dist/data/site.json`; the public page reads that file on its next load.
- Download or import a validated JSON backup under **Page settings**. Discarding a draft restores the last published content.

Uploaded icons are embedded in the saved page data and JSON backups, so they also work when `dist/` is deployed to static hosting. Each processed icon is limited to 48 KB; page imports and publishing requests support up to 3 MB. Original full-size images are not uploaded to the server.

The default server only listens on your computer (`127.0.0.1`). There is no default password. Set the `ADMIN_PASSWORD` environment variable to a unique password of at least 12 characters to enable sign-in. Sessions expire after eight hours and are cleared when the server restarts. Invalid sign-ins are rate limited.

To run on a different local port in PowerShell:

```powershell
$env:PORT = '3001'
npm run dev
```

For a hosted dashboard, run the Node server behind HTTPS and set `HOST`, `PORT`, `ADMIN_PASSWORD`, and `PUBLIC_ORIGIN` (for example, `https://links.example.org`, without a trailing slash). Listening outside localhost requires a password. `PUBLIC_ORIGIN` must match the URL opened in the browser; it also enables secure session cookies for HTTPS. Keep the password in the hosting service's environment settings. Use one server instance and persistent, writable storage for `dist/data/site.json`; the server uses atomic file replacement and rejects saves based on an older published version. Proxy HTTPS requests to this server without rewriting their path.

### Static hosting

Netlify and other static hosts can serve the public page and the dashboard preview, but cannot run the publishing API. For a static deployment, publish locally and upload `dist/`, or download a backup as `site.json`, replace `dist/data/site.json`, and redeploy. Static-host dashboard drafts only affect that browser until the file is deployed. Opening `dist/index.html` through `file://` shows the original HTML fallback; use the local server to see published content and the admin dashboard.

### Verification

```sh
npm run check
npm test
```

The tests use isolated temporary content files and cover publishing, stale edits, URL validation, authentication, rate limits, and request protection.

## Edit and deploy

- Use the admin dashboard for content, links, and appearance. Published content is in `dist/data/site.json`.
- Edit `dist/index.html` and `dist/assets/public.js` for the public layout and rendering.
- The admin interface is in `dist/admin/`; its publishing API is in `scripts/serve.mjs`.
- Images, fonts, and icon styles are in `dist/assets/`.
- Upload `dist/` to any static host. `netlify.toml` is included for Netlify.
- `npm run download-assets` refreshes the original public image and font assets.

The original design and branding belong to their respective owners. Font Awesome includes its license notice in `dist/assets/fontawesome.css`.
