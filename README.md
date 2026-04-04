# Boilerplate Node Backend

TypeScript Node.js backend with Express, JWT auth, Mongoose, and OpenAPI-first tooling.

## Quickstart

1. Install dependencies:
   - `npm install`
2. Create env file:
   - `cp .env-example .env`
3. Set required environment variables in `.env`:
   - `NODE_DB_URI`
   - `NODE_ACCESS_TOKEN_SECRET`
   - `NODE_REFRESH_TOKEN_SECRET`
4. Start development server:
   - `npm run dev`

## Scripts

- `npm run dev` - run API in watch mode
- `npm run ts-check` - TypeScript type-check
- `npm run lint` - lint checks
- `npm run test` - unit tests
- `npm run build` - type-check + lint
- `npm run complete` - build + test + auto-fix lint/prettier
- `npm run complete:check` - build + test + non-mutating lint/prettier checks

## Development routes

Routes in `src/routes/_development.ts` are mounted only when `NODE_ENV !== 'production'`.

## OpenAPI workflow

- Source of truth: `openapi.yaml`
- Lint OpenAPI spec:
  - `npm run lint:openapi`
- Generate typed API client:
  - `npm run genapi`

Use the generated `api/` output as derived artifacts from `openapi.yaml`.

## Mock/testing helpers

The `.dev/` folder contains Bruno/Mockoon/Insomnia collections for local API exploration.
