# Use Node.js 18 LTS as base image
FROM node:18-alpine

# Install all system dependencies including HEIC support BEFORE npm install
# This ensures Sharp can detect and use the codecs during installation
RUN apk add --no-cache \
    bash \
    postgresql-client \
    python3 \
    make \
    g++ \
    libheif \
    libheif-dev \
    libde265 \
    libde265-dev \
    x265 \
    x265-dev \
    aom-libs \
    aom-dev

# Create app directory
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies - Sharp will now detect and use libheif
RUN npm install

# Rebuild Sharp with HEIC support to ensure native bindings are correct
RUN npm rebuild sharp

# Copy all application files
COPY . .

# Build TypeScript to JavaScript
RUN npm run build:docker
COPY src/schema ./dist/schema
# Make entrypoint script executable
RUN chmod +x docker-entrypoint.sh

# Expose application port
EXPOSE 4000

# Use entrypoint script
ENTRYPOINT ["docker-entrypoint.sh"]

# Default command - run the compiled JavaScript
CMD ["node", "dist/index.js"]

