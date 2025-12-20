import os
import json
import math
import google.generativeai as genai
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv

# Load environment variables from parent directory
env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
load_dotenv(env_path)

# Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("Warning: GEMINI_API_KEY not found. RAG will not work.")

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

app = FastAPI(title="Antigravity Lightweight RAG")

# In-Memory Storage
DB_FILE = "knowledge_base.json"
knowledge_db = []


def load_db():
    global knowledge_db
    if os.path.exists(DB_FILE):
        try:
            with open(DB_FILE, "r", encoding="utf-8") as f:
                knowledge_db = json.load(f)
            print(f"Loaded {len(knowledge_db)} documents from {DB_FILE}")
        except Exception as e:
            print(f"Error loading DB: {e}")
            knowledge_db = []
    else:
        knowledge_db = []


def save_db():
    try:
        with open(DB_FILE, "w", encoding="utf-8") as f:
            json.dump(knowledge_db, f, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving DB: {e}")


# Initial load
load_db()


class DocumentInput(BaseModel):
    id: str
    text: str
    metadata: dict = {}


class QueryInput(BaseModel):
    query: str
    n_results: int = 5


def cosine_similarity(v1, v2):
    dot_product = sum(a * b for a, b in zip(v1, v2))
    magnitude1 = math.sqrt(sum(a * a for a in v1))
    magnitude2 = math.sqrt(sum(b * b for b in v2))
    if magnitude1 * magnitude2 == 0:
        return 0
    return dot_product / (magnitude1 * magnitude2)


def get_embedding(text: str, task_type="retrieval_document"):
    if not GEMINI_API_KEY:
        return [0.0] * 768
    try:
        result = genai.embed_content(
            model="models/text-embedding-004", content=text, task_type=task_type
        )
        return result["embedding"]
    except Exception as e:
        print(f"Embedding error: {e}")
        return [0.0] * 768


@app.post("/ingest")
async def ingest_document(doc: DocumentInput):
    # Check if exists and update
    embedding = get_embedding(doc.text, "retrieval_document")

    # Remove existing
    global knowledge_db
    knowledge_db = [d for d in knowledge_db if d["id"] != doc.id]

    entry = {
        "id": doc.id,
        "text": doc.text,
        "metadata": doc.metadata,
        "embedding": embedding,
    }
    knowledge_db.append(entry)

    # Save every 10 items or just save ? (Save every time for safety in this simplified version)
    # To optimize speed, maybe only save on shutdown or separate endpoint?
    # For now, simplistic approach: save every time.
    save_db()

    return {"status": "success", "id": doc.id}


@app.post("/query")
async def query_documents(query_input: QueryInput):
    if not knowledge_db:
        return {"results": {"documents": [[]], "metadatas": [[]]}}

    query_emb = get_embedding(query_input.query, "retrieval_query")

    # Calculate similarity
    scored_docs = []
    for doc in knowledge_db:
        score = cosine_similarity(query_emb, doc["embedding"])
        scored_docs.append((score, doc))

    # Sort
    scored_docs.sort(key=lambda x: x[0], reverse=True)

    # Top N
    top_n = scored_docs[: query_input.n_results]

    # Format to match ChromaDB response style for compatibility
    documents = [d[1]["text"] for d in top_n]
    metadatas = [d[1]["metadata"] for d in top_n]

    return {"results": {"documents": [documents], "metadatas": [metadatas]}}


@app.get("/health")
def health_check():
    return {"status": "ok", "count": len(knowledge_db)}


if __name__ == "__main__":
    import uvicorn
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    uvicorn.run(app, host="0.0.0.0", port=args.port)
