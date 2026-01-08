FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Expose MCP server port (if needed for HTTP)
EXPOSE 3001

# Run the server
CMD ["node", "dist/index.js"]
