# Crystal Vision Co. — API Server
# Runs Express + SQLite on port 3000 inside the container.
# In production, nginx proxies /api/ → host port 3003 → container port 3000.

FROM node:20-bookworm-slim

# Build tools required by better-sqlite3 (native module compilation)
RUN apt-get update && apt-get install -y \
    python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy manifest first so Docker caches the npm install layer separately
COPY package.json package-lock.json ./

# Install production dependencies (compiles better-sqlite3 and sharp natively)
RUN npm install --omit=dev --no-audit

# Copy application source
COPY server.js ./

# Data directory: SQLite DB + content.json
# This gets bind-mounted at runtime to /opt/crystalvision/data on the host
RUN mkdir -p /app/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
