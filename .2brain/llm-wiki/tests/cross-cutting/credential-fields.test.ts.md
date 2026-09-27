---
source: tests/cross-cutting/credential-fields.test.ts
sha256: 5bc33408593f2419f1c16b3e2cc98d3d51eacc428584885148057120fa623e23
generated_at: 2026-09-27T15:50:09.944196+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/credential-fields.test.ts

## Purpose

Cross-cutting test that asserts no credential-shaped field name (password, token, secret, salt, apikey, credential, privatekey, otp) survives Mongoose `toJSON()` serialization on any registered model. It exists because the sole defense against leaking a secret into a response body is the `omit` list passed to `buildTransform` per model — a list that is easy to forget when adding a new schema field. Rather than trusting a static list of known fields, this test matches by *shape* so it catches fields nobody has added yet.

## Key elements

- **`CREDENTIAL_SHAPE`** — Regex (`/password|token|secret|salt|apikey|api_key|credential|privatekey|otp/i`) used to flag property names at every depth of serialized output.
- **`PUBLISHABLE`** — Allowlist of keys that match `CREDENTIAL_SHAPE` but are safe to publish. Currently one entry: `WebhookSubscription.secretIds` (opaque ring IDs, never the secret value). Each entry requires a written reason.
- **`registerAllModels()`** — Walks `MODULES_ROOT` on disk, `requireActual`s every `<module>/model.ts`, so `mongoose.models` holds the full catalogue without a static import list.
- **`subSchema(type)`** — Narrows a `SchemaType` to its nested `Schema` (present only on document-array / single-nested subclasses).
- **`sensitivePaths(schema)`** — Returns every path name (plus one level of subdocument children) that matches `CREDENTIAL_SHAPE`.
- **`secretValues(schema)`** — Builds a plain object with `'SENSITIVE'` stuffed into every credential-shaped path so the serialized document *has* the value rather than omitting it by default.
- **`keysWithin(value, prefix)`** — Recursively flattens a serialized value into dotted-path key strings (handles arrays and nested objects).
- **`isPublishable(model, key)`** — Checks a key against the `PUBLISHABLE` allowlist.
- **`describe('credential-shaped fields')`** — Four tests: (1) canary that ≥ 8 models loaded and ≥ 1 has a sensitive path; (2) the core assertion that no non-publishable credential-shaped key appears in any model's `toJSON()` output; (3) no stale `PUBLISHABLE` entries reference a model that no longer exists; (4) every `PUBLISHABLE` entry has a reason ≥ 20 chars.

## Relationships

- **`tests/support/paths.ts`** — Imports `MODULES_ROOT`, the filesystem root under which each module directory (and its `model.ts`) lives. This is what makes the discovery loop work.
- **`src/modules/account/tests/unit/two-factor.test.ts`** — Described in the file's header as "the twin." That file approaches the same guarantee from the *query* side (reading API resource definitions as text); this file approaches it from the *serialization* side (building a live document and calling `toJSON`). They complement each other: a field could pass a query-shape check but still leak if the transform renames it, and vice versa.

## Notes

- **No DB connection required.** Mongoose documents can be instantiated and serialized in-memory; only `save()` would need a connection.
- **`select: false` is not the defence.** It is a read-time default that keeps a field out of un-requested queries. The login path intentionally selects `+password`. The transform's `omit` list is the only layer that actually prevents serialization.
- **`requireActual` over `require`.** Bare `require` is banned repo-wide; `requireActual` is also needed so the schema (and its transform) is the real one.
- **Vacuous-pass guard.** The first test asserts ≥ 8 models and ≥ 1 sensitive path. Without it, a broken `registerAllModels` would let the main assertion pass over zero models and report a false all-clear.
- **Adding a `PUBLISHABLE` entry requires a reason string ≥ 20 chars**, enforced by its own test. Treat it as a small, reviewed exception — the file's comment calls every exemption "a small hole."
