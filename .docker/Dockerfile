# Base image layer. This defines the OS and preinstalled node (+ npm)
# Offcial node 20 built on Alpine Linux (small).
FROM node:25-alpine

# Sets the working directory inside the image to /app in the container
WORKDIR /app

# Install Chromium + deps (Alpine)
# This is needed ONLY for puppetteer, it's not needed for the app itself. May be removed in the future
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Copies package.json and package-lock.json from the host folder into the /app in the image
COPY package*.json ./

# Command to be executed inside the image at BUILD time.
#   In production we need it instead of "npm install" because it's cleaner (remove node_modules before installing) and more deterministic
#   (doesn't edit package-lock.json or modify the node_modules under some circumstances).
#   --omit=dev removes the devDependancies because you don't care about them in production.
#   You can use npm install in development because you want devDependencies and you don't mind about possible non-determinism.
#   add --omit=dev to omit dev dependencies in production
RUN npm ci

# Production only (code backed into the image)
# Copy all the files and directories from the host machine to the current working directory inside the image (ex: /app)
# COPY . .

# It declares that container listens to port 3000. In the docker-compose you expose the port 3000 so it's reachable from the host
EXPOSE 3000

# Images default commads to be executed at RUNTIME. Must be in JSON array format.
# CMD ["npm", "start"]