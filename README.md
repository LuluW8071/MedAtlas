# MedAtlas Server

TypeScript API for ingesting Markdown or text knowledge bases into Pinecone.
The service parses documents into topic-aware chunks, creates passage embeddings,
and upserts vectors into a configured Pinecone namespace.

## Requirements

- Node.js 20+
- npm
- Pinecone account and index for document ingestion
- Bun for the production `start` script, or another runner capable of executing the compiled JavaScript

## Setup

```bash
npm install
cp .env.example .env
```

Set Pinecone values in `.env` before calling `/ingest`:

```dotenv
PINECONE_API_KEY=your-api-key
PINECONE_INDEX_NAME=medatlas-project
PINECONE_NAMESPACE=llama-text-embed-v2
EMBEDDING_MODEL=llama-text-embed-v2
```

Optional runtime settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4000` | HTTP port |
| `CLIENT_URL` | `http://localhost:3000` | Allowed CORS origin |
| `MAX_BATCH_UPSERT` | `96` | Chunks per embedding/upsert batch |
| `EMBEDDING_DELAY_MS` | `15000` | Delay between batches and rate-limit retries |
| `TOP_K` | `5` | Reserved retrieval setting |
| `LOG_LEVEL` | `info` | Pino log level |

`REDIS_URL` is loaded for future Redis integration. Redis is not currently used
by the active server routes.

Chunking limits are currently defined as constants in
`src/service/chunker.ts`; the similarly named entries in `.env.example` are not
read at runtime.

## Commands

```bash
# Watch source during development
npm run dev

# Type-check without emitting files
npm run typecheck

# Compile TypeScript into dist/
npm run build

# Run compiled server
npm run build
npm start
```

Server starts at `http://localhost:4000` by default.

## API

### Health

```bash
curl http://localhost:4000/health
```

Response:

```json
{
  "status": "ok",
  "service": "api"
}
```

### OpenAPI documentation

- Swagger UI: `http://localhost:4000/docs`
- OpenAPI JSON: `http://localhost:4000/docs.json`

### Ingest a document

Accepted extensions: `.md`, `.txt`  
Maximum upload size: 20 MB  
Multipart field: `file`

```bash
curl -X POST http://localhost:4000/ingest \
  -F "file=@./knowledge.md"
```

Successful response:

```json
{
  "message": "Document ingested successfully",
  "chunks": 12
}
```

Required document structure:

```markdown
# Cardiology

## Overview

Cardiology covers the diagnosis and treatment of heart conditions.

## Symptoms

Common symptoms include chest pain and shortness of breath.
```

Documents must contain at least one top-level `#` topic and one `##` section
with content. Files without that structure return `400`.

## Chunking CLI

The legacy diagnostic script remains available without duplicating production
chunking logic:

```bash
npx tsx tests/chunk.ts ./knowledge.md
```

It prints parsed topics, chunk details, short chunks, and aggregate statistics.

## Project Structure

```text
src/
  config/       Environment and logging configuration
  docs/         OpenAPI document factory
  models/       Shared data interfaces
  service/      Chunking and Pinecone ingestion logic
  main.ts       Express application entrypoint
  chunk.ts      Chunking diagnostics CLI
```

## Error Behavior

- `400`: missing upload, unsupported extension, or invalid document structure
- `404`: unknown route
- `500`: Pinecone configuration, embedding, or upsert failure

Pinecone configuration errors are reported when an ingestion request is made,
not during server startup.

## Verification

Run before submitting changes:

```bash
npm run typecheck
npm run build
```
