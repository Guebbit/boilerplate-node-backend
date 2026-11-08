---
source: scenarios/subjects.ts
sha256: 6f51dbd2ef90a7347217376fbcc6d3b9e72f57bd792aefedc188f7f8d494a042
generated_at: 2026-11-08T02:32:22.277093+00:00
model: ollama:qwen3.8:27b
---

# scenarios/subjects.ts

## Purpose

Provides a single, fixed `SUBJECTS` constant (admin + user id, email, password) for consumers that cannot import application module code — specifically, generated API client collections loaded on demand. It exists so those consumers have a stable, literal credential pair without pulling in generated artifacts, while keeping the credential source-of-truth in one place.

## Key elements

- **`SUBJECTS`** (const, `as const`) — The only export. Two entries:
  - `admin`: `{ id: SEED_ADMIN_ID, email, password }`
  - `user`: `{ id: SEED_USER_ID, email, password }`

  All fields are re-exported from `@scenarios/accounts`; nothing is defined locally.

- **Imports** — `SEED_ADMIN_ID`, `SEED_USER_ID`, `seedCredentials` from `@scenarios/accounts`. No other dependencies.

## Relationships

- **`scenarios/accounts.ts`** — Sole upstream. Supplies the seed IDs and credentials that `SUBJECTS` re-exports. `accounts.ts` is described in the source as the single place credentials must stay fixed against the paired frontend's `.env`.
- **`scripts/contracts/client-collections-bundle.ts`** — Downstream consumer mechanism. The bundle loads the generated client collections (which read `SUBJECTS`) on demand. The bundler itself is guarded by `.dependency-cruiser.bootstrap.cjs` so it never reaches `api/`; it only ships this file to the collection targets.

## Notes

- This file intentionally holds **only** the two foundation accounts. Module-specific pinned row IDs belong in `scenarios/product-ids.ts`; rows produced at runtime are minted at boot and recorded via `GET /__test/scenario`, so they can never be literals here.
- Credentials are re-exported rather than duplicated to guarantee a single source of truth aligned with the frontend `.env`.
- The file must remain importable without pulling in generated code — that constraint is enforced by the dependency-cruiser guard on the bundler.
