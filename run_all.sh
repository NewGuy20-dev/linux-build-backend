#!/bin/bash
set -e

# Clean up any previous dev servers
pkill -f "ts-node src/index.ts" || true
pkill -f "nodemon --watch 'src/**/*.ts'" || true

# Install python deps
python3 -m pip install requests

# Cleanup previous containers if any
docker rm -f registry || true

# Start Registry
echo "Starting Registry..."
docker run -d -p 5000:5000 --restart=always --name registry registry:2

export DOCKER_REGISTRY_URL=localhost:5000

# Setup DB
echo "Setting up DB..."
npx prisma generate
npx prisma db push

# Start App
echo "Starting App..."
npm run dev > server.log 2>&1 &
PID=$!

# Run Test
echo "Running Test..."
if python3 test_pipeline.py; then
    echo "TEST PASSED"
    kill $PID
    exit 0
else
    echo "TEST FAILED"
    echo "Server Logs:"
    cat server.log
    kill $PID
    exit 1
fi
