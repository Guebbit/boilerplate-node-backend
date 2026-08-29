# scripts/export-demo-dataset.ts

## Purpose

Exports the demo dataset (`db/demo/demo-data.json`) as the API actually serializes it. It spins up a throwaway in-memory MongoDB, runs the real seeders, then delegates to `assembleDemoDataset()` to produce the final JSON. Publishing the serialized output (rather than raw seed input) is intentional: it exercises the backend mappers/serializers so drift between the two repos' views is caught at generation time.

## Key elements

- **`run()`** — Top-level async flow: creates a `MongoMemoryServer`, sets `NODE_DB_URI`, connects via Mongoose, runs every enabled module's `seeds()`, calls `assembleDemoDataset()`, then either writes the result to `DEMO_DATA_PATH` or compares it against the committed file.
- **`--check` flag** (parsed from `process.argv` as `checkOnly`) — CI mode: exits `1` with a descriptive error if the committed file differs from freshly assembled output, instead of overwriting it.
- **`systemBinary` block** — If a mongod binary already exists at `/tmp/mongod` (set by `npm run setup:mongod`), points `MONGOMS_SYSTEM_BINARY` at it and skips version/MD5 checks to avoid a download.
- **Imports** — `assembleDemoDataset`, `DEMO_DATA_PATH` from `db/demo/assemble.ts`; `enabledModules` from `src/modules.ts`.

## Relationships

- **`db/demo/assemble.ts`** — Provides `assembleDemoDataset()` (queries the seeded DB and serializes it into the canonical JSON string) and `DEMO_DATA_PATH` (the write destination). This script is its sole caller in the codebase.
- **`src/modules.ts`** — Supplies `enabledModules`, whose optional `.seeds()` functions are invoked to populate the throwaway database before assembly.

## Notes

- Sets `NODE_DB_URI` before calling `mongoose.connect` so the app's own connection path (not a raw driver call) is exercised.
- Cleanup (`mongoose.disconnect()`, `server.stop()`) is in a `finally` block and is safe as a no-op if seeding or assembly threw early.
- The `--check` error message references `check:spec-identity`, a separate step that compares the exported file against the paired frontend's copy.
- Run via `npm run seed:export`; the shebang targets `tsx`.
- Context for *why* this script exists (mapper drift between repos) is documented in `docs/api/contract-fragmentation.md`.
