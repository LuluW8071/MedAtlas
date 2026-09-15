# MedAtlas Medical NER Service

Local FastAPI service for extracting medical entities from query text.

## Setup

Requires Python 3.14 and `uv`.

```bash
uv sync
```

## Run

```bash
uv run python main.py
```

Service listens on `http://localhost:8000`. First startup downloads the
`AventIQ-AI/bert-medical-entity-extraction` model.

## API

Health check:

```bash
curl http://localhost:8000/health
```

Extract entities:

```bash
curl -X POST http://localhost:8000/extract \
  -H 'accept: application/json' \
  -H 'Content-Type: application/json' \
  -d '{"text":"causes of hypertension, allergy and amnesia"}'
```

The response contains detected entities with text, label, confidence score,
and character offsets.
