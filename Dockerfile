FROM node:18-alpine

WORKDIR /app

# Copy backend dependencies first for caching
COPY backend/package.json backend/package-lock.json ./backend/

# Install dependencies inside backend folder
WORKDIR /app/backend
RUN npm install

# Return to root and copy logic
WORKDIR /app
COPY backend ./backend
COPY frontend ./frontend

# Expose port (Railway will override this at runtime but good for doc)
EXPOSE 3000

# Start server from backend directory
WORKDIR /app/backend
CMD ["npm", "start"]
