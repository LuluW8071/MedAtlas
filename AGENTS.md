# Agent Guide

## Structure

- Root is Bun `1.3.14` workspace: `client/` is Next.js, `server/` is Express/TypeScript API.
- Server entrypoint is `server/src/main.ts`; routes are wired there. OpenAPI source is `server/src/schemas/api.ts` plus `server/src/docs/swagger.ts`.
- Pinecone logic lives under `server/src/service/`; LangGraph agent logic lives under `server/src/agent/`.
- Appointment persistence is local SQLite, initialized by `server/src/db/client.ts`; do not commit database files.
- `dist/` and `.next/` are generated; never edit them. Server build also copies prompt `.md` files into `dist/`.

## Commands

- Install: `bun install`
- Run client and server: `bun run dev`
- Verify all TypeScript and builds: `bun run typecheck && bun run build`
- Server-only checks: `bun run --cwd server typecheck` and `bun run --cwd server build`
- Focused tests: `bunx tsx --test server/tests/chunker.test.ts`, `bunx tsx --test server/tests/appointment.test.ts`, or `bunx tsx --test server/tests/routing.test.ts`
- `server` package `npm test` is stale and targets missing `src/service/chunker.test.ts`; do not use it.
- No lint configuration exists; use `git diff --check` alongside typecheck/build.

## Runtime

- Copy `.env.example` to `.env`; environment loading is relative to current working directory.
- Pinecone requests need `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, `PINECONE_NAMESPACE`, and `EMBEDDING_MODEL`; failures occur when operations run, not at startup.
- SQLite path is controlled by `APPOINTMENTS_DB_PATH`; default runtime database files are ignored by Git.
- Swagger UI is `/docs`; OpenAPI JSON is `/docs.json`. Confirm `server/src/main.ts` before trusting stale README endpoints.
- Compose Redis binds host `6380` to container `6379`; Redis is currently not used by active routes.

## Conventions

- Use shared Pino `logger` from `server/src/config/logger.ts`; do not add `console.*` calls.
- Keep route modules focused on wiring; follow existing service-layer handling and HTTP error mapping.
- Keep Zod runtime schemas and OpenAPI registration synchronized to avoid contract drift.
