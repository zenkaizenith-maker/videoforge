# Use official Node.js LTS bookworm slim image
FROM node:24-bookworm-slim

# Install system FFmpeg and font packages for subtitle and slate rendering
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    fonts-dejavu-core \
    fonts-freefont-ttf \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install dependencies (ignoring scripts if any, install production/build deps)
RUN npm ci

# Copy project files needed for worker execution
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts

# Set default production environment settings
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4100

EXPOSE 4100

# Start worker using the verified npm run worker script
CMD ["npm", "run", "worker"]
