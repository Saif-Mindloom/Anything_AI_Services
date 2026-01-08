#!/bin/bash

# Anything AI MCP Integration - Setup Script
# This script sets up both MCP Server and LangGraph Service

set -e  # Exit on error

echo "🚀 Anything AI - MCP Integration Setup"
echo "======================================="
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Get the script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo -e "${BLUE}📦 Installing MCP Server dependencies...${NC}"
cd "$SCRIPT_DIR/mcp-server"
if [ ! -d "node_modules" ]; then
    npm install
    echo -e "${GREEN}✅ MCP Server dependencies installed${NC}"
else
    echo -e "${YELLOW}⏭️  MCP Server dependencies already installed${NC}"
fi

echo ""
echo -e "${BLUE}📦 Installing LangGraph Service dependencies...${NC}"
cd "$SCRIPT_DIR/langgraph-service"
if [ ! -d "node_modules" ]; then
    npm install
    echo -e "${GREEN}✅ LangGraph Service dependencies installed${NC}"
else
    echo -e "${YELLOW}⏭️  LangGraph Service dependencies already installed${NC}"
fi

echo ""
echo -e "${BLUE}🔨 Building MCP Server...${NC}"
cd "$SCRIPT_DIR/mcp-server"
npm run build
echo -e "${GREEN}✅ MCP Server built successfully${NC}"

echo ""
echo -e "${BLUE}🔨 Building LangGraph Service...${NC}"
cd "$SCRIPT_DIR/langgraph-service"
npm run build
echo -e "${GREEN}✅ LangGraph Service built successfully${NC}"

echo ""
echo -e "${GREEN}✨ Setup Complete!${NC}"
echo ""
echo "📋 Next Steps:"
echo "1. Configure environment variables:"
echo "   - Update mcp-server/.env"
echo "   - Update langgraph-service/.env"
echo "   - Update anything-be/.env (add LANGGRAPH_API_KEY)"
echo ""
echo "2. Update MCP_SERVER_ARGS in langgraph-service/.env:"
echo "   MCP_SERVER_ARGS=$SCRIPT_DIR/mcp-server/dist/index.js"
echo ""
echo "3. Start services:"
echo "   Option A (Docker): docker-compose up -d"
echo "   Option B (Manual):"
echo "     Terminal 1: cd mcp-server && npm run dev"
echo "     Terminal 2: cd langgraph-service && npm run dev"
echo ""
echo "4. Update n8n workflow to call http://localhost:3002/chat"
echo ""
echo "📚 See MCP_INTEGRATION_GUIDE.md for detailed instructions"
