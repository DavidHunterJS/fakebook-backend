FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies - explicitly NOT using --only=production
RUN npm install

# Copy source code
COPY . .

# Make sure node_modules/.bin is in PATH
# This is crucial for npm scripts to find local binaries like tsc
ENV PATH="/app/node_modules/.bin:${PATH}"

# Verify TypeScript is installed and PATH is set correctly
RUN echo "PATH = $PATH" && \
    which tsc || echo "tsc not in PATH" && \
    ls -la node_modules/.bin/tsc || echo "tsc not found in node_modules/.bin" 

# Build the application with the enhanced PATH
RUN npm run build

# Prune development dependencies for smaller image
RUN npm prune --production

# Set up application
EXPOSE 5000
CMD ["node", "dist/app.js"]
