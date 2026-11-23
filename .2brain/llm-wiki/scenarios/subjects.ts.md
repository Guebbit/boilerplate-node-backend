---
source: scenarios/subjects.ts
source_sha256: cceac07262c2b33fd6a8b5b41ed8bbbee1915e5d0244a52138676939b05c8266
context_sha256: b0a876088f75cb18ef7d5662c1ae728afe0daa88065be5f1e0ad094d278ec3bd
generated_at: 2026-11-22T01:46:09.606457+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/subjects.ts

## Purpose
Exposes the ids and login credentials of the two foundation seed accounts (admin and ordinary user) as a single constant. It exists for consumers that can't import module code but still need to point at a specific seeded row, namely generated API client collections whose examples need a *working* request.

## Key elements
- `SUBJECTS` (const export, `as const`): an object with two entries, `admin` and `user`. Each has `id`, `email` and `password`.
  - `id` comes from `SEED_ADMIN_ID` / `SEED_USER_ID`.
  - `email` and `password` come from `seedCredentials.admin` / `seedCredentials.user`.

## Relationships
- **`scenarios/accounts.ts`**: the only import (`@scenarios/accounts`). `SUBJECTS` re-exports its ids and credentials rather than duplicating them. The seed passwords come from app config there.
- **`scripts/contracts/client-collections-bundle.ts`**: a graph neighbor. The header says the collections that read this file are loaded on demand, and that the bundler must never import anything generated. The file does not import the bundle script itself.

## Notes
- It deliberately imports nothing generated. `.dependency-cruiser.bootstrap.cjs` guards the bundler against reaching `api.generated/`.
- It covers the foundation's two accounts only:
  - A module's own pinned rows live beside its fixtures (e.g. `scenarios/product-ids.ts`).
  - Values the flows produce are minted at boot and recorded by the runner (`GET /__test/scenario`), so they can't be literals here.
- `scenarios/accounts.ts` is the single place credentials must stay fixed against the paired frontend's own `.env` copy. Change them there, not here.
