# RAG Chatbot Backend

Production-ready Express API powering the RAG chatbot. Provides chat endpoints, session storage, embeddings ingestion, and Socket.IO for realtime events.

## Tech Stack

- Node.js, Express, Socket.IO
- Qdrant (vector DB) via @qdrant/js-client-rest
- Redis (sessions, caching) via ioredis
- Jina AI Embeddings API
- Google Generative AI (Gemini)
- Helmet, CORS, express-rate-limit

## Project Deployment
**View Project**
[view Demo project](https://rag-powered-chatbot-frontend-m5jbzw8kx.vercel.app)

### Clone the Repository

```bash
git clone https://github.com/vishnuu5/RAG-Powered-Chatbot-backend.git
cd rag-chatbot
```

## Environment Variables

Create a `.env` from the example below:

```bash
FRONTEND_URL=http://localhost:5173
PORT=3000
GEMINI_API_KEY=
GEMINI_MODEL=gemini-1.5-flash
JINA_API_KEY=
JINA_CHAT_TIMEOUT_MS=8000
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
REDIS_URL=
SESSION_TTL=86400
```

You may set only `REDIS_URL` if using Redis Cloud (`rediss://user:pass@host:port`).

## Install & Run (Local)

```bash
npm install
npm run dev
```

Server starts on `PORT` (default 3000). Health: `GET /health`.

## API

- POST `/api/session/create` → creates a session id
- GET `/api/session/:sessionId/history` → returns recent messages
- GET `/api/session/:sessionId/stats` → aggregate stats
- DELETE `/api/session/:sessionId` → clears a session
- POST `/api/chat/message` → { sessionId, message } returns response + sources
- POST `/api/chat/stream` → Server-Sent Events stream for message

## Ingestion

Fetches RSS feeds, scrapes content, embeds with Jina, and upserts into Qdrant.

```bash
node scripts/ingestNews.js
```

- Embeddings: `services/embeddings.js` (retry/backoff, caching)
- Vector DB: `config/vectordb.js` (`addDocument`, `searchSimilarDocuments`)
- Redis cache/session: `config/redis.js`

## Deployment

Render:

- Build: `npm install`
- Start: `node server.js`
- Environment vars: set all from `.env` above
- Health check: `/health`
- WebSockets: enabled by default

Set `FRONTEND_URL` to your Vercel URL for CORS and Socket.IO origin.

## Design Notes

- Graceful fallbacks when API keys missing or rate-limited:
  - Chat skips retrieval if embeddings unavailable or timeout
  - Fetches a few documents directly from Qdrant as a minimal context fallback
  - LLM returns a helpful fallback if Gemini not configured/available
- Short chat-time embedding timeout to prevent UI request timeouts

## License

MIT
