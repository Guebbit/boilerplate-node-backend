# tests/cross-cutting/credential-fields.test.ts

## Purpose

Cross-cutting sweep that asserts no credential-shaped field (password, token, secret, salt, apikey, credential, privatekey, otp, etc.) survives `toJSON()` serialization on any registered Mongoose model. It exists because the only line of defence against accidental exposure is the `omit` list passed to `buildTransform`; adding a field to a schema is a one-line edit that nothing mechanically links to that list.

## Key elements

- **`CREDENTIAL_SHAPE`** — regex matched case-insensitively against every serialized key to identify credential-shaped names.
- **`PUBLISHABLE`** — exemption list (currently empty). Entries require a model name, key, and a ≥ 20-character justification; a separate test rejects stale or unexplained entries.
- **`registerAllModels()`** — walks `src/modules/*/model.ts` on disk and calls `jest.requireActual` on each, populating `mongoose.models` without a static import list. New modules are swept automatically.
- **`subSchema(type)`** — narrows a `SchemaType` to a subdocument schema by checking for the presence of the `.schema` property.
- **`sensitivePaths(schema)`** — returns dotted paths (one level of subdocument depth) whose names match `CREDENTIAL_SHAPE`.
- **`secretValues(schema)`** — builds a document object that fills only the credential-shaped paths with the sentinel string `'SENSITIVE'`; all other fields are left at their defaults so the test specifically verifies what happens to a value that *is* present.
- **`keysWithin(value)`** — recursively flattens a serialized payload into a list of dotted key paths.
- **`isPublishable(model, key)`** — checks the exemption list.
- **Test suite (`describe('credential-shaped fields')`)** — four assertions:
  1. Model catalogue is non-trivial (≥ 8 models, ≥ 1 with sensitive paths) so a failure to register doesn't produce a vacuous pass.
  2. Core assertion: constructing a document with sentinel values and calling `.toJSON()` yields zero credential-shaped keys.
  3. No `PUBLISHABLE` entry references a model that no longer exists.
  4. Every `PUBLISHABLE` entry carries a substantive reason.

## Relationships

No graph neighbours recorded. The file is self-contained: it discovers its targets via filesystem traversal of `src/modules/*/model.ts` rather than importing them, so the dependency graph shows no static edges.

## Notes

- Drives the **transform** layer (`toJSON`) deliberately, not the query layer. `select: false` on a schema path is a read default and does nothing to a document that already holds the value (e.g. the login path selects `+password` intentionally).
- No database connection is required; Mongoose documents can be instantiated and serialized in-memory.
- `jest.requireActual` is used instead of bare `require` both because the latter is banned repo-wide and because the transform must come from the real schema.
- The canary assertion (≥ 8 models) guards against the test silently passing when model registration fails.
- `PUBLISHABLE` is intentionally empty; adding an entry is treated as a security review decision, not a convenience.
