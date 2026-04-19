# Getting Started

## Prerequisites

- Node.js 20+
- MongoDB instance (local, Docker, or Atlas)
- Docker / Podman (optional, for the included compose file)

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy the environment file and fill in the values
cp .env.example .env

# 3. Run database migrations
npm run db:migrate

# 4. (Optional) Seed the database with sample data
npm run db:seed

# 5. Start in development mode
npm run dev
```

## Key environment variables

| Variable                  | Description                                |
| ------------------------- | ------------------------------------------ |
| `NODE_DB_URI`             | MongoDB connection string                  |
| `NODE_JWT_SECRET`         | Secret used to sign JWT access tokens      |
| `NODE_JWT_REFRESH_SECRET` | Secret used to sign refresh tokens         |
| `NODE_PORT`               | HTTP port (default `3000`)                 |
| `NODE_ENABLE_CLUSTERING`  | Set to `1` to fork one worker per CPU core |

## Scripts reference

| Script                  | Description                                      |
| ----------------------- | ------------------------------------------------ |
| `npm run dev`           | Start with hot-reload (tsx watch)                |
| `npm run build`         | Type-check + lint                                |
| `npm run test`          | Run unit tests (Jest + mongodb-memory-server)    |
| `npm run complete`      | Build → test → lint:fix → prettier:fix           |
| `npm run db:migrate`    | Apply pending migrations                         |
| `npm run db:seed`       | Insert sample data                               |
| `npm run db:seed:reset` | Drop the DB then re-seed                         |
| `npm run genapi`        | Regenerate TypeScript client from openapi.yaml   |
| `npm run lint:openapi`  | Validate the OpenAPI spec with Spectral          |
| `npm run setup:mongod`  | Extract `mongod` binary from Docker for CI tests |

## Docker / Podman

A `docker-compose.yml` is included. Use the `podman:*` scripts if you prefer Podman.

```bash
podman compose up -d       # start services
npm run podman:restart     # restart without rebuilding
npm run podman:rebuild     # full rebuild + restart
```
