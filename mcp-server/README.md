# Anything AI MCP Server

Model Context Protocol (MCP) server that exposes Anything AI backend data as tools for AI agents.

## Features

- **get_user_apparels**: Retrieve user's wardrobe items with filtering
- **get_outfit_details**: Get complete outfit information including all apparel items
- **get_user_profile**: Access user profile data
- **suggest_apparels**: AI-powered apparel suggestions to improve outfit ratings

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables in `.env`:

```env
BACKEND_GRAPHQL_URL=http://localhost:4000/graphql
MCP_SERVER_PORT=3001
MCP_API_KEY=your-secret-key
```

3. Build and run:

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## Usage

This MCP server communicates via stdio protocol. It's designed to be used by:

- LangGraph service for AI agent integration
- n8n workflows via MCP client
- Any MCP-compatible client

## Tools

### get_user_apparels

Get all clothing items from a user's wardrobe.

```json
{
  "userId": "123",
  "category": "top",
  "colors": ["blue", "black"],
  "favorite": true
}
```

### get_outfit_details

Get complete information about a specific outfit.

```json
{
  "userId": "123",
  "outfitId": 456
}
```

### get_user_profile

Get user profile information.

```json
{
  "userId": "123"
}
```

### suggest_apparels

Get AI-powered suggestions to improve an outfit.

```json
{
  "userId": "123",
  "outfitId": 456,
  "targetCategory": "top",
  "currentRating": 6.5,
  "preferredColors": ["blue", "white"]
}
```
