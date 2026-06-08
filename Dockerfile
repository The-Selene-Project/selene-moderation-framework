FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --production

# Copy application code
COPY . .

# Run the bot
CMD ["npm", "start"]
