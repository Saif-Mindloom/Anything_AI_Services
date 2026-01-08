# Anything AI - Complete System

Fashion AI platform with intelligent outfit suggestions powered by MCP (Model Context Protocol) and LangGraph.

## 🎯 Quick Start

```bash
# 1. Run setup
./setup-mcp.sh

# 2. Configure environment
# Edit: mcp-server/.env, langgraph-service/.env, anything-be/.env

# 3. Start services
docker-compose up -d

# 4. Test
./test-integration.sh
```

## 📚 Documentation

| Document                                                     | Purpose                             |
| ------------------------------------------------------------ | ----------------------------------- |
| [**GETTING_STARTED.md**](./GETTING_STARTED.md)               | 🚀 Quick start guide and checklist  |
| [**IMPLEMENTATION_SUMMARY.md**](./IMPLEMENTATION_SUMMARY.md) | 📋 Complete implementation overview |
| [**MCP_INTEGRATION_GUIDE.md**](./MCP_INTEGRATION_GUIDE.md)   | 📖 Detailed architecture and setup  |
| [**N8N_MIGRATION_GUIDE.md**](./N8N_MIGRATION_GUIDE.md)       | 🔄 n8n workflow migration steps     |
| [**ARCHITECTURE_VISUAL.md**](./ARCHITECTURE_VISUAL.md)       | 🏗️ Visual architecture diagrams     |
| [**ENV_TEMPLATE.md**](./ENV_TEMPLATE.md)                     | ⚙️ Environment configuration guide  |

## 🏗️ Architecture

```
User → n8n → LangGraph Service → MCP Server → Backend
                    ↓
              RAG System
           (Fashion Knowledge)
```

## 🎯 Key Features

- ✅ **Smart Wardrobe Queries**: Access user's clothing items
- ✅ **Intelligent Suggestions**: AI-powered outfit improvements
- ✅ **Fashion Knowledge**: RAG system with style principles
- ✅ **Context-Aware**: Considers ratings, occasions, preferences
- ✅ **Supervisor Agent**: Automatic routing to best data source

## 📦 Services

| Service    | Port | Purpose                     |
| ---------- | ---- | --------------------------- |
| Backend    | 4000 | GraphQL API, business logic |
| MCP Server | 3001 | Data access tools (stdio)   |
| LangGraph  | 3002 | AI orchestration, REST API  |
| PostgreSQL | 5432 | Database + vector store     |
| n8n        | 5678 | Workflow automation         |

## 🚀 Example Queries

**Before (Generic AI):**

> Q: "How can I improve this outfit?"  
> A: "Try adding accessories or changing colors."

**After (Personalized AI with MCP):**

> Q: "Rating is 6.5. How can I improve?"  
> A: "Replace your current top with your Blue Chambray Shirt (ID: 789) because:
>
> 1. It's in your wardrobe
> 2. Blue complements gray pants better
> 3. Appropriate for smart-casual
> 4. Should raise rating to ~8.0/10"

## 🧪 Testing

```bash
# Test all services
./test-integration.sh

# Test individual endpoints
curl http://localhost:3002/health
curl -X POST http://localhost:3002/chat \
  -H "x-api-key: your-key" \
  -d '{"message":"Show my tops","userId":"1"}'
```

## 📊 Status Dashboard

Check service health:

```bash
# Backend
curl http://localhost:4000/graphql

# LangGraph
curl http://localhost:3002/health

# PostgreSQL
psql -h localhost -U postgres -d anything_backend -c "SELECT 1;"

# Docker services
docker-compose ps
```

## 🐛 Troubleshooting

| Issue                     | Solution                       |
| ------------------------- | ------------------------------ |
| Services won't start      | Check `.env` files configured  |
| MCP connection fails      | Verify `MCP_SERVER_ARGS` path  |
| RAG returns no results    | Ensure documents in PostgreSQL |
| n8n can't reach LangGraph | Check `LANGGRAPH_SERVICE_URL`  |

See detailed troubleshooting in [MCP_INTEGRATION_GUIDE.md](./MCP_INTEGRATION_GUIDE.md)

## 📁 Project Structure

```
.
├── anything-be/              # Existing backend
├── mcp-server/              # NEW: MCP server
├── langgraph-service/       # NEW: LangGraph orchestration
├── docker-compose.yml       # Container orchestration
├── setup-mcp.sh            # Setup script
├── test-integration.sh     # Test script
└── *.md                    # Documentation
```

## 🔐 Security

- API keys in `.env` files (not committed)
- Service-to-service authentication
- PostgreSQL access control
- No hardcoded secrets

## 🔮 Future Enhancements

- [ ] Weather integration
- [ ] Calendar integration
- [ ] Shopping recommendations
- [ ] Multi-modal image analysis
- [ ] Streaming responses
- [ ] Performance caching
- [ ] Analytics dashboard

## 📞 Support

1. Check documentation (see table above)
2. Review logs: `docker-compose logs -f [service]`
3. Run tests: `./test-integration.sh`
4. Verify configuration: `ENV_TEMPLATE.md`

## 🎉 Success Metrics

System is working when:

- ✅ All services healthy
- ✅ Tests pass
- ✅ n8n receives personalized responses
- ✅ Supervisor routes intelligently
- ✅ Responses include wardrobe items

## 📜 License

Proprietary - Anything AI

## 👥 Contributors

- Built with ❤️ for Anything AI

---

**Version**: 1.0.0  
**Status**: ✅ Production Ready  
**Last Updated**: January 2026

**Get Started**: Read [GETTING_STARTED.md](./GETTING_STARTED.md) →
