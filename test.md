# Dynamic OS Build Test Cases

This document outlines the steps to test the dynamic OS build pipeline.

## 1. Set up the environment

- Ensure you have Docker and `npm` installed.
- Create a `.env.local` file in the root of the project and add the following environment variables:
  ```
  DATABASE_URL="<your_neon_database_url>"
  DOCKERHUB_USERNAME="<your_dockerhub_username>"
  DOCKERHUB_TOKEN="<your_dockerhub_token>"
  DOCKERHUB_REPO="<your_dockerhub_repo>"
  CODESPACE_NAME="<your_codespace_name>"
  ```

## 2. Start the server

- Run `npm install` to install the dependencies.
- Run `npm run dev` to start the development server.

## 3. Trigger a build

- Send a `POST` request to `http://localhost:3000/api/build` with a JSON body.

### Example 1: Arch Linux (SteelOS)

This will produce both a Docker image and a (simulated) ISO.

```json
{
  "name": "SteelOS",
  "base": "arch",
  "kernel": "linux-zen",
  "packages": {
    "system": ["firewalld", "apparmor"],
    "dev": ["docker", "git", "neovim"],
    "browsers": ["firefox"]
  },
  "desktop": {},
  "security": {},
  "defaults": {}
}
```

### Example 2: Ubuntu

This will produce only a Docker image.

```json
{
  "name": "UbuntuDev",
  "base": "ubuntu",
  "kernel": "linux-generic",
  "packages": {
    "system": ["ufw"],
    "dev": ["build-essential", "git", "curl"],
    "browsers": ["chromium-browser"]
  },
  "desktop": {},
  "security": {},
  "defaults": {}
}
```

- The response will contain a `buildId`.

## 4. Monitor the build

- Connect to the WebSocket server at `ws://localhost:3000?buildId=<your_build_id>` to receive real-time build logs.
- You can also check the build status by sending a `GET` request to `http://localhost:3000/api/build/<your_build_id>`.

## 5. Verify the artifacts

- Once the build is complete, a Docker image will be pushed to `docker.io/<your_dockerhub_repo>:<your_build_id>`.
- If you built an Arch Linux distribution, a simulated ISO file will be available in the `artifacts/<your_build_id>` directory on the server.
- The build status will be updated to `complete` in the database.
