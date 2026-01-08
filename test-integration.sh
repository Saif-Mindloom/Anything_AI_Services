#!/bin/bash

# Quick Test Script for MCP Integration
# Tests all services and endpoints

set -e

echo "🧪 Testing MCP Integration"
echo "=========================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test counter
PASSED=0
FAILED=0

# Helper function
test_endpoint() {
    local name="$1"
    local url="$2"
    local expected="$3"
    
    echo -n "Testing $name... "
    
    if response=$(curl -s "$url" 2>&1); then
        if echo "$response" | grep -q "$expected"; then
            echo -e "${GREEN}✅ PASS${NC}"
            ((PASSED++))
        else
            echo -e "${RED}❌ FAIL${NC} (unexpected response)"
            echo "  Response: $response"
            ((FAILED++))
        fi
    else
        echo -e "${RED}❌ FAIL${NC} (connection error)"
        ((FAILED++))
    fi
}

echo "1️⃣  Testing Backend..."
test_endpoint "Backend GraphQL" "http://localhost:4000/graphql" "query"

echo ""
echo "2️⃣  Testing LangGraph Service..."
test_endpoint "LangGraph Health" "http://localhost:3002/health" "healthy"

echo ""
echo "3️⃣  Testing LangGraph Chat Endpoint..."
echo -n "Testing Chat API... "
if response=$(curl -s -X POST http://localhost:3002/chat \
    -H "Content-Type: application/json" \
    -H "x-api-key: langgraph-service-secret-key-change-in-production" \
    -d '{"message": "Hello", "userId": "1"}' 2>&1); then
    if echo "$response" | grep -q "success"; then
        echo -e "${GREEN}✅ PASS${NC}"
        ((PASSED++))
    else
        echo -e "${YELLOW}⚠️  WARN${NC} (check API key and configuration)"
        echo "  Response: $response"
        ((FAILED++))
    fi
else
    echo -e "${RED}❌ FAIL${NC}"
    ((FAILED++))
fi

echo ""
echo "4️⃣  Testing PostgreSQL..."
echo -n "Testing PostgreSQL connection... "
if command -v psql &> /dev/null; then
    if psql -h localhost -U postgres -d anything_backend -c "SELECT 1;" &> /dev/null; then
        echo -e "${GREEN}✅ PASS${NC}"
        ((PASSED++))
    else
        echo -e "${RED}❌ FAIL${NC} (can't connect)"
        ((FAILED++))
    fi
else
    echo -e "${YELLOW}⏭️  SKIP${NC} (psql not installed)"
fi

echo ""
echo "📊 Test Results"
echo "==============="
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed!${NC}"
    echo ""
    echo "✅ Your MCP integration is working correctly!"
    echo ""
    echo "Next steps:"
    echo "1. Update n8n workflow (see N8N_MIGRATION_GUIDE.md)"
    echo "2. Test with real user data"
    echo "3. Deploy to production"
    exit 0
else
    echo -e "${RED}⚠️  Some tests failed${NC}"
    echo ""
    echo "Troubleshooting:"
    echo "1. Check services are running: docker-compose ps"
    echo "2. Check logs: docker-compose logs -f"
    echo "3. Verify .env files are configured"
    echo "4. See GETTING_STARTED.md for help"
    exit 1
fi
