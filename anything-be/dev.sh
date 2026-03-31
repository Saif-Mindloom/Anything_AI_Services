#!/bin/bash

# Development startup script for Anything AI Backend

echo "🚀 Starting Anything AI Backend in Development Mode..."

# Make sure we're in the right directory
cd "$(dirname "$0")"

# Use Docker-specific environment file
export ENV_FILE=.env.docker

# Build and start the containers with development overrides
docker compose --env-file .env.docker -f docker-compose.yml -f docker-compose.dev.yml up --build

# For production
# docker compose --env-file .env.docker -f docker-compose.yml up --build

echo "🎉 Development environment started!"
echo "📝 Your changes will now be automatically reloaded by nodemon"
echo "🌐 API available at: http://localhost:4000"
