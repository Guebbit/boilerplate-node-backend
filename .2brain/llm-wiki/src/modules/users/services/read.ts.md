---
source: src/modules/users/services/read.ts
sha256: 8126fab722dc835935a2cdbe989bef60f3544fe5e43d978eb13d6b18fe474b54
generated_at: 2026-10-15T12:10:59.867201+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/read.ts

## Purpose
Read-only service layer for user lookups used by the admin panel. It wraps the user repository to provide search, single-fetch by ID, and find-by-email operations, returning either DTO-friendly (`UserWire`) or full-document (`UserDocument`) shapes depending on the caller's needs.

## Key elements
- **`search(filters?)`** — Queries users via `userRepository.search`. Accepts an optional `SearchUsersRequest` and returns `{ items: UserWire[], meta: PaginatedMeta }`. Returns the wire/DTO shape, not the raw document.
- **`getById(id?)`** — Fetches a single user by ID through `userRepository.findById`. Short-circuits to `Promise.resolve(undefined)` when `id` is falsy; otherwise resolves to `UserDocument | undefined`.
- **`findByEmail(email)`** — Fetches a user by email via `userRepository.findOneWithCredentials`. Returns `UserDocument | undefined | null`. Deliberately loads credentials (see Notes).

## Relationships
- **`src/modules/users/repository.ts`** — All three functions delegate to `userRepository` (`search`, `findById`, `findOneWithCredentials`).
- **`src/modules/users/model.ts`** — Provides the `UserDocument` and `UserWire` type contracts used in signatures.
- **`src/types/index.ts`** — Supplies `SearchUsersRequest`, the filter shape accepted by `search`.
- **`src/infrastructure/persistence/search.ts`** — Supplies `PaginatedMeta`, the pagination metadata returned alongside search results.
- **`src/modules/users/services/index.ts`** — Re-exports these functions as the public API of the users service.

## Notes
- `search` returns `UserWire` (DTO), while `getById` and `findByEmail` return the full `UserDocument`. Callers needing the raw document should use the latter two.
- `findByEmail` uses `findOneWithCredentials` specifically so that password/token fields (normally hidden by `select: false`) are populated. The documented callers (reset-request, delete-request) immediately attach a token to the returned document and would break if those fields were absent.
- The `active` field in search filters is a plain boolean column handled by `searchable.booleans`; it is independent of `deletedAt` and should not be conflated with soft-delete logic.
