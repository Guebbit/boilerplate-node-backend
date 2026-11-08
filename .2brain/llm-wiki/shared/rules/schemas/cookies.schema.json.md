---
source: shared/rules/schemas/cookies.schema.json
sha256: 544b6cc6bd0f2453a2f86eb92dbd4fa3c3e0511a4db6b173279a05fbca9d886f
generated_at: 2026-11-08T03:10:22.613285+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/schemas/cookies.schema.json

## Purpose

JSON Schema (draft 2020-12) that validates a cookies inventory document. It enforces the allowed shape of a top-level `cookies` object so that every cookie / storage entry is consistently described with its owner, storage kind, purpose, and other metadata. It exists to give tooling and CI a single source of truth for what a valid cookies declaration looks like.

## Key elements

- **Top-level object** – requires exactly one key, `cookies`; no other top-level keys are permitted (`additionalProperties: false`).
- **`cookies`** – an open map (keyed by cookie/storage name). Keys must match `^[a-z][A-Za-z0-9]*$` (lowercase alphabetic start, then alphanumeric). Each value is a strict object.
- **Required fields per entry** – `name` (non-empty string), `setter` (`backend` | `frontend` | `library`), `kind` (`cookie` | `localStorage` | `sessionStorage`), `purpose` (non-empty string), `necessity` (`necessary` | `preference`), `secret` (boolean).
- **Optional fields per entry** – `maxAgeMs` (positive integer, capped at `Number.MAX_SAFE_INTEGER`), `lifetime` (`sessionTier` | `challenge`).
- **Strictness** – `additionalProperties: false` on each entry object means no undocumented fields are allowed.

## Notes

- The map key (cookie name) and the `name` property inside the entry are separate; the key is validated by the `propertyNames` pattern while `name` is an independent required string.
- `maxAgeMs` is an integer (not `number`), so fractional millisecond values will fail validation.
- The schema has no `$id`, `$ref`, or external references; it is fully self-contained.
- Because the entry schema forbids additional properties, adding a new field to a cookie record requires a schema change first.
