FROM node:18-alpine

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including TypeScript)
RUN npm install

# Install required TypeScript type definitions
RUN npm install --save-dev @types/express @types/jsonwebtoken @types/bcryptjs @types/nodemailer @types/multer

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Prune development dependencies for smaller image
RUN npm prune --production

# Set up application
EXPOSE 5000
CMD ["node", "dist/app.js"]
