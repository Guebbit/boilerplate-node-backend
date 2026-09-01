# src/kernel/seed-accounts.ts

## Purpose

Declares the identity and login credentials of the two demo accounts (admin and regular user) as module-level constants. It lives in the kernel rather than `src/modules/users` because multiple modules need to reference these accounts by ID, while only the `users` module owns the actual record. The file exists so the frontend's e2e login flow and every demo-data module can share a single, fixed source of truth for who the demo people are.

## Key elements

- **`SEED_ADMIN_ID`** / **`SEED_USER_ID`** — 24-char hex ObjectIds for the two demo accounts. Both date to February 2024 by their leading bytes.
- **`SEED_ADMIN_EMAIL`** / **`SEED_ADMIN_PASSWORD`** — Login credentials for the admin account (`root@root.it` / `rootroot`).
- **`SEED_USER_EMAIL`** / **`SEED_USER_PASSWORD`** — Login credentials for the regular user (`gino@pino.it` / `password`).
- **`seedCredentials`** — A `const`-asserted object bundling both accounts' email/password pairs, shaped for publication in `demo-data.json` so the frontend can log in as either account.

## Relationships

- **`src/modules/users/demo.ts`, `src/modules/account/demo.ts`, `src/modules/cart/demo.ts`, `src/modules/orders/demo.ts`, `src/modules/wishlist/demo.ts`** — These module demo files consume the `SEED_ADMIN_ID` and/or `SEED_USER_ID` constants to attach demo records to the correct account.
- **`db/demo/assemble.ts`** — The demo-data assembly script pulls credentials (via `seedCredentials`) to embed them in `demo-data.json` for the frontend.

## Notes

- **Passwords are intentionally PLAINTEXT in this file.** The Mongoose schema's pre-save hook hashes them on write. Do not "fix" this by hashing here.
- **Credentials are fixed by contract.** The frontend's e2e login test types these exact strings; changing them breaks the test suite.
- The IDs are *real* ObjectIds created in February 2024, not generated placeholders. They reference documents that must exist in the target database for demo flows to work.
- Reference doc: `docs/tools/demo-profile.md#the-two-seed-accounts`.
