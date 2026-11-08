---
source: tests/cross-cutting/mongo-version-pin.test.ts
sha256: 77081030fbbb61ab2eadef75c02fbfa80eee7ddd1eb7c83c689fa8ec5e1a956c
generated_at: 2026-11-08T09:28:50.148953+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/mongo-version-pin.test.ts

## Purpose

A cross-cutting consistency guard that asserts every `mongo` image tag declared in the Docker Compose files matches the version pinned in `package.json` (`config.mongodbMemoryServer.version`). It exists because Dependabot cannot see that config key, so a compose-only version bump would otherwise pass CI while leaving tests and production on untested versions. The test goes red until the pin is updated in the same PR as the compose bump.

## Key elements

- **`COMPOSE_FILES`** — the three compose YAML files (`docker-compose.yml`, `docker-compose.test.yml`, `docker-compose.production.yml`) that are scanned for mongo images.
- **`mongoTags(file: string): string[]`** — reads and parses a compose file from disk, filters services whose image matches `/mongo:`, and returns the version tag (the segment between `:` and `@sha256`).
- **`pin`** — the expected version, read at module load time from `package.json` → `config.mongodbMemoryServer.version`.
- **`describe('compose MongoDB version')`** — two tests: (1) sanity-check that at least one mongo image was found across all files, (2) per-file assertion that each extracted tag equals `pin`.

## Relationships

- **`tests/support/paths.ts`** — provides `REPO_ROOT` (imported via the `@tests/paths` alias), which is used to resolve the absolute paths to the compose files and `package.json` relative to the repository root.

## Notes

- The mongo-image filter regex `/(^|\/)mongo:/` is anchored to avoid matching non-mongo images that merely contain the substring "mongo" (e.g. `my-mongo-client:1.0`).
- Version extraction uses `/:([^@]+)@/`, assuming the image reference is in the `image:version@sha256:...` form. A tagless image (no digest) would yield an empty string and fail the equality check.
- All file reads (`readFileSync`) happen at **test time**, not build time — the test is a filesystem-level invariant check, not a type or import graph check.
- The test is intentionally coupled to the `package.json` `config` block (a non-standard key), so renaming or moving that key will break the test silently until someone updates the parser shape.
