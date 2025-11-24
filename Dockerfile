# Use the official Node.js image for building
FROM node:18 AS build

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the project
COPY . .

# Run the build script to inject SERVER_URL
RUN node build.js

# Use Node.js with nginx for both static files and WebSocket server
FROM node:18-alpine

# Install nginx
RUN apk add --no-cache nginx

# Copy nginx config
COPY nginx.conf /etc/nginx/http.d/default.conf

# Copy built static files
COPY --from=build /app/public /usr/share/nginx/html

# Copy server files
COPY --from=build /app/server.js /app/package*.json /app/

# Copy node_modules from build stage
COPY --from=build /app/node_modules /app/node_modules

# Expose ports
EXPOSE 80 3001

# Start both nginx and the WebSocket server
CMD ["sh", "-c", "nginx -g 'daemon off;' & node /app/server.js"]