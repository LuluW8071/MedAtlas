# Agent Guide

## Layout

- Root is Bun `1.3.14` workspace with `client/` (Next.js) and `server/` (Express).
- API entrypoint is `server/src/main.ts`; Pinecone business logic belongs in `server/src/service/`, route files register endpoints.
- OpenAPI is generated from Zod schemas in `server/src/schemas/api.ts`; update schemas there and registry paths in `server/src/docs/swagger.ts`, not generated output.
- `dist/` and `.next/` are build artifacts; never edit them.

## Commands

- Install from root: `bun install`.
- Run both apps: `bun run dev`.
- Full verification: `bun run typecheck && bun run build`.
- Server checks: `bun run --cwd server typecheck` and `bun run --cwd server build`.
- Focused chunk tests: `bunx tsx --test server/tests/chunker.test.ts`.
- `server` package `npm test` is stale and points to missing `src/service/chunker.test.ts`; do not use it as verification.
- No lint script or lint configuration exists; use typecheck, build, and `git diff --check`.

## Runtime

- Copy root `.env.example` to `.env`; `dotenv` reads variables from current working directory.
- Pinecone operations require `PINECONE_API_KEY`, `PINECONE_INDEX_NAME`, `PINECONE_NAMESPACE`, and `EMBEDDING_MODEL`; missing values fail when operation runs, not during startup.
- Active API paths use `/pinecone/ingest`, `/pinecone/retrieve`, `/pinecone/health`, and `/pinecone/collections`; verify `server/src/main.ts` and route files before trusting stale README examples.
- Swagger UI is `/docs`; generated document is `/docs.json`.
- Redis compose service maps host `6380` to container `6379`, but Redis is not used by active routes.

## Conventions

- Use shared Pino `logger` from `server/src/config/logger.ts`; do not add `console.*` calls.
- Keep request handlers and HTTP error mapping in service handlers where existing service pattern does so; route modules should primarily wire paths.
- Keep schemas and runtime validation shared between handlers and OpenAPI to prevent contract drift.
