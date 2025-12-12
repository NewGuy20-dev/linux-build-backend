#!/bin/bash

# Quick curl test for build lifecycle
# Usage: API_KEY=your-key bash quick-curl-test.sh

echo "=== Quick Build Lifecycle Test ==="
echo ""

# API Key configuration
API_KEY="${API_KEY:-test-key}"
AUTH_HEADER="Authorization: Bearer $API_KEY"

# 1. Start build
echo "[1] Starting build..."
BUILD_RESPONSE=$(curl -s -X POST http://localhost:3000/api/build/start \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{"base":"arch","init":"systemd","kernel":{"version":"linux-lts"},"packages":{"base":["base","linux-lts"],"utils":["curl"]}}')

BUILD_ID=$(echo "$BUILD_RESPONSE" | jq -r '.buildId' 2>/dev/null)

if [ -z "$BUILD_ID" ] || [ "$BUILD_ID" = "null" ]; then
  echo "❌ Failed to start build"
  echo "$BUILD_RESPONSE"
  exit 1
fi

echo "✓ Build started: $BUILD_ID"
echo ""

# 2. Check status
echo "[2] Checking build status..."
curl -s -H "$AUTH_HEADER" http://localhost:3000/api/build/status/$BUILD_ID | jq '.status'
echo ""

# 3. Poll for completion (max 2 minutes)
echo "[3] Polling for completion (max 120 seconds)..."
for i in {1..24}; do
  STATUS=$(curl -s -H "$AUTH_HEADER" http://localhost:3000/api/build/status/$BUILD_ID | jq -r '.status')
  echo "  Attempt $i: $STATUS"
  
  if [[ "$STATUS" == "COMPLETED" || "$STATUS" == "FAILED" || "$STATUS" == "CANCELLED" ]]; then
    echo "✓ Build reached terminal state: $STATUS"
    break
  fi
  
  sleep 5
done
echo ""

# 4. Get final details
echo "[4] Final build details:"
curl -s -H "$AUTH_HEADER" http://localhost:3000/api/build/status/$BUILD_ID | jq '{status, createdAt, updatedAt, artifacts: (.artifacts | length), logs: (.logs | length)}'
