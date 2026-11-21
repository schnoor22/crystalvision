# First Light Window Cleaning — Website

Single-page business site for First Light Window Cleaning (Hawaii), with an
editable-content admin panel, gallery, reviews and a quote form.

## Tech stack

| Layer | Technology |
|---|---|
| Build | Vite |
| Frontend | Vanilla JS, Tailwind CSS v4, GSAP, Phosphor icons |
| API | Express (runs as a Vercel serverless function via `api/index.js`) |
| Data | Turso (libsql) for content, quotes, reviews, stats |
| Images | Vercel Blob (gallery + hero uploads) |
| Email | Resend (quote notifications) |
| Hosting | Vercel |

## Local development

```bash
npm install
cd api && npm install && cd ..

npm run dev            # frontend on :5173 (proxies /api to :3000)
cd api && npm run dev  # API on :3000
```

Copy `api/.env.example` to `api/.env` and fill it in. For local data, set
`TURSO_DATABASE_URL=file:local.db`.

Useful API env vars:

| Var | Purpose |
|---|---|
| `ADMIN_PASSWORD` | Password for `/admin` |
| `RESEND_API_KEY` | Enables quote emails |
| `OWNER_EMAIL` | Where quote requests are sent |
| `EMAIL_FROM` | Sender, e.g. `First Light Window Cleaning <quotes@yourdomain.com>` (domain must be verified in Resend) |

## Editing content

Most copy (hero, about, services, phone, email, Instagram, pay link), the
hero photo, gallery and reviews are edited at `/admin` and stored in Turso.
The text in `index.html` and `getDefaultContent()` in `api/server.js` is only
the fallback when the database has nothing saved.

## Project structure

```
├── index.html               # The site (single page)
├── src/
│   ├── main.js              # Boots modules, nav, gallery/reviews/videos
│   ├── styles/main.css      # Tailwind + design tokens (night / glow / sun)
│   └── js/
│       ├── animation.js     # "First light" intro (once per session)
│       ├── content.js       # Applies admin-edited content
│       ├── modals.js        # Accessible modals
│       └── form.js          # Quote form
├── public/
│   ├── logo-wordmark.png    # White wordmark, transparent (nav/footer)
│   ├── logo-full.jpg        # Full logo artwork (intro)
│   ├── og-image.jpg         # 1200x630 social share image
│   ├── favicon-32.png, icon-512.png, apple-touch-icon.png
│   ├── background.jpg       # Fallback hero photo
│   ├── gallery.html         # Full gallery page
│   └── admin/index.html     # Admin panel
├── api/
│   ├── server.js            # Express API
│   └── index.js             # Vercel entry
└── vercel.json
```

## Deploy

Push to the branch Vercel deploys from. `npm run build` outputs to `dist/`.
