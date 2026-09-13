# MedAtlas

MedAtlas monorepo: Next.js TypeScript client, Express TypeScript API, Pinecone
document ingestion, and Redis development service.

## Setup

```bash
cp .env.example .env
bun install
docker compose up -d redis
bun run dev
```

Set Pinecone values in `.env` before using document ingestion:

```dotenv
PINECONE_API_KEY=your-api-key
PINECONE_INDEX_NAME=medatlas-project
PINECONE_NAMESPACE=llama-text-embed-v2
EMBEDDING_MODEL=llama-text-embed-v2
```

URLs:

- Client: `http://localhost:3000`
- API health: `http://localhost:4000/health`
- Swagger UI: `http://localhost:4000/docs`
- OpenAPI JSON: `http://localhost:4000/docs.json`
- Redis: `localhost:6379`

## API

Check API health:

```bash
curl http://localhost:4000/health
```

Upload Markdown or text knowledge base:

```bash
curl -X POST http://localhost:4000/ingest \
  -F "file=@./knowledge.md"
```

Documents require top-level `#` topics and `##` sections with content. Uploads
are limited to 20 MB and accepted extensions are `.md` and `.txt`.

## Commands

```bash
bun run dev       # client and API in watch mode
bun run build     # production builds
bun run typecheck # TypeScript checks
bun run start     # run compiled API
docker compose down
```

Run chunking diagnostics:

```bash
bunx tsx server/tests/chunk.ts ./knowledge.md
```

## Structure

```text
client/  Next.js web application
server/  Express API and Pinecone ingestion service
assets/  Shared knowledge-base assets
```

Environment files are local-only. Commit `.env.example`, never `.env`.
