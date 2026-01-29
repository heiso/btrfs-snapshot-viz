FROM node:20-alpine AS development-dependencies-env
# Install build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++
COPY . /app
WORKDIR /app
RUN npm ci

FROM node:20-alpine AS production-dependencies-env
# Install build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++
COPY ./package.json package-lock.json /app/
WORKDIR /app
RUN npm ci --omit=dev

FROM node:20-alpine AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN npm run build

FROM node:20-alpine
# Install runtime dependencies
RUN apk add --no-cache btrfs-progs

COPY ./package.json package-lock.json /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
WORKDIR /app

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
