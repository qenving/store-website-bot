# Stage 1: Build
FROM node:20-alpine AS builder

LABEL org.opencontainers.image.title="Discord Store Bot - Bot"
LABEL org.opencontainers.image.description="Discord bot cluster node"
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

# Build the bot
RUN npm run build:bot

# Stage 2: Production
FROM node:20-alpine

LABEL org.opencontainers.image.title="Discord Store Bot - Bot"
LABEL org.opencontainers.image.description="Discord bot cluster node"

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S appuser && \
    adduser -u 1001 -S appuser -G appuser

WORKDIR /app

# Copy production dependencies from builder
COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules

# Copy built files
COPY --from=builder --chown=appuser:appuser /app/dist/bot ./dist/bot
COPY --from=builder --chown=appuser:appuser /app/package.json ./

# Set environment variables
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION:-1.0.0} \
    CLUSTER_MODE=true

# Switch to non-root user
USER appuser

# Health check - Check if bot process is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD ps aux | grep -v grep | grep "node dist/bot/index.js" || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the bot
CMD ["node", "dist/bot/index.js"]
