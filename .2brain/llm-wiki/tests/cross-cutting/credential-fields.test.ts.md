---
source: tests/cross-cutting/credential-fields.test.ts
sha256: 754814bc720a0781311b1a5e36d3ea1743e33970f8b712e458048e7c421c2532
generated_at: 2026-10-15T12:37:38.004154+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/credential-fields.test.ts

## Purpose

Cross-cutting serialization guard: constructs every registered Mongoose model with values filled into all credential-shaped paths, calls `toJSON`, and asserts that no credential-shaped key survives in the output. It exists because the `omit` list is the sole defence between a secret field and the response body, and it is easy to add a field to a schema without adding it to `omit`.

## Key elements

- **`CREDENTIAL_SHAPE`** — case-insensitive regex (`password|token|secret|salt|apikey|api_key|credential|privatekey|otp`) matched against every serialized key at every depth. Catches new fields by shape, not by an explicit list.
- **`PUBLISHABLE`** — exemption table (model + key + reason). Currently two entries: `WebhookSubscription.secretIds` and `AuditLog.actorCredentialId`. Both carry a required explanatory string.
- **`registerAllModels()`** — walks `MODULES_ROOT` via `readdirSync`, `jest.requireActual`s each `model.ts` so all schemas land in `mongoose.models`. Discovery-by-path means a new module is swept without editing this file.
- **`sensitivePaths(schema)`** — returns schema path names (one level into subdocuments) whose name matches `CREDENTIAL_SHAPE`. Used to verify the test has something to check.
- **`secretValues(schema)`** — builds a document object that sets `'SENSITIVE'` on every credential-shaped path (including nested subdocument arrays). Only those paths are set; the rest stay at defaults so a pass is meaningful.
- **`keysWithin(value, prefix)`** — recursively flattens any serialized payload into dotted-path key strings (handles arrays and nested objects).
- **Test suite (`describe('credential-shaped fields')`)** — four tests: (1) canary that models exist and at least one has a sensitive path; (2) the core assertion that no credential-shaped key survives `toJSON`; (3) no stale entries in `PUBLISHABLE`; (4) every exemption has a reason of ≥ 20 chars.

## Relationships

- **`tests/support/paths.ts`** — provides `MODULES_ROOT`, the directory scanned to discover and register all model files. Without it the test cannot locate schemas.
- **`tests/unit/scripts/docs/module-catalogue.test.ts`** — no code-level import or shared export with this file. The file's header comment refers to a "twin's version" that sweeps source text for credential-shaped names; this test is the runtime counterpart that drives actual serialization.

## Notes

- **No database connection needed.** Documents are constructed and serialized in-memory; only `save()` would require a connection.
- **`select: false` is NOT the layer under test.** It only affects queries that don't explicitly request the field. The login path does `select('+password')` on purpose, so a document carrying that value would serialize it. This test targets the transform/serialization layer.
- **`requireActual` vs `require`.** A bare `require` is banned repo-wide; `jest.requireActual` is used so the real schema (and its transform) is loaded.
- **Exemptions are deliberately friction-heavy.** Adding to `PUBLISHABLE` requires a ≥ 20-char reason and will be checked for staleness. The comment states the intent: every exemption is "a small hole."
- **Subdocument coverage is one level deep.** `sensitivePaths` and `secretValues` descend into `type.schema` once (document arrays and single-nested). Deeper nesting is not walked.
