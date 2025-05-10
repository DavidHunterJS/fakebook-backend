# Use Node.js LTS as the base image
FROM node:18-alpine

# Create app directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy the rest of the application code
COPY . .

# If you're using TypeScript, build the app
RUN npm run build

# The port your app will run on
EXPOSE 5000

# Command to run the app
CMD ["npm", "start"]