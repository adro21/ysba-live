FROM node:20-alpine

WORKDIR /app

# Copy Railway-specific package.json for lighter dependencies
COPY package-railway.json package.json

# Install dependencies using npm install (not ci since no lockfile)
RUN npm install --omit=dev --no-fund --no-audit

# Copy application code (excluding scraper files via .dockerignore)
COPY . .

# Build application
RUN npm run build

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/status', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start application
CMD ["npm", "run", "start-site"]