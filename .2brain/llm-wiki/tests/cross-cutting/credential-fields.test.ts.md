---
source: tests/cross-cutting/credential-fields.test.ts
sha256: 5203345db1d972fe0de00e60046400e4a0a56be16252cdf2ae69d388717d5323
generated_at: 2026-10-29T06:45:27.127966+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/credential-fields.test.ts

## Purpose

Cross-cutting test that verifies no credential-shaped field (matched by a name-pattern regex) survives `toJSON` serialization on any registered Mongoose model. It exists because the only defence against publishing a password, token hash, or secret is an `omit` entry in the model's toJSON transform — a one-line omission that nothing else enforces. The test drives the transform directly (not a query) because `select: false` does not remove an already-loaded value, and it operates on a live document rather than a source sweep because the wire shape is produced at runtime by the transform.

## Key elements

- **`CREDENTIAL_SHAPE`** — Regex (`/password|token|secret|salt|apikey|api_key|credential|privatekey|otp/i`) that classifies a key name as sensitive. Matched case-insensitively against every key at every depth of serialized output.
- **`PUBLISHABLE`** — Allowlist of `{ model, key, because }` entries for keys that match the pattern but are safe to serialize (e.g. opaque ring IDs, public key prefixes). Each entry must state a reason; the list is intentionally empty-by-default.
- **`registerAllModels()`** — Discovers every module's `model.ts` under `MODULES_ROOT` via `readdirSync` and loads it with `jest.requireActual`, so `mongoose.models` is the full catalogue without a hardcoded import list.
- **`sensitivePaths(schema)`** — Returns every schema path (including one level of subdocument) whose *name* matches `CREDENTIAL_SHAPE`.
- **`secretValues(schema)`** — Builds a plain object that fills only the credential-shaped paths with the sentinel string `'SENSITIVE'`, leaving all other fields at their defaults. This ensures a pass means the transform actively omitted the value, not that the field was simply undefined.
- **`keysWithin(value)`** — Recursively collects every key at every depth of a serialized payload as dotted-path strings (handles nested objects and arrays).
- **`subSchema(type)`** — Narrowing helper: returns the nested `Schema` from a `SchemaType` if it is a subdocument, else `undefined`.
- **Test suite** (`describe('credential-shaped fields')`):
  - *canary* — asserts ≥ 8 models are registered and at least one has a sensitive path, so the sweep is not vacuously passing.
  - *main assertion* — for every model, constructs a document with `secretValues`, calls `toJSON`, and asserts no credential-shaped key (minus PUBLISHABLE) appears.
  - *stale-exemption guard* — every PUBLISHABLE entry must reference a model that actually exists in `mongoose.models`.
  - *exemption hygiene* — every PUBLISHABLE entry must carry a `because` string of ≥ 20 characters.

## Relationships

- **`tests/support/paths.ts`** — Exports `MODULES_ROOT`, the filesystem root under which `registerAllModels()` looks for `model.ts` files. This is the sole import from that file; it is what makes the discovery step path-agnostic and consistent with other cross-cutting sweeps in the repo.

## Notes

- No database connection is required; Mongoose documents can be constructed and serialized in-memory. Only `.save()` would need a connection.
- `jest.requireActual` is used instead of bare `require` both because the latter is banned repo-wide and because a schema must be the real runtime one for its transform to be meaningful.
- The `PUBLISHABLE` list is a security-relevant allowlist: adding an entry is effectively widening the surface of what may reach a client, so each entry demands a written justification and a reviewer. The "stale exemption" and "exemption hygiene" tests exist to keep the list honest over time.
- Only one level of subdocument is inspected for sensitive paths (`subSchema` looks one level deep). Deeper nesting would not be caught by `sensitivePaths`, though `keysWithin` would still flag it in the serialized output.
