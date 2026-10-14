---
source: src/infrastructure/security/reencrypt.ts
sha256: f3a32a6207e1393bf31789ed36da48ccf1b9f22141be9458c5bd803a9ae26819
generated_at: 2026-10-14T08:17:34.236397+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/security/reencrypt.ts

## Purpose

A generic engine that re-encrypts stored secrets onto the newest key in a versioned ring, enabling safe key rotation. It handles batching, the rewrap call, and the write for any collection; each owning module only describes *where* its encrypted fields live. Designed to be idempotent (a second run writes nothing), concurrency-safe (writes are filtered on the ciphertext read), and silent (bypasses Mongoose hooks via `collection.bulkWrite`).

## Key elements

- **`EncryptedField`** — describes one encrypted value: its dotted `path`, current `stored` ciphertext, `binding`, and human-readable `label`.
- **`ReencryptReport`** — per-field, per-key-version counts (`found`) and total `rewritten` value.
- **`ReencryptJob<T>`** — the full job description: `model`, optional `filter`/`select`, `fieldsOf(document)`, and the `ring` of keys.
- **`ReencryptSpec<T>`** — a `ReencryptJob` minus `model`; what a module's service provides before the repository binds the model.
- **`reencryptOf(model)`** — curried factory that binds a model and returns `(spec, dryRun?) => Promise<ReencryptReport>`; the shape a repository exposes as its `reencrypt` method.
- **`reencryptCollection(job, dryRun?)`** — the core loop: pages documents by `_id` (200/page), tallies each field via `versionOf`, rewraps stale values via `rewrapVersionedSecret`, and applies writes with `bulkWrite`. Recurses internally until a short page.
- **`emptyReport()` / `mergeReports(a, b)`** — report utilities for the ops script to aggregate results across modules.
- **`BATCH_SIZE`** (200) — pages per round-trip to keep memory flat.

## Relationships

- **`./versioned-secret`** — imported for `rewrapVersionedSecret` (the actual re-encryption), `versionOf` (reading the key version from a ciphertext), and the `SecretBinding` / `VersionedKey` types.
- **`scripts/ops/reencrypt.ts`** — the entry point that invokes each module's reencrypt service in turn, collecting and reporting results.
- **Per-module `services/reencrypt.ts`** (addresses, invoicing, orders, users, webhooks) — each exports a `ReencryptSpec` describing that module's encrypted fields, filter, select, and key ring.
- **Per-module `repository.ts`** (addresses, invoicing, orders, users, webhooks) — calls `reencryptOf(model)` to bind the spec to the model, exposing the bound function to the service layer.

## Notes

- Writes go through `job.model.collection.bulkWrite`, deliberately bypassing Mongoose middleware (no `pre`/`post` hooks, no `updatedAt`, no ETag changes). The rationale: re-encryption changes only the envelope, not the content.
- The write filter includes the *original* ciphertext (`[field.path]: field.stored`), so a concurrent edit to the same field is not overwritten; the row is simply picked up on the next run.
- `dryRun` still tallies `found` counts but never calls `rewrapVersionedSecret` for the write path — the report's `rewritten` stays 0.
- Paging uses `_id > cursor` with `sort({ _id: 1 })` and `.lean()`, so it works on any collection with an ObjectId `_id` without requiring a Mongoose document instantiation.
- The `fieldsOf` callback is the only per-collection logic; the engine itself is fully generic.
