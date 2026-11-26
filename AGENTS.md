# Agent Guide

## Structure

- Root is Bun `1.3.14` workspace: `client/` is Next.js, `server/` is Express/TypeScript API.
- Server entrypoint is `server/src/main.ts`; routes are wired there. OpenAPI source is `server/src/schemas/api.ts` plus `server/src/docs/swagger.ts`.
- Services live under `server/src/service/` (ingest, chunker, retrieve, topic_match, auth, appointments); LangGraph agent logic lives under `server/src/agent/` (nodes, prompts as `.md`, tools).
- Agent graph: fast_cache_probe, truncate_history (only when the transcript exceeds `HISTORY_TOKEN_BUDGET`; model calls then see just the verbatim tail, the stored thread is untouched), router (it first skips its LLM for an exact follow-up click or whole-message greeting/thanks/ack, but not while a clarification is pending), then chitchat, cache_lookup + retrieve + response_refiner, or booking. Router decides the route; booking is one tool-calling turn, no ReAct loop. State persists in Mongo via the checkpointer. A running summary of older user turns is built alongside each turn in `service/agent.ts` and read by the next turn's router.
- Retrieval is local Qdrant (dense + BM25) plus Cohere rerank; Dense+native `qdrant/bm25` hybrid. Embeddings come from local llama-server; Pinecone no longer embeds (legacy `/pinecone/*` routes remain).
- Accounts, sessions, conversation ownership and appointments live in MongoDB (`users`, `sessions`, `thread_owners`, `appointments` collections); there is no SQLite.
- `dist/` and `.next/` are generated; never edit them. Server build also copies prompt `.md` files into `dist/`.

## Commands

- Install: `bun install`
- Run client and server: `bun run dev`
- Verify all TypeScript and builds: `bun run typecheck && bun run build`
- Server-only checks: `bun run --cwd server typecheck` and `bun run --cwd server build`
- Tests: from `server/`, `bunx tsx --test tests/*.test.ts` (all) or `bunx tsx --test tests/chunker.test.ts` (one file).
- `server` package `npm test` is stale and targets missing `src/service/chunker.test.ts`; do not use it.
- No lint configuration exists; use `git diff --check` alongside typecheck/build.

## Runtime

- Copy `.env.example` to `.env`; environment loading is relative to current working directory.
- Embedding needs `llama-server -hf luluw/Qwen3-MedEmbed-0.6B-Miriad-32k-en-trim-gguf:Q4_K_M -c 4096 --batch-size 768 --ubatch-size 768 -t 4 -ngl 999 --host 0.0.0.0 --port 8080 --embedding --pooling last --parallel 8 --flash-attn on` on `EMBEDDING_URL` (default `http://127.0.0.1:8080`; `EMBEDDING_MODEL` is only a label). After switching embedding model, drop the Qdrant collection and re-ingest. Agent switches live in `server/src/config/agent_config.ts`; reranking needs `COHERE_API_KEY`; Mongo needs `MONGODB_URI`. Failures occur when operations run, not at startup. `tsx watch` does not reload `.env`; restart after changing it.
- Tests that touch Mongo (`auth`, `appointment_operations`) use a throwaway `medatlas_test_*` database and drop it afterwards; they need `docker compose up -d mongo` (or any local Mongo on `MONGODB_URI`).
- `server/tests/` holds only `*.test.ts`; runnable live scripts (ingest, retrieval checks, evals, agent smoke) are in `server/scripts/`.
- Swagger UI is `/docs`; OpenAPI JSON is `/docs.json`. Confirm `server/src/main.ts` before trusting stale README endpoints.
- Compose Redis binds host `6380` to container `6379`; it stores topic titles (`topics` key) for fuzzy topic scoping and the semantic answer cache (Redis 8 vector sets, `semcache:*`; cosine threshold in `agent_config.ts`, negated queries bypass it). The exact-match answer cache is in Mongo. Compose Qdrant binds `127.0.0.1:6333`. Compose Mongo (`mongo:8`) binds `127.0.0.1:27017`. Compose also defines `llama` (CPU llama.cpp embedder, port 8080), `server` (4000) and `client` (3000) with CPU/memory limits; `docker compose up -d redis qdrant mongo llama` for infra only, stop any host llama-server/mongod first (port clashes). The server container mounts `server/.env`; `NEXT_PUBLIC_API_URL` is baked into the client image at build.
- Ingest is a background job (`POST /pinecone/ingest`, `GET /pinecone/ingest/:jobId`); chunk ids are deterministic so re-ingesting skips stored chunks. Chunks are sized in embedder tokens (default 480 max, estimated, then capped exactly via llama-server `/tokenize`; embedder ctx is 512). Dense vectors use Qdrant TurboQuant 4-bit (needs Qdrant >= 1.19). Changing chunker output changes ids and forces full re-embedding (local compute).

## Conventions

- Use shared Pino `logger` from `server/src/config/logger.ts`; do not add `console.*` calls.
- Keep route modules focused on wiring; follow existing service-layer handling and HTTP error mapping.
- Keep Zod runtime schemas and OpenAPI registration synchronized to avoid contract drift.
