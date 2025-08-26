FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies with retries and longer timeout
RUN npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5 && \
    npm install --production --verbose

# Copy application files
COPY . .

# Expose port
EXPOSE 3001

# Start the application
CMD ["node", "src/app.js"]
