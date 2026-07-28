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

COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules

EXPOSE 5173
ENV NODE_ENV=production

CMD ["bun", "run", "preview"]
