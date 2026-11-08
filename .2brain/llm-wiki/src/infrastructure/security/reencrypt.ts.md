---
source: src/infrastructure/security/reencrypt.ts
sha256: d778012164ca463e0c8ae64f2cd891d877d6dc3c4162b7e242e6d56c52f4d281
generated_at: 2026-11-08T03:49:53.445565+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/reencrypt.ts

## Purpose

The re-encryption engine that moves stored ciphertexts onto the newest key of a versioned key ring. It owns the batching, the `rewrapVersionedSecret` call, and the conditional write; each owning module only describes *where* its encrypted fields live. Existence is justified by key-rotation retirement (NIST SP 800-57): a key can only be discarded once every value it encrypted has been rewritten under its successor.

## Key elements

- **`BATCH_SIZE`** (const `200`) — documents read per round-trip; keeps memory flat on large collections.
- **`EncryptedField`** (interface) — one encrypted value within a document: `path` (dotted, e.g. `items.2.city`), `stored` (ciphertext), `binding`, `label` (human-readable name for reports).
- **`ReencryptReport`** (interface) — per-label, per-key-version tally of values found *before* any move, plus a `rewritten` counter.
- **`ReencryptJob<TDocument>`** (interface) — full engine input: model, optional `filter`/`select`, a `fieldsOf` mapper, and the `ring`.
- **`ReencryptSpec<TDocument>`** (type) — `ReencryptJob` minus `model`; what a module's *service* provides. The *repository* adds the model.
- **`reencryptOf(model)`** (exported factory) — curried: `(model) => (spec, dryRun?) => Promise<ReencryptReport>`. This is the method a repository exposes so the model never leaks to the service layer.
- **`emptyReport()`** / **`mergeReports(a, b)`** — helpers for composing per-collection reports into one aggregate.
- **`planPage`** (internal) — iterates a page of documents, tallies each field, rewraps stale values, and collects `bulkWrite` operations.
- **`reencryptCollection`** (internal) — recursive `_id`-cursor paging loop; applies `bulkWrite` per page, recurses while the page is full.
- **`writeOf`** (internal) — builds a single `updateOne` filtered on `{ _id, [path]: storedCiphertext }`, so a concurrent write to the same field wins.

## Relationships

- **`src/infrastructure/security/versioned-secret.ts`** — provides `rewrapVersionedSecret`, `keyVersionOf`, and the `SecretBinding` / `VersionedKey` types used throughout this file.
- **`src/modules/{addresses,delivery,invoicing,orders,users,webhooks}/services/reencrypt.ts`** — each module's service builds a `ReencryptSpec` (filter, select, `fieldsOf`, ring) and calls the repository-bound `reencryptOf` function.
- **`src/modules/{addresses,delivery,invoicing,orders,users,webhooks}/repository.ts`** — each repository exposes `reencryptOf(model)` as its `reencrypt` method, keeping the Mongoose model internal to the repository.
- **`scripts/ops/reencrypt.ts`** — the ops entry-point that iterates over all registered modules, invokes their reencrypt services, and merges the individual `ReencryptReport`s.
- **`src/kernel/registry.ts`** — registration point that the ops script uses to discover which modules participate in re-encryption.

## Notes

- **Idempotent by design:** `rewrapVersionedSecret` returns the input unchanged when the value is already on the newest key, so a second run produces zero writes.
- **Optimistic concurrency guard:** the `updateOne` filter includes the exact ciphertext that was read. If another writer changed the field between read and write, the update matches 0 rows and the value is simply picked up on the next run.
- **Bypasses Mongoose middleware:** writes go through `model.collection.bulkWrite` (raw driver). No `pre`/`post` hooks fire, `updatedAt` is not bumped, and no application-level ETag changes.
- **Paging is recursive, not a loop:** `reencryptCollection` calls itself for the next page. Depth is bounded by `ceil(collectionSize / 200)`; for a few-million-document collection this is tens of stack frames, not a problem, but worth knowing.
- **`select` uses `+` syntax** (e.g. `'+twoFactorMethods'`) to pull in fields that are hidden by the model's default projection.
- **`dryRun`** still tallies `found` counts (so the operator sees what *would* move) but forces `rewritten` to stay 0 and skips the `bulkWrite` call.
