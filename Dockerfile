# ---------- Stage 1: Build ----------
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package.json and lock file
COPY package*.json ./

# Copy tsconfig.json
COPY tsconfig.json ./

#Copy .env
COPY .env ./

# Copy the rest of the source code
COPY . .

# Install dependencies (both deps and devDeps)
RUN npm install

# Compile TypeScript to JavaScript
RUN npm run build

# ---------- Stage 2: Production ----------
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy only necessary files from builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist

# Install only production dependencies
RUN npm install --omit=dev

# Expose the port used by Express (change if needed)
EXPOSE 3000

# Start the app
CMD ["node", "dist/app.js"]