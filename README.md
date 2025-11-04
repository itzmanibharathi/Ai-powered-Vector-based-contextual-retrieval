# 📄 AI Document Chat System (FastAPI + React)

A complete end-to-end system that allows users to **upload documents (PDF / DOCX / XLSX / TXT)** and then **chat with the document**.  
The backend extracts text → generates embeddings → stores them in a vector database → uses an LLM to answer user queries.  
The frontend provides a beautiful UI with **chat, file upload, and chart rendering**.

---

## 🚀 Features

| Feature | Description |
|--------|-------------|
| 📂 Document Upload | Upload PDF / DOCX / XLSX / TXT or paste text |
| 🔍 AI Search | Converts content to vector embeddings (semantic meaning) |
| 💬 Chat with Documents | Ask any question like ChatGPT |
| 📊 Auto Charting | Converts numeric answers to charts (Bar / Pie / Line) |
| 🔊 Voice Support | Speech-to-Text input + Text-to-Speech response |
| ♻ Progress Tracking | File processing progress via Server-Sent Events |

---

## 🧠 System Architecture

```

┌──────────────┐        ┌──────────────┐      ┌──────────────┐
| React Frontend| --->   | FastAPI      | ---> | Qdrant Vector |
| (Upload + Chat)|       | (Embeddings) |      |   Database    |
└───────▲────────┘       └──────┬───────┘      └──────▲───────┘
|                        |                    |
|                        v                    |
|                  Voyage Embeddings          |
|                        |                    |
|                        v                    |
└────────────────── OpenRouter (LLM) <────────┘

```

---

## 📦 Technologies Used

### Backend (FastAPI)
| Package | Purpose |
|---------|---------|
| `fastapi` | Web backend framework |
| `qdrant-client` | Vector database client |
| `voyageai` | Generate embeddings for text |
| `python-docx`, `pypdf`, `openpyxl` | Extract text from DOCX/PDF/XLSX |
| `uvicorn` | Run server |
| `openai` (OpenRouter API) | LLM response generation |

### Frontend (React + Bootstrap)
| Package / Library | Purpose |
|------------------|---------|
| React 19 + Hooks | File upload + Chat UI |
| Bootstrap 5 | UI styling |
| Recharts | Chart (Bar / Pie / Line) rendering |
| Axios | API calls |
| Web Speech API | Speech-to-text / text-to-speech |
| React Markdown | Markdown rendering |

---

## 📂 Folder Structure

```

/project
│── /backend
│    ├── backend.py
│    ├── requirements.txt
│── /frontend
├── src
│   ├── components
│   │   ├── DocumentInject.jsx   (Upload + progress)
│   │   ├── Query.jsx            (Chat + charts + voice)
│   ├── App.jsx

````

---

## 🔄 How the System Works (Step by Step)

### ✅ Backend Flow (FastAPI)
1. User uploads PDF/DOCX/XLSX or pastes text  
2. Text is extracted & split into meaningful chunks  
3. Each chunk → Embedding generated using Voyage AI  
4. Embeddings stored in Qdrant vector database  
5. When user asks a question:
   - The question is embedded
   - Qdrant retrieves best text chunks
   - Voyage reranks context
   - OpenRouter LLM generates the final answer

### ✅ Frontend Flow (React)
1. `DocumentInject.jsx` — handles upload and progress SSE stream  
2. Once processed, user moves to Query page  
3. `Query.jsx` — chat with documents
   - Voice input
   - Chart rendering (if result is numeric dataset)
   - Markdown answer formatting

---

## 🛠️ Setup & Run

### 1️⃣ Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn backend:app --reload
````

### 2️⃣ Frontend

```bash
cd frontend
npm install
npm start
```

> Frontend runs on **[http://localhost:3000](http://localhost:3000)**
> Backend runs on **[http://localhost:8000](http://localhost:8000)**

---

## 🔧 Required Environment Variables

Create a `.env` file inside **backend** folder:

```
OPENROUTER_API_KEY=your_openrouter_key
VOYAGE_API_KEY=your_voyage_embedding_key
QDRANT_URL=your_qdrant_cluster_url
QDRANT_API_KEY=your_qdrant_api_key
```

---

## 🧪 API Endpoints

| Method | Endpoint          | Description                    |
| ------ | ----------------- | ------------------------------ |
| `POST` | `/upload`         | Upload document or text        |
| `POST` | `/process_chunks` | Embedding + Qdrant store       |
| `POST` | `/chat`           | Ask question and get AI answer |

---

