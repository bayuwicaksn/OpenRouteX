# Stage 1: Build the React Frontend
FROM node:20-slim AS frontend-builder
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# Stage 2: Build the Node.js Backend
FROM node:20-slim AS backend-builder
WORKDIR /app
COPY package.json package-lock.json ./
# Install build tools for native modules (better-sqlite3)
RUN apt-get update && apt-get install -y python3 make g++
RUN npm ci
COPY . .
RUN npm run build

# Stage 3: Runtime
FROM node:20-slim
WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
# Need build tools for better-sqlite3 even for prod install
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*
RUN npm ci --omit=dev --ignore-scripts
# Rebuild native modules after ignoring scripts
RUN npm rebuild better-sqlite3

# Copy built backend
COPY --from=backend-builder /app/dist ./dist

# Copy built frontend
COPY --from=frontend-builder /app/client/dist ./client/dist

# Expose port
ENV PORT=3402
EXPOSE 3402

# Persist data
VOLUME ["/app/data"]

# Start the proxy
CMD ["node", "dist/cli.js", "start", "--port", "3402"]
