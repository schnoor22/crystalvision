#!/bin/bash
# Crystal Vision Co. — Deploy Script
# Run from local machine: bash deploy/deploy.sh
#
# Prerequisites:
#   - SSH access to server
#   - Node.js, Nginx, PM2, Certbot installed on server
#   - Update SERVER and DOMAIN variables below

set -e

# ─── Configuration ──────────────────────────────────────
SERVER="user@your-server-ip"
REMOTE_DIR="/var/www/crystalvisionusa"
DOMAIN="yourdomain.com"

# ─── Build ──────────────────────────────────────────────
echo "→ Building frontend..."
npm run build

# ─── Deploy Static Files ────────────────────────────────
echo "→ Deploying static files..."
rsync -avz --delete dist/ "$SERVER:$REMOTE_DIR/dist/"

# ─── Deploy API ─────────────────────────────────────────
echo "→ Deploying API..."
rsync -avz --exclude='node_modules' --exclude='data' --exclude='.env' api/ "$SERVER:$REMOTE_DIR/api/"

# ─── Deploy PM2 Config ──────────────────────────────────
rsync -avz deploy/ecosystem.config.cjs "$SERVER:$REMOTE_DIR/deploy/"

# ─── Install API Dependencies & Restart ─────────────────
echo "→ Installing API dependencies and restarting..."
ssh "$SERVER" << 'EOF'
  cd /var/www/crystalvisionusa/api
  npm install --production
  cd ..
  pm2 restart deploy/ecosystem.config.cjs --env production || pm2 start deploy/ecosystem.config.cjs --env production
  pm2 save
EOF

echo ""
echo "✓ Deployed successfully!"
echo "  Site: https://$DOMAIN"
echo ""
echo "First-time setup commands (run on server):"
echo "  sudo cp deploy/nginx.conf /etc/nginx/sites-available/crystalvisionco"
echo "  sudo ln -s /etc/nginx/sites-available/crystalvisionco /etc/nginx/sites-enabled/"
echo "  sudo nginx -t && sudo systemctl reload nginx"
echo "  sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
