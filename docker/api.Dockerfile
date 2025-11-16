# Stage 1: Build
FROM node:20-alpine AS builder

LABEL org.opencontainers.image.title="Discord Store Bot - API"
LABEL org.opencontainers.image.description="Internal API server for Discord Store Bot"
LABEL org.opencontainers.image.vendor="Discord Store Bot Team"
LABEL org.opencontainers.image.source="https://github.com/qenving/store-website-bot"

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy source code
COPY src/ ./src/

# Build the API
RUN npm run build:api

# Stage 2: Production
FROM node:20-alpine

LABEL org.opencontainers.image.title="Discord Store Bot - API"
LABEL org.opencontainers.image.description="Internal API server for Discord Store Bot"

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S appuser && \
    adduser -u 1001 -S appuser -G appuser

WORKDIR /app

# Copy production dependencies from builder
COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules

# Copy built files
COPY --from=builder --chown=appuser:appuser /app/dist/api ./dist/api
COPY --from=builder --chown=appuser:appuser /app/package.json ./

# Set environment variables
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION:-1.0.0} \
    API_PORT=3001 \
    API_HOST=0.0.0.0

# Switch to non-root user
USER appuser

# Expose API port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the API
CMD ["node", "dist/api/index.js"]
