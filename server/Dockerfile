# Build context is the repo root: docker compose build server
FROM oven/bun:1.3
WORKDIR /app
COPY package.json bun.lock ./
COPY client/package.json client/
COPY server/package.json server/
RUN bun install --frozen-lockfile --filter @medatlas/server
COPY server server
RUN bun run --cwd server build
WORKDIR /app/server
EXPOSE 4000
CMD ["bun", "dist/src/main.js"]
