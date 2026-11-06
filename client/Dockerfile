# Build context is the repo root: docker compose build client
FROM oven/bun:1.3
WORKDIR /app
COPY package.json bun.lock ./
COPY client/package.json client/
COPY server/package.json server/
RUN bun install --frozen-lockfile --filter @medatlas/client
COPY client client
# NEXT_PUBLIC_* is inlined into the browser bundle at build time.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN bun run --cwd client build
WORKDIR /app/client
EXPOSE 3000
CMD ["bun", "run", "start"]
