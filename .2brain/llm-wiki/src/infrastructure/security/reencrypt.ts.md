---
source: src/infrastructure/security/reencrypt.ts
sha256: 750d196395d929e9d54428b13856e02513087c9b2acff218ac94b4a1d56052e9
generated_at: 2026-11-14T18:18:58.125395+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/reencrypt.ts

## Purpose

A batch re-encryption engine that rewrites stored ciphertexts from an older key version onto the newest key in a ring, enabling old keys to be retired (per NIST SP 800-57 cryptoperiods). It owns the read-loop, the rewrap call, and the write-back; owning modules only describe *where* their encrypted fields live.

## Key elements

- **`EncryptedField`** — one encrypted value in a document: dotted `path`, stored `stored` ciphertext, its `binding`, and a human-readable `label`.
- **`ReencryptReport`** — per-field, per-key-version counts (`found`) plus total `rewritten`.
- **`ReencryptJob<T>`** — full descriptor a module hands the engine: `model`, optional `filter`/`select`, a `fieldsOf` extractor, and the `ring` of `VersionedKey`s.
- **`ReencryptSpec<T>`** — `ReencryptJob` minus `model`; what a module's *service* produces before the repository attaches the model.
- **`reencryptOf(model)`** — curried factory that binds a model and returns `(spec, dryRun?) => Promise<ReencryptReport>`. This is what each module's repository exposes as its `reencrypt` method.
- **`emptyReport()` / `mergeReports(a, b)`** — helpers for composing reports across multiple collections.
- **`reencryptCollection`** (internal) — recursive cursor-paginated loop (BATCH_SIZE = 200) that reads lean, tallies fields, rewraps stale values via `rewrapVersionedSecret`, and writes through `model.collection.bulkWrite` (bypasses Mongoose hooks).
- **`planPage`** (internal) — processes one page: tallies every field, produces `BulkWrite` ops only for values whose rewrapped output differs from what was stored.
- **`writeOf`** (internal) — builds a single `updateOne` op whose filter includes both `_id` *and* the exact ciphertext read, making the write concurrency-safe.

## Relationships

- **`src/infrastructure/security/versioned-secret.ts`** — direct import: `rewrapVersionedSecret`, `keyVersionOf`, `SecretBinding`, `VersionedKey`. All crypto primitives live there; this file only orchestrates.
- **`scripts/ops/reencrypt.ts`** — the entry point that invokes each module's `reencrypt` service in turn and merges the resulting `ReencryptReport`s.
- **`src/modules/addresses/reencrypt.ts`** — defines the `ReencryptSpec` (fieldsOf, ring, filter/select) for the addressbooks collection.
- **`src/modules/addresses/repository.ts`** — calls `reencryptOf(model)` with the spec to produce the bound `(spec, dryRun?)` function.
- **`src/modules/delivery/services/reencrypt.ts`** — defines the `ReencryptSpec` for the delivery collection.
- **`src/modules/delivery/repository.ts`** — calls `reencryptOf(model)` with the spec to produce the bound `(spec, dryRun?)` function.
- **`src/modules/invoicing/services/reencrypt.ts`** — defines the `ReencryptSpec` for the invoicing collection.
- **`src/modules/invoicing/repository.ts`** — calls `reencryptOf(model)` with the spec to produce the bound `(spec, dryRun?)` function.
- **`src/modules/orders/services/reencrypt.ts`** — defines the `ReencryptSpec` for the orders collection.
- **`src/modules/orders/repository.ts`** — calls `reencryptOf(model)` with the spec to produce the bound `(spec, dryRun?)` function.
- **`src/modules/users/services/reencrypt.ts`** — defines the `ReencryptSpec` for the users collection.
- **`src/modules/users/repository.ts`** — calls `reencryptOf(model)` with the spec to produce the bound `(spec, dryRun?)` function.
- **`src/modules/webhooks/services/reencrypt.ts`** — defines the `ReencryptSpec` for the webhooks collection.
- **`src/modules/webhooks/repository.ts`** — calls `reencryptOf(model)` with the spec to produce the bound `(spec, dryRun?)` function.
- **`src/kernel/registry.ts`** — graph neighbor; no direct import or interaction visible in this file.

## Notes

- **Bypasses Mongoose middleware intentionally.** Writes go through `model.collection.bulkWrite`, so `pre/post` hooks, `updatedAt`, and ETag recomputation do not fire. The comment justifies this: re-encryption changes only the envelope, not content.
- **Idempotent by construction.** `rewrapVersionedSecret` returns the input unchanged if the value is already on the newest key, so a second run produces zero writes.
- **Concurrency-safe writes.** Each `updateOne` filter includes the exact ciphertext that was read (`[field.path]: field.stored`). A concurrent write that changed the value will cause the filter to match nothing, and the row is simply picked up on the next run.
- **`dryRun` still tallies.** The `found` map is populated even when no writes are issued, so the report shows what *would* be moved.
- **`fieldsOf` receives a lean doc.** The document passed to the module's extractor is the raw `.lean()` result (plain object with `_id`), not a Mongoose document instance.
- **Cursor pagination via `_id: { $gt }`.** Avoids `skip` offset; memory stays flat regardless of collection size.
