# Stage 1: Build
FROM node:20-alpine AS builder

LABEL org.opencontainers.image.title="Discord Store Bot - Worker"
LABEL org.opencontainers.image.description="Background worker for reconciliation and jobs"
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

# Build the worker
RUN npm run build:worker

# Stage 2: Production
FROM node:20-alpine

LABEL org.opencontainers.image.title="Discord Store Bot - Worker"
LABEL org.opencontainers.image.description="Background worker for reconciliation and jobs"

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S appuser && \
    adduser -u 1001 -S appuser -G appuser

WORKDIR /app

# Copy production dependencies from builder
COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules

# Copy built files
COPY --from=builder --chown=appuser:appuser /app/dist/worker ./dist/worker
COPY --from=builder --chown=appuser:appuser /app/package.json ./

# Set environment variables
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION:-1.0.0} \
    WORKER_TYPE=reconciliation

# Switch to non-root user
USER appuser

# Health check - Check if worker process is running
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD ps aux | grep -v grep | grep "node dist/worker/index.js" || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the worker
CMD ["node", "dist/worker/index.js"]
