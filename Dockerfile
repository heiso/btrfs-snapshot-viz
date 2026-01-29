# Build stage - install all dependencies and build
FROM node:24-alpine AS builder
# Install build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++
COPY . /app
WORKDIR /app
RUN npm ci
RUN npm run build

# Production stage - fresh install of runtime dependencies
FROM node:24-alpine
# Install runtime dependencies
RUN apk add --no-cache btrfs-progs python3 make g++

COPY ./package.json package-lock.json /app/
WORKDIR /app

# Install production dependencies fresh (ensures correct versions)
RUN npm ci --omit=dev

# Copy built application
COPY --from=builder /app/build /app/build

# Create data directory for SQLite database
RUN mkdir -p /app/data && chown -R node:node /app/data

# Default to demo mode for safety (real mode requires mounting btrfs filesystem)
ENV DEMO=true
ENV NODE_ENV=production
ENV FILE_HISTORY_DB=/app/data/file-history.db

# Use non-root user for security
USER node

# Volume for persistent SQLite database
VOLUME ["/app/data"]

EXPOSE 3000

CMD ["npm", "run", "start"]
