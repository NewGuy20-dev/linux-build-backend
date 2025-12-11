#!/bin/bash

# Linux Builder Engine - Build Lifecycle Test Script
# This script tests the complete build lifecycle: start -> status -> download
# Usage: API_KEY=your-key bash test-build-lifecycle.sh

set -e

# Configuration
BASE_URL="http://localhost:3000"
BUILD_ID=""
API_KEY="${API_KEY:-test-key}"
AUTH_HEADER="Authorization: Bearer $API_KEY"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Linux Builder Engine - Build Lifecycle Test ===${NC}\n"

# Step 1: Start a build
echo -e "${YELLOW}[1/4] Starting a new build...${NC}"
START_RESPONSE=$(curl -s -X POST "$BASE_URL/api/build/start" \
  -H "Content-Type: application/json" \
  -H "$AUTH_HEADER" \
  -d '{
    "base": "arch",
    "architecture": "x86_64",
    "init": "systemd",
    "kernel": {
      "version": "linux-lts",
      "customFlags": [],
      "modules": {
        "enable": [],
        "disable": []
      }
    },
    "filesystem": {
      "root": "ext4",
      "encryption": null,
      "compression": false,
      "partitions": [],
      "lvm": false,
      "raid": false
    },
    "display": null,
    "packages": {
      "base": ["base", "linux-lts", "linux-firmware"],
      "development": ["git", "vim"],
      "utils": ["curl", "wget"]
    },
    "securityFeatures": {
      "firewall": {
        "backend": "nftables",
        "policy": "deny",
        "rules": []
      }
    },
    "customization": {
      "shell": "bash"
    }
  }')

echo -e "${GREEN}Response:${NC}"
echo "$START_RESPONSE" | jq '.' 2>/dev/null || echo "$START_RESPONSE"

# Extract build ID
BUILD_ID=$(echo "$START_RESPONSE" | jq -r '.buildId' 2>/dev/null)

if [ -z "$BUILD_ID" ] || [ "$BUILD_ID" = "null" ]; then
  echo -e "${RED}Failed to extract build ID from response${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Build started with ID: $BUILD_ID${NC}\n"

# Step 2: Check build status (initial)
echo -e "${YELLOW}[2/4] Checking initial build status...${NC}"
STATUS_RESPONSE=$(curl -s -X GET "$BASE_URL/api/build/status/$BUILD_ID" -H "$AUTH_HEADER")

echo -e "${GREEN}Response:${NC}"
echo "$STATUS_RESPONSE" | jq '.' 2>/dev/null || echo "$STATUS_RESPONSE"

STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.status' 2>/dev/null)
echo -e "${GREEN}✓ Build status: $STATUS${NC}\n"

# Step 3: Poll for build completion (with timeout)
echo -e "${YELLOW}[3/4] Polling for build completion (timeout: 5 minutes)...${NC}"
TIMEOUT=300
ELAPSED=0
POLL_INTERVAL=5

while [ $ELAPSED -lt $TIMEOUT ]; do
  STATUS_RESPONSE=$(curl -s -X GET "$BASE_URL/api/build/status/$BUILD_ID" -H "$AUTH_HEADER")
  STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.status' 2>/dev/null)
  
  echo -e "  Status: ${BLUE}$STATUS${NC} (elapsed: ${ELAPSED}s)"
  
  if [ "$STATUS" = "COMPLETED" ] || [ "$STATUS" = "FAILED" ] || [ "$STATUS" = "CANCELLED" ]; then
    break
  fi
  
  sleep $POLL_INTERVAL
  ELAPSED=$((ELAPSED + POLL_INTERVAL))
done

if [ $ELAPSED -ge $TIMEOUT ]; then
  echo -e "${YELLOW}⚠ Build polling timeout reached${NC}"
else
  echo -e "${GREEN}✓ Build reached terminal state: $STATUS${NC}\n"
fi

# Step 4: Get final status and artifacts
echo -e "${YELLOW}[4/4] Retrieving final build status and artifacts...${NC}"
FINAL_RESPONSE=$(curl -s -X GET "$BASE_URL/api/build/status/$BUILD_ID" -H "$AUTH_HEADER")

echo -e "${GREEN}Final Response:${NC}"
echo "$FINAL_RESPONSE" | jq '.' 2>/dev/null || echo "$FINAL_RESPONSE"

# Extract download URLs if available
DOCKER_IMAGE=$(echo "$FINAL_RESPONSE" | jq -r '.downloadUrls.dockerImage // empty' 2>/dev/null)
DOCKER_TAR=$(echo "$FINAL_RESPONSE" | jq -r '.downloadUrls.dockerTarDownloadUrl // empty' 2>/dev/null)
ISO=$(echo "$FINAL_RESPONSE" | jq -r '.downloadUrls.isoDownloadUrl // empty' 2>/dev/null)

if [ -n "$DOCKER_IMAGE" ]; then
  echo -e "${GREEN}✓ Docker Image: $DOCKER_IMAGE${NC}"
fi

if [ -n "$DOCKER_TAR" ]; then
  echo -e "${GREEN}✓ Docker TAR Download: $BASE_URL$DOCKER_TAR${NC}"
fi

if [ -n "$ISO" ]; then
  echo -e "${GREEN}✓ ISO Download: $BASE_URL$ISO${NC}"
fi

echo -e "\n${GREEN}=== Build Lifecycle Test Complete ===${NC}"
echo -e "Build ID: ${BLUE}$BUILD_ID${NC}"
echo -e "Final Status: ${BLUE}$STATUS${NC}"
