# Linux Builder Engine Backend

This is the backend for the Linux Builder Engine, a service that generates custom Linux OS builds using Docker containers.

## Tech Stack

- **Runtime:** Node.js (latest LTS)
- **Language:** TypeScript
- **Framework:** Express.js
- **ORM:** Prisma + Neon PostgreSQL
- **Container runtime:** Docker CLI
- **WebSockets:** ws (npm package)
- **Environment:** DevContainer (Codespaces)

## Getting Started

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/linux-builder-engine.git
    ```

2.  **Open in a Dev Container:**
    This project is configured to run in a Dev Container (e.g., in GitHub Codespaces or with the VS Code Remote - Containers extension). This will automatically set up the development environment, including the database.

3.  **Install dependencies:**
    ```bash
    npm install
    ```

4.  **Set up environment variables:**
    Copy the `.env.example` file to `.env` and fill in the `DATABASE_URL`. If you're using the provided `docker-compose.yml`, the default values should work.

5.  **Run database migrations:**
    ```bash
    npx prisma migrate dev
    ```

6.  **Start the development server:**
    ```bash
    npm run dev
    ```

## API Endpoints

-   `POST /api/build/start`: Starts a new build.
    -   **Body:** A JSON object that conforms to the `BuildSpec` schema.
-   `GET /api/build/status/:id`: Gets the status of a build.
-   `GET /api/build/artifact/:id`: Gets the URL of a build artifact.
