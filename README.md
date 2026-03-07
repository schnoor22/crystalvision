# Crystal Vision Co. — Professional Window Cleaning Website

A modern, single-page business site with a showstopping squeegee animation that wipes away a "dirty window" overlay on load.

## Tech Stack

| Layer | Technology |
|---|---|
| **Build** | Vite |
| **Frontend** | Vanilla JS, Tailwind CSS v4, GSAP |
| **Icons** | Lucide |
| **API** | Express.js, SQLite (better-sqlite3), Resend |
| **Payments** | Stripe Payment Links (Phase 1) |
| **Deploy** | Nginx + PM2 + Let's Encrypt on Ubuntu |

## Getting Started

### Prerequisites
- Node.js 18+

### Development

```bash
# Install frontend dependencies
npm install

# Install API dependencies
cd api && npm install && cd ..

# Start both servers
npm run dev          # Frontend on :5173
cd api && npm run dev  # API on :3000
```

The Vite dev server proxies `/api/*` to `localhost:3000` automatically.

### Required Assets

Place these files in the `/public` folder:

| File | Description |
|---|---|
| `logo.png` | **Company logo** (the surfer/squeegee character) — DROP THIS IN FIRST |
| `hero-clean.jpg` | Bright sunny photo of clean windows on a nice home (replace the placeholder) |
| `og-image.jpg` | 1200×630 social sharing image |

### Environment Variables

Copy `api/.env.example` to `api/.env` and fill in:

```
RESEND_API_KEY=your_resend_api_key    # For email notifications (resend.com)
OWNER_EMAIL=owner@crystalvisionco.com  # Where quote requests go
```

## Production Build

```bash
npm run build   # Outputs to dist/
```

## Deployment (Ubuntu Server)

See `deploy/` folder for:
- `nginx.conf` — Nginx configuration (static files + API reverse proxy)
- `ecosystem.config.cjs` — PM2 process manager config
- `deploy.sh` — One-command deploy script

### First-time server setup:
```bash
# 1. Install prerequisites
sudo apt update && sudo apt install nginx nodejs npm
sudo npm i -g pm2

# 2. Configure Nginx
sudo cp deploy/nginx.conf /etc/nginx/sites-available/crystalvisionco
sudo ln -s /etc/nginx/sites-available/crystalvisionco /etc/nginx/sites-enabled/
# Edit the server_name in the config to match your domain
sudo nginx -t && sudo systemctl reload nginx

# 3. SSL
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# 4. Start API
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup
```

## Project Structure

```
├── index.html                 # Single-page site
├── src/
│   ├── main.js                # Entry point — boots all modules
│   ├── styles/main.css        # Tailwind + custom styles + design tokens
│   └── js/
│       ├── animation.js       # GSAP + Canvas squeegee animation
│       ├── modals.js          # Accessible modal system
│       └── form.js            # Quote form validation + submission
├── public/
│   ├── logo.png               # ← ADD YOUR LOGO HERE
│   ├── hero-clean.jpg         # Hero background (replace placeholder)
│   ├── robots.txt             # SEO
│   └── squeegee.svg           # Decorative asset
├── api/
│   ├── server.js              # Express API (quotes + future payments)
│   ├── .env.example           # Environment variable template
│   └── data/quotes.db         # SQLite database (auto-created)
├── deploy/
│   ├── nginx.conf             # Nginx config template
│   ├── ecosystem.config.cjs   # PM2 config
│   └── deploy.sh              # Deployment script
└── vite.config.js             # Vite + Tailwind plugin config
```

## Payments (Phase 1 — Stripe Payment Links)

No code integration needed yet. The owner:
1. Creates a Stripe account at stripe.com
2. After completing a job, creates a **Payment Link** in the Stripe dashboard
3. Texts/emails the link to the customer
4. The "Pay Invoice" link in the site footer can point to a Stripe Customer Portal (set up later)

## Future Enhancements

- [ ] Real hero photo + professional OG image
- [ ] Stripe Checkout Sessions (Phase 2 — pay directly on site)
- [ ] Testimonials section
- [ ] Photo gallery
- [ ] Blog (migrate to Astro if needed)
- [ ] SMS notifications via Twilio
- [ ] Google Business integration
