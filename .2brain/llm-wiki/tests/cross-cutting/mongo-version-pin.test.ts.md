---
source: tests/cross-cutting/mongo-version-pin.test.ts
sha256: 91b432f87cc8644bb5b0389dd6c9fe0893378b6746419a2302ab89c814ef5406
generated_at: 2026-11-14T23:05:13.574090+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/mongo-version-pin.test.ts

## Purpose

Cross-cutting guard that asserts every `mongo:` image tag in the Docker Compose files matches the version pinned under `config.mongodbMemoryServer.version` in `package.json`. Because Dependabot cannot see that config key, a compose-file version bump would otherwise land green while production tests run a different `mongod` than CI ever exercised. This test forces the pin to move in the same PR as the compose change.

## Key elements

- **`COMPOSE_FILES`** – constant array of the three compose files that declare a MongoDB service (`docker-compose.yml`, `docker-compose.test.yml`, `docker-compose.production.yml`).
- **`ComposeFile`** (interface) – minimal structural type for the YAML: `services` → `Record<string, { image?: string }>`.
- **`mongoTags(file: string): string[]`** – reads a compose file, filters services whose image matches `/mongo:` (anchored to avoid false positives), and extracts the version tag that sits between `:` and `@sha256`.
- **`pin`** – single value read from `package.json` → `config.mongodbMemoryServer.version`; the source of truth for the test binary.
- **`describe('compose MongoDB version')`** – two assertions: (1) at least one mongo image was discovered across all compose files, and (2) for each compose file, every mongo tag equals `pin`.

## Relationships

- **`tests/support/paths.ts`** – provides `REPO_ROOT` so all file reads (compose files, `package.json`) are anchored to the repository root regardless of the test runner's working directory.

## Notes

- The image-tag regex `/:([^@]+)@/` assumes every pinned mongo image carries a `@sha256…` digest. If an image ever drops the digest, `mongoTags` returns an empty string and the equality check will fail (intentional fail-closed).
- The `/(?:^|\/)mongo:/` filter is deliberately anchored so a service image like `my-registry/mongo-extended:1` would *not* be picked up; only a segment that is exactly `mongo:` qualifies.
- The test is a pure file-reading check (no `mongod` spawned); it runs in the unit/fast lane, not the integration lane.
