---
source: scenarios/subjects.ts
sha256: 6f51dbd2ef90a7347217376fbcc6d3b9e72f57bd792aefedc188f7f8d494a042
generated_at: 2026-10-29T01:25:56.321688+00:00
model: ollama:qwen3.8:27b
---

# scenarios/subjects.ts

## Purpose

Exports a single `SUBJECTS` constant holding the two foundation seed accounts (admin and user) as a flat, self-contained object of IDs and credentials. It exists so that consumers that **cannot** import application module code—specifically generated API client collections—can still point at a concrete seeded row without pulling in `api/`-side dependencies.

## Key elements

- **`SUBJECTS`** (`as const`) — the sole export. Two keys:
  - `admin` → `{ id: SEED_ADMIN_ID, email, password }`
  - `user` → `{ id: SEED_USER_ID, email, password }`
  All values are re-exported from `@scenarios/accounts`; nothing is defined locally.
- **Imports** — `SEED_ADMIN_ID`, `SEED_USER_ID`, `seedCredentials` from `@scenarios/accounts`. No other imports.

## Relationships

- **`scenarios/accounts.ts`** — upstream source of truth for seed IDs and credentials. This file is a thin re-shaping layer over it; the credentials are intentionally *not* duplicated here.
- **`scripts/contracts/client-collections-bundle.ts`** — the bundler that produces the generated client collections which read `SUBJECTS` at runtime (on demand). The bundler is guarded by `.dependency-cruiser.bootstrap.cjs` so it can never transitively reach `api/`; this file's doc block explicitly notes it imports "nothing generated" to keep that boundary intact.

## Notes

- Credentials in `SUBJECTS` must stay in lockstep with the paired frontend's own `.env` copy. Changing the seed means updating `scenarios/accounts.ts` (and the frontend env), never this file.
- `as const` makes every property a readonly literal, so callers get exact string/number types without casts.
- This file is *not* a place to add per-module pinned rows—those live beside each module's fixtures (e.g. `scenarios/product-ids.ts`). It is reserved for the two foundation accounts only.
