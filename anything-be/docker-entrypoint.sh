#!/bin/bash
set -e

echo "🐳 Starting Anything AI Backend Docker Container..."

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
until pg_isready -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}"; do
  echo "Waiting for database connection..."
  sleep 2
done

echo "✅ PostgreSQL is ready!"

# Check if database exists, if not create it
echo "📝 Checking if database exists..."
PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -tc "SELECT 1 FROM pg_database WHERE datname = '${DB_NAME}'" | grep -q 1 || \
PGPASSWORD="${DB_PASSWORD}" psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -c "CREATE DATABASE \"${DB_NAME}\""

echo "✅ Database ready!"

# Run database migrations
echo "🔄 Running database migrations..."
npx sequelize-cli db:migrate

echo "✅ Migrations completed!"
echo "🚀 Starting application..."

# Execute the main command (passed as arguments to this script)
exec "$@"

