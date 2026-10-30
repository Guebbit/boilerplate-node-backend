---
source: src/infrastructure/security/reencrypt.ts
sha256: d778012164ca463e0c8ae64f2cd891d877d6dc3c4162b7e242e6d56c52f4d281
generated_at: 2026-10-29T02:16:19.845107+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/reencrypt.ts

## Purpose

The re-encryption engine that moves every stored secret onto the newest key of its versioned ring, enabling safe key retirement. It is generic: each owning module describes *where* its encrypted fields live (via `fieldsOf`), and this file handles batched reading, rewrapping, and conflict-safe writing. Triggered by the `reencrypt` ops script, never called ad hoc.

## Key elements

- **`EncryptedField`** — describes one ciphertext in a document: dotted `path`, stored value, `SecretBinding`, and a human-readable `label` for reports.
- **`ReencryptJob<TDocument>`** — the full input to one collection run: `model`, optional `filter`/`select`, `fieldsOf`, and the `ring` (first entry = target key).
- **`ReencryptSpec<TDocument>`** — `ReencryptJob` minus `model`; what a module's service provides before the repository binds the model.
- **`ReencryptReport`** — per-field, per-key-version counts (`found`) and total `rewritten`.
- **`reencryptOf(model)`** — factory that closes over a Mongoose model and returns `(spec, dryRun?) → Promise<ReencryptReport>`. Exposed as a repository's `reencrypt` method so the model never leaves the repository layer.
- **`emptyReport()` / `mergeReports(a, b)`** — helpers for accumulating and combining reports across collections.
- **`reencryptCollection`** (internal) — recursive cursor over pages of `BATCH_SIZE` (200); reads lean, calls `planPage`, then applies writes via `model.collection.bulkWrite` (bypasses Mongoose middleware).
- **`planPage`** (internal) — tallies every field, rewraps stale ones with `rewrapVersionedSecret`, and returns the `updateOne` ops to apply.
- **`writeOf`** (internal) — builds a single `updateOne` whose filter matches the *old* ciphertext (optimistic concurrency guard).

## Relationships

- **`./versioned-secret`** — source of `rewrapVersionedSecret`, `keyVersionOf`, and the `SecretBinding` / `VersionedKey` types used throughout.
- **`scripts/ops/reencrypt.ts`** — the ops entry point; iterates the module registry and calls each module's `reencrypt` (which is `reencryptOf(model)` + the module service's `ReencryptSpec`), then merges the per-module `ReencryptReport`s.
- **`src/kernel/registry.ts`** — provides the list of registered modules so the ops script can discover every collection that needs re-encrypting.
- **Module repositories** (e.g. `addresses/repository.ts`, `orders/repository.ts`, …) — each binds `reencryptOf` to its own model and pairs it with the module service's spec, exposing a single `reencrypt(spec, dryRun?)` method.
- **Module re-encrypt services** (e.g. `addresses/services/reencrypt.ts`, `invoicing/services/reencrypt.ts`, …) — supply the `ReencryptSpec`: `fieldsOf` closure that maps a document to its `EncryptedField[]`, the `ring`, and any `filter`/`select`.

## Notes

- **Bypasses Mongoose intentionally.** Writes go through `model.collection.bulkWrite`, so no `pre/post` hooks fire, `updatedAt` is not bumped, and no ETag is regenerated. The doc comment calls this out explicitly: re-encrypting changes the envelope, not the content.
- **Idempotency is structural.** `rewrapVersionedSecret` returns the input unchanged if it is already on the newest key, so a second run produces zero writes.
- **Concurrent-edit safety.** Each `updateOne` filter includes the *old* ciphertext at `field.path`. If another writer changed the field between read and write, the filter matches 0 documents and the row is simply skipped (picked up on the next run).
- **Paging is `_id`-cursor based** (`$gt` on last seen `_id`), not skip/limit, so a concurrent insert cannot shift rows between pages.
- **`dryRun`** tallies `found` identically to a real run but sets `next = field.stored`, so `planPage` never emits a write and `rewritten` stays 0.
- **`BATCH_SIZE = 200`** is a module-level constant, not configurable at call time.
