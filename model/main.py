from fastapi import FastAPI
from pydantic import BaseModel
from transformers import pipeline

app = FastAPI(title="Medical NER API")

MODEL_NAME = "AventIQ-AI/bert-medical-entity-extraction"

label_map = {
    "LABEL_0": "O",
    "LABEL_1": "Drug",
    "LABEL_2": "Disease",
    "LABEL_3": "Symptom",
    "LABEL_4": "Treatment",
}

ner = pipeline(
    "token-classification",
    model=MODEL_NAME,
    aggregation_strategy=None,
)


class NERRequest(BaseModel):
    text: str


def merge_entities(results):
    entities = []
    current = None

    for entity in results:
        word = entity["word"]
        raw_label = entity["entity"]
        label = label_map.get(raw_label, raw_label)
        score = float(entity["score"])

        if word.startswith("##") and current:
            current["text"] += word[2:]
            current["end"] = entity["end"]
            current["score"] = min(current["score"], score)
            continue

        if current:
            entities.append(current)

        current = {
            "text": word,
            "label": label,
            "score": score,
            "start": entity["start"],
            "end": entity["end"],
        }

    if current:
        entities.append(current)

    return [
        entity
        for entity in entities
        if entity["label"] != "O"
    ]


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": MODEL_NAME,
    }


@app.post("/extract")
def extract(request: NERRequest):
    print(request.text)
    results = ner(request.text)
    entities = merge_entities(results)
    print(entities)
    return {
        "text": request.text,
        "entities": entities,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)