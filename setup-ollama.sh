#!/bin/bash

echo "=== Linux Build Backend - Ollama Setup ==="
echo ""

# Check if Ollama is already installed
if command -v ollama &> /dev/null; then
    echo "✓ Ollama is already installed"
else
    echo "Installing Ollama..."
    curl -fsSL https://ollama.com/install.sh | sh
    echo "✓ Ollama installed"
fi

echo ""

# Start Ollama server if not running
if curl -s http://127.0.0.1:11434/api/tags > /dev/null 2>&1; then
    echo "✓ Ollama server is already running"
else
    echo "Starting Ollama server..."
    ollama serve > /dev/null 2>&1 &
    sleep 3
    echo "✓ Ollama server started"
fi

echo ""

# Pull base Qwen3:1.7b model
echo "Pulling Qwen3:1.7b base model (this may take a few minutes)..."
ollama pull qwen3:1.7b

echo ""

# Create custom model with system prompt
echo "Creating custom linux-builder model with system prompt..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ollama create linux-builder -f "$SCRIPT_DIR/Modelfile"
echo "✓ Custom model 'linux-builder' created"

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Ollama is running at: http://127.0.0.1:11434"
echo "Custom model: linux-builder (based on qwen3:1.7b)"
echo ""
echo "You can now start the backend with: npm run dev"
