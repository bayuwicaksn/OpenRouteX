# Stage 1: Build the React Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
# Tailwind V4 workaround: ensure types are generated if needed, but build should handle it
RUN npm run build

# Stage 2: Build the Node.js Backend
FROM node:20-alpine AS backend-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 3: Runtime
FROM node:20-alpine
WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built backend
COPY --from=backend-builder /app/dist ./dist

# Copy built frontend to the expected location for serving
# The proxy.ts expects client/dist relative to CWD
COPY --from=frontend-builder /app/client/dist ./client/dist

# Expose the configured port
ENV PORT=3402
EXPOSE 3402

# Persist data
VOLUME ["/app/data"]

# Start the proxy
CMD ["node", "dist/cli.js", "start", "--port", "3402"]
