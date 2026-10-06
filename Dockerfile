# Production Dockerfile for IPTV Web & FFmpeg Transcoder
FROM node:20-bookworm-slim

# Install FFmpeg and essential system certificates
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency definitions
COPY package*.json ./

# Install all dependencies
RUN npm install

# Copy application source code
COPY . .

# Build Vite frontend assets
RUN npm run build

# Create persistent data and transcode cache directories
RUN mkdir -p /app/data /app/transcode_cache

# Expose server port
EXPOSE 3000

# Set environment
ENV NODE_ENV=production
ENV PORT=3000
ENV FFMPEG_PATH=/usr/bin/ffmpeg
ENV DATABASE_PATH=/app/data/iptv.db

# Start application
CMD ["npm", "start"]
