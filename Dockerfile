# ─── Stage 1: Build ────────────────────────────────────────
FROM oven/bun:1 AS build
WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# ─── Stage 2: Production ───────────────────────────────────
FROM oven/bun:1 AS production
WORKDIR /app

# Install curl for healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server.ts ./
COPY --from=build /app/src/server ./src/server

# Create data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 5173
ENV NODE_ENV=production
ENV DB_PATH=/app/data/afrifundedcapital.db

CMD ["bun", "run", "server.ts"]
