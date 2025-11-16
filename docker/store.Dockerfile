# Stage 1: Build
FROM node:20-alpine AS builder

LABEL org.opencontainers.image.title="Discord Store Bot - Store Website"
LABEL org.opencontainers.image.description="Customer-facing store website"
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

# Build the store website
RUN npm run build:store

# Stage 2: Production with NGINX
FROM nginx:alpine

LABEL org.opencontainers.image.title="Discord Store Bot - Store Website"
LABEL org.opencontainers.image.description="Customer-facing store website"

# Install nodejs for SSR (if needed)
RUN apk add --no-cache nodejs npm dumb-init

# Create non-root user
RUN addgroup -g 1001 -S appuser && \
    adduser -u 1001 -S appuser -G appuser

WORKDIR /app

# Copy built files from builder
COPY --from=builder /app/dist/store ./dist/store

# Copy NGINX configuration
COPY docker/nginx.conf /etc/nginx/nginx.conf

# Set environment variables
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION:-1.0.0} \
    STORE_PORT=3000

# Expose store port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1

# Start NGINX
CMD ["nginx", "-g", "daemon off;"]
