# Frontend Implementation: AI Prompt Feature

## Overview

Implement a feature that allows users to describe their desired Linux OS in natural language. The backend will use AI (Ollama + Qwen3) to convert the prompt into a build specification and start the build.

## API Endpoint

**POST** `/api/build/start`

The endpoint now accepts **two formats**:

### Option 1: Natural Language Prompt (AI-powered)
```json
{
  "prompt": "I want a gaming PC with Steam, Hyprland, and good performance"
}
```

### Option 2: Direct JSON Spec (skip AI)
```json
{
  "base": "arch",
  "kernel": "linux-zen",
  "packages": ["steam", "firefox", "hyprland"]
}
```

## Response

```json
{
  "buildId": "abc123xyz",
  "spec": {
    "base": "arch",
    "kernel": "linux-zen",
    "packages": ["steam", "firefox", "hyprland", ...],
    ...
  }
}
```

## UI Requirements

### 1. Prompt Input
- Add a text input or textarea where users can type their OS description
- Placeholder text: "Describe your ideal Linux OS..."
- Examples to show users:
  - "Gaming PC with Steam and Hyprland"
  - "Privacy-focused OS with Tor and VPN"
  - "Minimal development environment with Node.js and Python"
  - "Lightweight server with Docker support"

### 2. Submit Button
- Label: "Generate & Build" or "Create My OS"
- Should be disabled while request is in progress

### 3. Loading State
- Show loading indicator during AI generation (~10-30 seconds)
- Display message: "AI is generating your build specification..."

### 4. Response Display
- After successful response, show the generated `spec` to the user
- Allow user to review before confirming the build OR auto-start build
- Display the `buildId` for tracking

### 5. Error Handling
Handle these error cases:
- Empty prompt: "Please describe your desired OS"
- AI error: "Failed to generate specification. Please try again."
- Network error: "Connection failed. Please check your network."

## Example Flow

```
1. User types: "I want a security-focused OS with Tor browser and firewall"
2. User clicks "Generate & Build"
3. Frontend shows loading: "AI is generating your build specification..."
4. Frontend sends POST to /api/build/start with { prompt: "..." }
5. Backend responds with { buildId, spec }
6. Frontend shows generated spec and redirects to build status page
```

## Optional Enhancements

1. **Preview Mode**: Add a "Preview Only" button that calls `/api/build/generate` to see the spec without starting a build
2. **Edit Before Build**: Let users modify the generated JSON before confirming
3. **Prompt Templates**: Provide clickable templates for common use cases
4. **History**: Save recent prompts in localStorage

## Notes

- AI response time is ~10-30 seconds (running on CPU)
- The backend validates the AI output against the schema before building
- If AI returns invalid JSON, the request will fail with an error
