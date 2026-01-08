# Anything AI LangGraph Service

LangGraph-based service with supervisor agent that orchestrates between MCP tools (user data) and RAG (fashion knowledge).

## Features

- **Supervisor Agent**: Intelligent routing between data sources
- **MCP Integration**: Access to user wardrobe and outfit data via MCP protocol
- **RAG System**: Fashion knowledge base with PostgreSQL vector store
- **Smart Routing**: Automatically decides when to query user data vs fashion principles
- **RESTful API**: Easy integration with n8n and other services

## Architecture

```
┌─────────────────────────────────────────┐
│      Supervisor Agent (LangGraph)       │
│                                         │
│  ┌─────────────┐    ┌───────────────┐ │
│  │ MCP Agent   │    │  RAG Agent    │ │
│  │ (User Data) │    │  (Knowledge)  │ │
│  └─────────────┘    └───────────────┘ │
│         ↓                    ↓          │
│  ┌─────────────────────────────────┐  │
│  │   Response Generator            │  │
│  └─────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables in `.env`:

```env
PORT=3002
OPENAI_API_KEY=your-key
MCP_SERVER_COMMAND=node
MCP_SERVER_ARGS=/path/to/mcp-server/dist/index.js
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=anything_backend
API_KEY=your-secret-key
```

3. Build and run:

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## API Endpoints

### POST /chat

Process chat messages with context-aware responses.

**Request:**

```json
{
  "message": "The rating is low. How can I improve this outfit?",
  "userId": "123",
  "outfitId": 456,
  "rating": 6.5,
  "includeRating": true,
  "imageUrl": "https://..."
}
```

**Response:**

```json
{
  "success": true,
  "output": "Based on your wardrobe, I suggest replacing the current top with..."
}
```

### POST /rating

Generate outfit rating with fashion knowledge.

**Request:**

```json
{
  "userId": "123",
  "outfitId": 456,
  "imageUrl": "https://...",
  "chatInput": "Rate this outfit"
}
```

**Response:**

```json
{
  "success": true,
  "output": "7.5",
  "fullResponse": "This outfit rates 7.5/10 because..."
}
```

### GET /health

Health check endpoint.

## How It Works

1. **Request arrives** at `/chat` or `/rating`
2. **Supervisor analyzes** the query
3. **Routes to agents**:
   - MCP Agent: Queries wardrobe data if needed
   - RAG Agent: Searches fashion knowledge if needed
   - Both: For complex queries requiring data + knowledge
4. **Generates response** combining all context
5. **Returns** personalized, actionable advice

## Integration with n8n

Update your n8n workflow to call this service instead of OpenAI directly:

```javascript
// In n8n HTTP Request node
POST http://localhost:3002/chat
Headers:
  x-api-key: your-secret-key
Body:
{
  "message": "{{ $json.chatInput }}",
  "userId": "{{ $json.userId }}",
  "outfitId": {{ $json.outfitId }},
  "rating": {{ $json.rating }},
  "includeRating": {{ $json.includeRating }}
}
```
