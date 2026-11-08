---
source: tests/cross-cutting/credential-fields.test.ts
sha256: 5203345db1d972fe0de00e60046400e4a0a56be16252cdf2ae69d388717d5323
generated_at: 2026-11-08T09:26:31.393357+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/credential-fields.test.ts

## Purpose

Cross-cutting security sweep that asserts no credential-shaped field (password, token, secret, salt, API key, OTP, etc.) survives `toJSON` serialization on any Mongoose model in the codebase. It exists because the only defence against leakage is an `omit` list beside the schema field, and nothing structurally links the two — a new field added to a schema but forgotten in `omit` would silently reach a client.

## Key elements

- **`CREDENTIAL_SHAPE`** — case-insensitive regex matching any credential-shaped property name; the sweep is shape-based, not a fixed list, so it catches fields nobody has added yet.
- **`PUBLISHABLE`** — whitelist of `(model, key, because)` triples for keys that *look* credential-shaped but are safe to serialize (e.g. opaque secret IDs, public key prefixes). Each entry requires a stated reason.
- **`registerAllModels()`** — scans `MODULES_ROOT` for `model.ts` files and loads them via `jest.requireActual`, populating `mongoose.models` as the full catalogue without a hard-coded import list.
- **`sensitivePaths(schema)`** — returns schema paths (including one level of subdocument) whose names match `CREDENTIAL_SHAPE`.
- **`secretValues(schema)`** — builds a document object that sets *only* credential-shaped paths to the sentinel string `'SENSITIVE'`, so the test verifies a field that is actually present is suppressed, not merely absent because undefined.
- **`keysWithin(value, prefix)`** — recursively flattens a serialized payload into dotted-path key strings at every depth.
- **`isPublishable(model, key)`** — checks the `PUBLISHABLE` whitelist.
- **Four `it` blocks** — (1) canary: ≥ 8 models registered and ≥ 1 has credential-shaped paths; (2) main assertion: no credential-shaped key appears in `toJSON` output after filtering out `PUBLISHABLE`; (3) no `PUBLISHABLE` entry references a model that no longer exists; (4) every `PUBLISHABLE` entry carries a reason ≥ 20 chars.

## Relationships

- **`tests/support/paths.ts`** — provides the `MODULES_ROOT` constant used by `registerAllModels()` to dynamically discover every module's schema file. Adding a new module directory under that root is automatically swept without editing this test.

## Notes

- **`select: false` is not a defence here.** The file's header explicitly calls out that `select: false` is a query-default (omits the field unless `+password` is requested) and does nothing to a document that already holds the value. The test exercises the serialization layer (`toJSON`), not the query layer.
- **No database connection is needed.** Mongoose documents can be constructed and serialized in memory; only `save()` would require a connection.
- **`jest.requireActual` instead of `require`.** Bare `require` is banned repo-wide; `requireActual` also guarantees the real schema (and its transform) is loaded, not a mock.
- **The sentinel `'SENSITIVE'` matters.** If a credential field were left `undefined`, it would be absent from `toJSON` output for the wrong reason and read as a pass. Filling it guarantees the field is present in the document and must be actively suppressed by the transform.
- **Self-discovering.** New modules placed under `MODULES_ROOT` are picked up automatically; no import list to maintain.
