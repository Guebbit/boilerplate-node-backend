---
source: src/modules/example/domain/lifecycle.ts
sha256: 6d5c102f54f96a17c0eb32feb56a84d35c940f8672f33890edd50d4328779a5e
generated_at: 2026-10-14T15:41:44.071738+00:00
model: ollama:qwen3.8:27b
---

# src/modules/example/domain/lifecycle.ts

## Purpose

Pure business rules governing the status lifecycle of an example (draft → published → archived). It defines which status transitions are legal, when the `publishedAt` stamp is set, and two small helpers (read-visibility, body-length check) — all without any I/O.

## Key elements

- **`TRANSITIONS`** (module-private) — A read-only map from each `ExampleStatus` to the statuses it may move to. Draft allows published/archived; published allows only archived; archived allows only draft.
- **`initialExampleStatus`** — The status a new example starts at (`draft`).
- **`canTransition(from, to)`** — Returns `true` if the move is allowed, including a same-status "no-op" (a PUT restating the current status must not fail).
- **`isPublished(status)`** — Whether an example in that status is publicly readable (only `published`).
- **`shouldStampPublishedAt(nextStatus, alreadyPublishedAt)`** — Whether a write should set `publishedAt`: only on the *first* transition into `published`; re-publishing after an archive does not overwrite the original date.
- **`fitsBodyLength(body, maximum)`** — Checks whether a body's character count is within a deployment-level ceiling (which may be tighter than the API contract).

## Relationships

- **`src/types/index.ts`** — Provides the `ExampleStatus` enum (imported via the `@types` alias).
- **`src/modules/example/domain/index.ts`** — Barrel file that re-exports this module's public API for consumers within the domain folder.
- **`src/modules/example/services/crud.ts`** — Service-layer caller; consults `canTransition`, `shouldStampPublishedAt`, and `fitsBodyLength` when processing create/update requests.
- **`src/modules/example/tests/unit/domain.test.ts`** — Unit tests exercising every exported predicate against the transition table and edge cases (same-status, re-publish, length boundary).

## Notes

- `TRANSITIONS` is intentionally **not** exported; callers go through `canTransition` so the table shape stays an internal detail.
- The same-status check (`from === to`) is baked into `canTransition` rather than left to the caller, so service code never needs a separate guard for idempotent PUTs.
- `fitsBodyLength` uses a caller-supplied `maximum` rather than a hard-coded constant, allowing per-deployment overrides that sit below the contract ceiling.
