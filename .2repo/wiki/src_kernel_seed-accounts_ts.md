# src/kernel/seed-accounts.ts

## Purpose

Centralises the fixed identity and credentials of the two demo (seed) accounts so that four unrelated modules can reference the same IDs and log-in values without each defining its own string literals. Lives in the kernel specifically because the `users` module owns the records but `account`, `cart`, `orders`, and `wishlist` all need a handle on "who is admin" and "who is the regular user."

## Key elements

- **`SEED_ADMIN_ID` / `SEED_USER_ID`** — 24-char hex ObjectIds (dated to February 2024 by their leading bytes). Used by every module that needs to FK-reference the demo people.
- **`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`** — Fixed login pair for the admin account (`root@root.it` / `rootroot`).
- **`SEED_USER_EMAIL` / `SEED_USER_PASSWORD`** — Fixed login pair for the regular user account (`gino@pino.it` / `password`).
- **`seedCredentials`** — Read-only (`as const`) object bundling both email/password pairs under `admin` and `user` keys. Consumed by `demo-data.json` generation so the frontend can log in without hard-coding values.

## Relationships

- **`src/infrastructure/persistence/seed.ts`** — Imports these constants and inserts the corresponding records into the database during seeding.
- **`src/modules/users/demo.ts`** — Owns the `User` document creation for both IDs; the only module that writes the records.
- **`src/modules/account/demo.ts`**, **`src/modules/cart/demo.ts`**, **`src/modules/orders/demo.ts`**, **`src/modules/wishlist/demo.ts`** — Import the ID constants to FK-reference the demo accounts when building their own demo data.
- **`db/demo/assemble.ts`** / **`db/demo/index.ts`** — Aggregate the per-module demo fixtures into a single `demo-data.json` output; the `seedCredentials` export is what ends up in that file.
- **`docs/tools/demo-profile.md`** — Human-readable documentation that quotes the same credentials; keep in sync if values ever change.

## Notes

- **Passwords are deliberately plaintext here.** The Mongoose pre-save hook on the `User` schema applies hashing at write time. Writing a pre-hashed value would cause a double-hash mismatch.
- **Do not change the credential strings.** They are baked into the frontend's e2e login flow and quoted verbatim in two READMEs. Treat them as a public, immutable contract.
- **The ObjectIds are not random.** Their leading timestamp bytes are fixed to February 2024 so that "account created date" in the UI always reads the same. Regenerating them with `Object()` would break that expectation.
- The file is intentionally tiny and side-effect-free (no imports, no I/O) so it can be imported from any layer without pulling in infrastructure.
