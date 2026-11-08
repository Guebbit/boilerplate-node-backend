---
source: tests/unit/infrastructure/config/cookies-schema.test.ts
sha256: 831b5865118b060755f85166d8a3334da23dcb68bf2bb82ca7e39189e8ed9ebe
generated_at: 2026-11-08T10:11:06.716078+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/config/cookies-schema.test.ts

## Purpose

Contract tests for the `cookiesSchema` Zod schema. It verifies two things: (1) the committed `shared/rules/cookies.yaml` file parses successfully against the schema, and (2) the schema itself accepts valid rows and rejects a catalog of invalid shapes. This keeps the schema and the live config file in lockstep.

## Key elements

- **`row`** — A single valid cookie row (name, setter, kind, purpose, necessity, secret) used as the base object for mutation in every assertion.
- **`documentOf(cookies)`** — Wraps a record of rows into the top-level document shape `{ cookies: { … } }` that the schema expects.
- **`describe('shared/rules/cookies.yaml')`** — Reads the real YAML file from disk (via `REPO_ROOT`), parses it with `yaml.parse`, and asserts `cookiesSchema.safeParse(...).success` is `true`.
- **`describe('the cookies schema')`** — Acceptance tests (constant `maxAgeMs`, word-based `lifetime`) and a `it.each` table of seven rejection cases (empty inventory, non-camelCase key, unknown field, unknown setter, zero `maxAgeMs`, both `maxAgeMs` and `lifetime` present, duplicate cookie name).

## Relationships

- **`src/infrastructure/config/shared-rules/cookies.ts`** — Source of the `cookiesSchema` import; the entire test file exercises this single export.
- **`tests/support/paths.ts`** — Provides `REPO_ROOT` so the committed-YAML test can locate `shared/rules/cookies.yaml` relative to the repo root regardless of the working directory.

## Notes

- The committed-file test reads from the filesystem, so it fails if the YAML is missing or unparseable—not just if the schema rejects it.
- Rejection cases are table-driven via `it.each`; adding a new invalid shape means appending one row to the array, not writing a new `it` block.
- The schema is Zod-based (`safeParse`), and the tests intentionally use `safeParse` (not `parse`) to avoid throwing and to assert the boolean `success` flag directly.
