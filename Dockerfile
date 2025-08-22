FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (using npm install instead of ci)
RUN npm install --omit=dev

# Copy application files
COPY . .

# Expose port
EXPOSE 3001

# Start the application
CMD ["node", "src/app.js"]
