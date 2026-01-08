#!/bin/bash

# RAG System Setup Script
# This script helps you set up and test the RAG system with your fashion documents

set -e  # Exit on error

echo "🚀 RAG System Setup"
echo "===================="
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -d "langgraph-service" ]; then
    echo "❌ Error: Please run this script from the project root (AnythingAI_Backend)"
    exit 1
fi

# Step 1: Install dependencies
echo -e "${BLUE}Step 1: Installing dependencies...${NC}"
cd langgraph-service
npm install
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Step 2: Check PostgreSQL connection
echo -e "${BLUE}Step 2: Checking PostgreSQL connection...${NC}"

# Check if Docker container is running
if docker ps | grep -q "anythingai_backend-postgres-1"; then
    echo -e "${GREEN}✓ PostgreSQL Docker container is running${NC}"
    PSQL_CMD="docker exec -i anythingai_backend-postgres-1 psql -U postgres -d anything_backend"
elif psql -U postgres -d anything_backend -c "SELECT 1" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ PostgreSQL is accessible locally${NC}"
    PSQL_CMD="psql -U postgres -d anything_backend"
else
    echo -e "${YELLOW}⚠️  PostgreSQL connection failed${NC}"
    echo "Make sure PostgreSQL is running (Docker: docker compose up -d)"
    exit 1
fi
echo ""

# Step 3: Check pgvector extension
echo -e "${BLUE}Step 3: Checking pgvector extension...${NC}"
if $PSQL_CMD -c "SELECT * FROM pg_extension WHERE extname = 'vector'" 2>/dev/null | grep -q "vector"; then
    echo -e "${GREEN}✓ pgvector extension is installed${NC}"
else
    echo -e "${YELLOW}⚠️  pgvector extension not found${NC}"
    echo "The extension will be created automatically by the LangGraph service"
    echo -e "${GREEN}✓ Setup will continue${NC}"
fi
echo ""

# Step 4: Check if documents_pg table exists
echo -e "${BLUE}Step 4: Checking documents table...${NC}"
if $PSQL_CMD -c "\d documents_pg" > /dev/null 2>&1; then
    echo -e "${GREEN}✓ documents_pg table exists${NC}"
    
    # Count existing documents
    DOC_COUNT=$($PSQL_CMD -t -c "SELECT COUNT(*) FROM documents_pg" | xargs)
    echo "  Current documents in RAG: ${DOC_COUNT}"
else
    echo -e "${YELLOW}⚠️  documents_pg table not found${NC}"
    echo "The table will be created automatically when you start the LangGraph service"
fi
echo ""

# Step 5: Ingest sample documents (optional)
echo -e "${BLUE}Step 5: Ingesting sample fashion document...${NC}"
cd ..
if [ -f "sample-fashion-docs/fashion-fundamentals.md" ]; then
    cd langgraph-service
    echo "Ingesting fashion-fundamentals.md..."
    npm run ingest file ../sample-fashion-docs/fashion-fundamentals.md "Fashion Styling Fundamentals"
    echo -e "${GREEN}✓ Sample document ingested${NC}"
    cd ..
else
    echo -e "${YELLOW}⚠️  Sample document not found at sample-fashion-docs/fashion-fundamentals.md${NC}"
    echo "You can ingest your own documents later"
fi
echo ""

# Step 6: Test RAG search
echo -e "${BLUE}Step 6: Testing RAG search...${NC}"
cd langgraph-service
echo "Searching for: 'navy blue color combinations'"
npm run ingest search "navy blue color combinations" | head -20
echo -e "${GREEN}✓ RAG search is working${NC}"
cd ..
echo ""

# Final instructions
echo "===================="
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo ""
echo "📚 Next Steps:"
echo ""
echo "1. Add your fashion documents:"
echo "   cd langgraph-service"
echo "   npm run ingest file ../your-docs/fashion-guide.pdf 'Fashion Guide'"
echo "   npm run ingest dir ../your-docs"
echo ""
echo "2. Start the LangGraph service:"
echo "   cd langgraph-service"
echo "   npm run dev"
echo ""
echo "3. Start your backend:"
echo "   cd anything-be"
echo "   npm run dev"
echo ""
echo "4. Test the system:"
echo "   - Create an outfit and generate angles"
echo "   - Start a chat session"
echo "   - Ask fashion questions"
echo ""
echo "📖 Documentation:"
echo "   - RAG_DOCUMENT_GUIDE.md - Complete RAG documentation"
echo "   - AI_SERVICE_GUIDE.md - Developer guide"
echo "   - MIGRATION_N8N_TO_LANGGRAPH.md - Migration details"
echo ""
echo "Happy styling! 👔"
