# AnythingAI Backend

A GraphQL-based backend service built with Node.js, TypeScript, and Apollo Server, featuring AI-powered clothing detection and virtual try-on capabilities.

## Features

- 🔐 User authentication with JWT
- 👕 Apparel management and categorization
- 🤖 AI-powered clothing detection (Clarifai)
- 🖼️ Background removal and image processing
- 👗 Virtual try-on and outfit generation
- 📐 Multiple angle generation for outfits
- ⭐ Automated outfit rating via n8n webhooks
- 📅 Calendar integration for outfit planning
- 🧠 AI chat powered by Google Gemini

## Tech Stack

- **Backend**: Node.js, TypeScript, Express
- **API**: Apollo GraphQL
- **Database**: PostgreSQL with Sequelize ORM
- **AI Services**: Google Gemini, Clarifai
- **Image Processing**: Python (IS-Net), Sharp
- **Storage**: Google Cloud Storage (GCS)
- **Queue System**: BullMQ with Redis
- **Workflow Automation**: n8n webhooks
- **Deployment**: Docker

## Prerequisites

- Node.js 16+
- Docker & Docker Compose
- PostgreSQL (or use Docker)
- Python 3.8+ (for image processing)

## Quick Start

### 1. Environment Setup

Create a `.env` file in the root directory:

```env
# Server
PORT=4000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=anything_db
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_jwt_secret

# Google Cloud Storage
# Authentication uses Application Default Credentials (ADC)
# Set up with: gcloud auth application-default login
GCS_BUCKET_NAME=your_bucket_name

# AI Services
GOOGLE_API_KEY=your_gemini_key
CLARIFAI_API_KEY=your_clarifai_key

# n8n Webhooks
N8N_RATING_WEBHOOK_URL=http://localhost:5678/webhook-test/rating

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
```

### 2. Install Dependencies

```bash
npm install
pip install -r requirements.txt
```

### 3. Database Setup

```bash
# Start PostgreSQL with Docker
npm run db:up

# Run migrations
npm run migrate
```

### 4. Run Development Server

**Option A: Local Development**

```bash
npm run dev
```

**Option B: Docker Development**

```bash
npm run dev:docker
# or
./dev.sh
```

The GraphQL playground will be available at `http://localhost:4000/graphql`

## Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build TypeScript
- `npm start` - Start production server
- `npm run migrate` - Run database migrations
- `npm run db:up` - Start PostgreSQL with Docker
- `npm run db:down` - Stop PostgreSQL

## Project Structure

```
src/
├── models/          # Sequelize models
├── resolvers/       # GraphQL resolvers
├── schema/          # GraphQL type definitions
├── services/        # Business logic
│   └── n8nWebhookService.ts  # n8n webhook integration
├── queues/          # BullMQ job queues
├── migrations/      # Database migrations
├── config/          # Configuration files
└── types/           # TypeScript type definitions
```

## API Documentation

GraphQL playground is available at `/graphql` when running the server.

### Example Queries

**Create User**

```graphql
mutation {
  signUp(
    input: {
      email: "user@example.com"
      password: "password123"
      name: "John Doe"
    }
  ) {
    token
    user {
      id
      email
      name
    }
  }
}
```

**Upload Apparel**

```graphql
mutation {
  uploadApparel(input: { image: "image_url", category: "shirt" }) {
    id
    imageUrl
    category
  }
}
```

**Generate Outfit Angles with Rating**

```graphql
mutation {
  generateOutfitAngles(outfitId: 123) {
    success
    message
    anglesGenerated
  }
}
```

**Get Outfit Details with Rating**

```graphql
query {
  getOutfitDetails(outfitId: 123) {
    success
    outfit {
      id
      primaryImageUrl
      imageList
      rating
    }
  }
}
```

## n8n Integration

This backend integrates with n8n for automated outfit rating. When multiple angles are generated for an outfit, the system automatically:

1. Generates 5 angle views (0°, 45°, 90°, 135°, 180°)
2. Calls the n8n rating webhook with the front-facing (90°) image
3. Stores the rating in the database

See [N8N_INTEGRATION_GUIDE.md](./N8N_INTEGRATION_GUIDE.md) for detailed setup and frontend integration instructions.

## Docker Deployment

```bash
# Build and start the containers with development overrides
docker compose --env-file .env.docker -f docker-compose.yml -f docker-compose.dev.yml up --build

# For production
docker compose --env-file .env.docker -f docker-compose.yml up --build
```

## License

ISC

## Author

AnythingAI Team
