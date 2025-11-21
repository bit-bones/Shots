# Dockerfile for Shots game server
# Uses a small Node.js base image and runs the server with npm start

FROM node:18-alpine

# Create app directory
WORKDIR /app

# Install deps based on package-lock.json
COPY package*.json ./
RUN npm ci --only=production

# Copy rest of the app
COPY . .

# Set the PORT env (fly.toml expects 8080)
ENV PORT=8080
EXPOSE 8080

# Start the server using the package.json start script
CMD ["npm", "start"]
