import os
import re
import uuid
import json
import asyncio
import time
import pdfplumber
import docx
import pandas as pd
import requests
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from voyageai import Client as VoyageClient
from qdrant_client import QdrantClient
from qdrant_client.models import VectorParams, Distance, PointStruct
from pydantic import BaseModel
import uvicorn
from typing import List, Dict
import queue

# ------------------ Load environment ------------------
load_dotenv()
VOYAGE_API_KEY = os.getenv("VOYAGE_API_KEY")
QDRANT_URL = os.getenv("QDRANT_URL")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY")
COLLECTION_NAME = os.getenv("COLLECTION_NAME", "voyage_chunks")
OPENROUTER_API_KEY = os.getenv("OPENAI_API_KEY")
LLM_MODEL = os.getenv("LLM_MODEL", "meta-llama/llama-3.1-8b-instruct")

# ------------------ Initialize Clients ------------------
voyage_client = VoyageClient(api_key=VOYAGE_API_KEY)
qdrant_client = QdrantClient(url=QDRANT_URL, api_key=QDRANT_API_KEY, timeout=10.0)

existing = [c.name for c in qdrant_client.get_collections().collections]
if COLLECTION_NAME not in existing:
    qdrant_client.recreate_collection(
        collection_name=COLLECTION_NAME,
        vectors_config=VectorParams(size=1024, distance=Distance.COSINE),
    )

# ------------------ FastAPI App ------------------
app = FastAPI(title="AI Document Indexer", description="Index and query documents intelligently.")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------ Progress Tracking ------------------
progress_queues = {}

def create_progress_queue(session_id: str):
    progress_queues[session_id] = queue.Queue()
    return progress_queues[session_id]

# ------------------ Models ------------------
class TextIndexRequest(BaseModel):
    text: str
    session_id: str

class QueryRequest(BaseModel):
    query: str
    history: List[Dict[str, str]] = []
    session_id: str

# ------------------ Utility Functions ------------------
def extract_text_from_pdf(path):
    text = ""
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            page_text = re.sub(r'\.([A-Z])', r'. \1', page_text.strip())
            text += page_text + "\n\n"
    return text

def extract_text_from_docx(path):
    doc = docx.Document(path)
    return "\n\n".join([p.text for p in doc.paragraphs])

def extract_text_from_excel(path):
    df_all = pd.read_excel(path, sheet_name=None)
    chunks = []
    for sheet_name, sheet in df_all.items():
        sheet = sheet.fillna("-")
        headers = sheet.iloc[0].tolist()
        for idx, row in sheet.iloc[1:].iterrows():
            kv_dict = {str(headers[i]): str(row.iloc[i]) for i in range(len(headers))}
            chunks.append(json.dumps(kv_dict, ensure_ascii=False))
    return chunks

def split_text(text, chunk_size=1500, chunk_overlap=100):
    chunks, start = [], 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(text[start:end])
        start += chunk_size - chunk_overlap
    return chunks

def llm_chunk_text(text, max_tokens=500):
    prompt = f"""
    Split the following text into coherent, meaningful sections,
    each roughly under {max_tokens} tokens.
    Return only a JSON array of chunks.

    Text:
    {text[:8000]}
    """
    headers = {"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"}
    payload = {
        "model": LLM_MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0,
        "max_tokens": 1200,
    }

    try:
        r = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload)
        r.raise_for_status()
        response = r.json()["choices"][0]["message"]["content"].strip()
        if not response.startswith("["):
            response = response[response.find("["):]
        chunks = json.loads(response)
        return [c.strip() for c in chunks if len(c.strip()) > 0]
    except Exception as e:
        print(f"⚠️ LLM chunking failed: {e}")
        return split_text(text)

def estimate_tokens(text):
    return len(text) / 4

async def batch_embed_and_store(chunks, source="unknown", session_id="unknown"):
    total_chunks = len(chunks)
    processed_chunks = 0
    batch_size_limit = 1000
    batch = []
    batch_tokens = 0
    start_time = time.time()

    for i, chunk in enumerate(chunks):
        tokens = estimate_tokens(chunk)
        if batch_tokens + tokens > batch_size_limit or i == len(chunks) - 1:
            if batch:
                await send_batch(batch, source, session_id)
                processed_chunks += len(batch)
                progress_queues[session_id].put({"processed": processed_chunks, "total": total_chunks})
                batch = []
                batch_tokens = 0
                elapsed = time.time() - start_time
                if elapsed < 20:
                    await asyncio.sleep(20 - elapsed)
                start_time = time.time()
        batch.append(chunk)
        batch_tokens += tokens
        progress_queues[session_id].put({"processed": processed_chunks + len(batch), "total": total_chunks})

    if batch:
        await send_batch(batch, source, session_id)
        processed_chunks += len(batch)
        progress_queues[session_id].put({"processed": processed_chunks, "total": total_chunks})

    print(f"📊 Total chunks stored from {source}: {processed_chunks}")
    return processed_chunks

async def send_batch(batch, source, session_id):
    try:
        embeddings = voyage_client.contextualized_embed(
            model="voyage-context-3",
            inputs=[[chunk] for chunk in batch],
            input_type="document",
            output_dimension=1024,
        ).results

        points = [
            PointStruct(id=str(uuid.uuid4()), vector=res.embeddings[0], payload={"text": chunk, "source": source})
            for chunk, res in zip(batch, embeddings)
        ]
        qdrant_client.upsert(collection_name=COLLECTION_NAME, points=points)
        print(f"✅ Stored {len(points)} chunks from {source}")
    except Exception as e:
        print(f"⚠️ Embedding error: {e}, retrying in 10s")
        await asyncio.sleep(10)
        await send_batch(batch, source, session_id)

def detect_output_format(query_text: str) -> str:
    q = query_text.lower()
    if "table" in q:
        return "table"
    elif "chart" in q or "graph" in q or "plot" in q:
        return "chart"
    return "text"

def format_history(history: List[Dict[str, str]]) -> str:
    formatted = []
    for msg in history:
        role = msg.get('role', 'unknown').capitalize()
        content = msg.get('content', '')
        formatted.append(f"{role}: {content}")
    return "\n\n".join(formatted)

def rerank_results(query_text: str, results: List[Dict]) -> List[Dict]:
    if not results:
        return []
    
    texts = [r['text'] for r in results]
    try:
        rerank_response = voyage_client.rerank(
            model="voyage-context-3",
            query=query_text,
            documents=texts,
            top_k=len(texts)
        )
        scored = [(texts[i], score) for i, score in enumerate(rerank_response.scores)]
        scored.sort(key=lambda x: x[1], reverse=True)
        return [{'text': text} for text, _ in scored[:10]]
    except Exception as e:
        print(f"⚠️ Rerank failed: {e}")
        return results

def summarize_with_llm(context_text, query_text, history, session_id, output_format="text"):
    format_instr = {
        "text": "Return a clear, human-readable summary.",
        "table": "Return a valid Markdown table summarizing the data.",
        "chart": "Return a JSON array of charts with 'chart_type' (Bar Chart, Line Chart, or Pie Chart), 'chart_style' (bar, line, or pie), and 'data' [{'label','value'}]. Use only 'bar', 'line', or 'pie' for chart_style. For horizontal bars, use 'bar'. For smooth or dotted lines, use 'line'. For 3D or other pie variants, use 'pie'."
    }

    system_content = f"You are a structured summarization expert. Output format: {output_format}. {format_instr[output_format]}."

    formatted_history = format_history(history) if history else ""
    
    messages = [
        {"role": "system", "content": system_content},
    ]
    if formatted_history:
        messages.append({"role": "system", "content": f"Conversation history: {formatted_history}"})
    messages.append({"role": "user", "content": f"Context from documents: {context_text[:8000]}\n\nQuery: {query_text}"})

    headers = {"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"}
    payload = {
        "model": LLM_MODEL,
        "messages": messages,
        "max_tokens": 1200,
        "temperature": 0.2
    }

    try:
        r = requests.post("https://openrouter.ai/api/v1/chat/completions", headers=headers, json=payload)
        r.raise_for_status()
        response = r.json()["choices"][0]["message"]["content"].strip()

        try:
            start_idx = response.find("[")
            end_idx = response.rfind("]") + 1
            if start_idx != -1 and end_idx != -1:
                clean_json = response[start_idx:end_idx]
                return json.loads(clean_json)
        except Exception:
            pass
        return response
    except Exception as e:
        print(f"❌ LLM error: {e}")
        return "⚠️ Error generating answer."

# ------------------ SSE Route for Progress ------------------
async def progress_stream(session_id: str):
    async def event_generator():
        try:
            queue = progress_queues.get(session_id)
            if not queue:
                yield f"data: {json.dumps({'error': 'Invalid session ID'})}\n\n"
                return

            while True:
                try:
                    progress = queue.get_nowait()
                    yield f"data: {json.dumps(progress)}\n\n"
                    if progress["processed"] >= progress["total"]:
                        break
                except queue.Empty:
                    await asyncio.sleep(0.05)
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            if session_id in progress_queues:
                del progress_queues[session_id]

    return StreamingResponse(event_generator(), media_type="text/event-stream")

# ------------------ Routes ------------------
@app.get("/progress/{session_id}")
async def get_progress(session_id: str):
    return await progress_stream(session_id)

@app.post("/upload_file")
async def upload_file(file: UploadFile = File(...), session_id: str = str(uuid.uuid4())):
    os.makedirs("uploads", exist_ok=True)
    path = f"uploads/{file.filename}"
    with open(path, "wb") as f:
        f.write(await file.read())

    try:
        create_progress_queue(session_id)
        ext = file.filename.lower()
        if ext.endswith(".pdf"):
            text = extract_text_from_pdf(path)
            chunks = llm_chunk_text(text)
        elif ext.endswith(".docx"):
            text = extract_text_from_docx(path)
            chunks = llm_chunk_text(text)
        elif ext.endswith((".xls", ".xlsx")):
            chunks = extract_text_from_excel(path)
        elif ext.endswith(".txt"):
            with open(path, "r", encoding="utf-8") as f:
                text = f.read()
            chunks = llm_chunk_text(text)
        else:
            raise HTTPException(status_code=400, detail="❌ Unsupported file type")

        print(f"ℹ️ Total chunks generated for {file.filename}: {len(chunks)}")
        count = await batch_embed_and_store(chunks, source=file.filename, session_id=session_id)
        return {"message": f"✅ File processed successfully! ({count} chunks stored)", "session_id": session_id}
    finally:
        if os.path.exists(path):
            os.remove(path)

@app.post("/index_text")
async def index_text(req: TextIndexRequest):
    session_id = req.session_id
    create_progress_queue(session_id)
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="❌ Empty text")

    chunks = llm_chunk_text(text)
    count = await batch_embed_and_store(chunks, source="pasted_text", session_id=session_id)
    return {"message": f"✅ Text processed successfully! ({count} chunks stored)", "session_id": session_id}

@app.post("/query")
async def query(req: QueryRequest):
    q_text = req.query.strip()
    if not q_text:
        raise HTTPException(status_code=400, detail="❌ Empty query")

    out_format = detect_output_format(q_text)
    try:
        embed = voyage_client.contextualized_embed(
            model="voyage-context-3",
            inputs=[[q_text]],
            input_type="query",
            output_dimension=1024,
        ).results[0].embeddings[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding error: {e}")

    results = qdrant_client.query_points(collection_name=COLLECTION_NAME, query=embed, limit=20)
    if not results.points:
        return {"answer": "⚠️ No content found. Please upload a document first."}

    raw_results = [p.payload for p in results.points]
    reranked_results = rerank_results(q_text, raw_results)
    context = "\n\n".join(p['text'] for p in reranked_results)
    answer = summarize_with_llm(context, q_text, req.history, req.session_id, out_format)
    return {"answer": answer}

@app.get("/")
async def root():
    return {"message": "🚀 AI Document Indexer API is running! Visit /docs for Swagger UI."}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)