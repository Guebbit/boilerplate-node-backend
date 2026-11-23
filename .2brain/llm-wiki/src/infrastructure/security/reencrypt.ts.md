---
source: src/infrastructure/security/reencrypt.ts
generated_at: 2026-11-22T03:09:37.792277+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/security/reencrypt.ts

## Purpose
Generic engine that re-encrypts the stored secrets of one collection onto the newest key of a key ring, so an old key can be retired after rotation. Each owning module describes where its encrypted fields are; this file handles batching, rewrapping and writing. It is the only thing that re-encrypts old rows.

## Key elements
- `EncryptedField` — one encrypted value in a document: `path` (dotted write target), `stored` ciphertext, `binding` (`SecretBinding`), and `label` (used in reports and errors).
- `ReencryptJob<TDocument>` — what a module supplies: `model`, optional `filter` and `select` (for hidden fields), `fieldsOf(document)` returning its `EncryptedField[]`, and the `ring` (first entry is the target key).
- `ReencryptSpec` — a `ReencryptJob` without `model`.
- `ReencryptReport` — `found` (label → key version → count, tallied before any move) and `rewritten` (count of values moved).
- `reencryptOf(model)` — binds the engine to a model and returns `(spec, dryRun = false) => Promise<ReencryptReport>`. This is what a repository exposes as its `reencrypt` method.
- `emptyReport()` / `mergeReports(a, b)` — create a blank report; combine two by merging `found` maps and summing `rewritten`.
- Internal helpers:
  - `tally` — counts a field by its key version.
  - `writeOf` — builds one `updateOne`.
  - `planPage` — tallies a page and builds its writes.
  - `reencryptCollection` — the recursive paging loop.

## Relationships
- `./versioned-secret` supplies `rewrapVersionedSecret`, `keyVersionOf`, `SecretBinding` and `VersionedKey`. All cryptography and key-version parsing happen there.
- The `repository.ts` files of addresses, delivery, invoicing, orders, users and webhooks are the likely consumers of `reencryptOf(model)`, exposing it as `reencrypt` so the model stays inside the repository. Only this file's exports are visible here, so that wiring is inferred from the doc comment and the file layout.
- The `services/reencrypt.ts` files (delivery, invoicing, orders, users, webhooks) and `src/modules/addresses/reencrypt.ts` are the "owning modules" that describe their fields and ring, through a `ReencryptSpec`.
- `scripts/ops/reencrypt.ts` is the ops script that runs the re-encryption, through the owning modules' services.
- `src/kernel/registry.ts` is a graph neighbor, but no interaction with it is visible in this file.

## Notes
- **Paging:** reads 200 rows per batch (`BATCH_SIZE`), sorted by `_id` and continuing from the last `_id` seen. Paging is done by recursive promise chaining, and it stops when a page is shorter than the batch size.
- **Idempotent:** `planPage` only emits a write when `rewrapVersionedSecret` returns a value different from the stored one, so a value already on the newest key produces no write.
- **Concurrency-safe:** each `updateOne` filters on `_id` and on the ciphertext that was read (`[field.path]: field.stored`). If a concurrent edit changed the field, the write matches nothing and the value is picked up on the next run.
- **Quiet writes:** uses the driver's `model.collection.bulkWrite`, bypassing mongoose hooks, `updatedAt` and ETag changes.
- **Dry run:** the field is still tallied, but no rewrap or write happens and `rewritten` stays 0. `found` shows what a real run would act on.
- **`mergeReports` assumes unique labels:** it uses a shallow spread, so a repeated label across reports would be overwritten, not summed.
- Reads use `.lean()`, so `fieldsOf` receives plain objects, not mongoose documents.
