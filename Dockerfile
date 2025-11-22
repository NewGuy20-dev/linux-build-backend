# Use a stable Debian release
FROM debian:bullseye-slim

# Set the working directory
WORKDIR /app

# Install Node.js, npm, and build tools
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    nodejs \
    npm \
    git \
    live-build \
    squashfs-tools \
    xorriso \
    syslinux \
    && rm -rf /var/lib/apt/lists/*

# Copy package.json and package-lock.json
COPY package*.json ./

# Install application dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the port the app runs on
EXPOSE 3000

# Run the application
CMD [ "npm", "run", "dev" ]
