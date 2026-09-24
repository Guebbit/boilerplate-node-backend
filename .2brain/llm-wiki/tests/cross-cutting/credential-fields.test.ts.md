---
source: tests/cross-cutting/credential-fields.test.ts
sha256: 7c1aa48f57939a95181e6214a4ec0b4a8f7387b5f7b1087599ecb3e3e19dfe32
generated_at: 2026-09-23T19:55:48.390453+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/credential-fields.test.ts

## Purpose

A cross-cutting invariant test that asserts no credential-shaped key (matching `password|token|secret|salt|apikey|api_key|credential|privatekey|otp`) appears anywhere in the `toJSON()` output of any Mongoose model registered under `src/modules/`. It exists because the only thing preventing a hash or live token from reaching a response body is a manual `omit` entry; this test makes that a checked property rather than a remembered one.

## Key elements

- **`CREDENTIAL_SHAPE`** — a case-insensitive regex identifying any key that should never be published. Deliberately shape-based (not an explicit field list) so it catches fields added later.
- **`PUBLISHABLE`** — an allowlist of `(model, key, because)` tuples for keys that *look* credential-shaped but are safe (currently: `WebhookSubscription.secretIds`, opaque ring IDs only).
- **`registerAllModels`** — walks `src/modules/*/model.ts` via `fs.readdirSync` and `jest.requireActual` to populate `mongoose.models` without a hardcoded import list.
- **`subSchema`** — type-narrows a `SchemaType` to extract its nested `Schema` when present.
- **`sensitivePaths`** — returns every path name (one level of subdocument deep) whose name matches `CREDENTIAL_SHAPE`.
- **`secretValues`** — builds a document object that fills *only* credential-shaped paths with the sentinel `'SENSITIVE'`, leaving everything else at defaults.
- **`keysWithin`** — recursively collects every key at every depth of a serialized value as dotted paths.
- **`isPublishable`** — checks a `(model, key)` pair against the `PUBLISHABLE` allowlist.
- **Test cases** — four `it` blocks: (1) canary asserting ≥ 8 models and ≥ 1 has a sensitive path; (2) the main assertion that no credential-shaped key survives `toJSON()`; (3) stale-exemption check (allowlist entries whose model no longer exists); (4) every exemption carries a reason of ≥ 20 chars.

## Relationships

- **`src/modules/account/tests/unit/two-factor.test.ts`** — Exercises the two-factor / OTP flow that produces credential-shaped fields (`otp`, `tokens`) the cross-cutting test then asserts are stripped on serialization. The unit test validates *behavior* of the 2FA module; this file validates the *output contract* of the schema transform that both modules (and every other) share.

## Notes

- The test drives `toJSON()` directly rather than running a query, because `select: false` only affects reads that omit the field; the login path deliberately selects `+password`. The transform (and its `omit` list) is the real boundary, so that is what gets tested.
- No database connection is required; a Mongoose document can be instantiated and serialized in-memory.
- `jest.requireActual` is used (not bare `require`) both to comply with a repo-wide lint ban and to guarantee the real schema (and thus its real transform) is loaded.
- The `PUBLISHABLE` allowlist is intentionally empty-by-default and requires a written justification plus a reviewer; each entry is a deliberate exception to the "no credential-shaped key reaches the wire" rule.
