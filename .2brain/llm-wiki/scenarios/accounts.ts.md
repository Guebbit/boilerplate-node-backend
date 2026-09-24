---
source: scenarios/accounts.ts
sha256: fa4d0982d614d77f1121d9f299b12936aa5190a01c08b06e354e9eea8ff7af76
generated_at: 2026-09-23T17:16:29.426353+00:00
model: ollama:qwen3.8:27b
---

# scenarios/accounts.ts

## Purpose
Defines the four demo seed accounts (admin, user, editor, moderator): their fixed ObjectIds, login credentials, and the role assignments that place them into the access model. Every other scenario file imports the IDs from here so they share a single source of truth for "who exists." It also exposes the `seedAccessModel` function that both the shop and blank scenarios call to materialize those accounts in a fresh database.

## Key elements
- **`SEED_ADMIN_ID`, `SEED_USER_ID`, `SEED_EDITOR_ID`, `SEED_MODERATOR_ID`** – Fixed 24-char ObjectId strings. Changing them breaks the paired frontend's e2e login and any committed test fixtures.
- **`SEED_*_EMAIL` / `SEED_*_PASSWORD`** – Plaintext credentials. Each password reads from a `NODE_SEED_*_PASSWORD` env var, falling back to a committed demo string.
- **`seedCredentials`** – Convenience object mapping role name → `{ email, password }` for the four accounts.
- **`hasFallbackSeedPassword()`** – Returns `true` if *any* account is still on its public fallback password. `scenarios/apply.ts` uses this to refuse running outside development/test.
- **`seedAccessModel()`** – Calls `bootstrapAccessModel('The Demo Shop')`, then assigns roles: admin gets `tenant/admin` **and** `platform/operator`; user gets `tenant/customer`; editor gets `tenant/editor`; moderator gets `tenant/moderator`.

## Relationships
- **`src/modules/access/index.ts`** – Imports `assignRole` and `bootstrapAccessModel`; the only external dependency of this file.
- **`scenarios/apply.ts`** – Calls `hasFallbackSeedPassword()` as a gate before seeding; the primary consumer of the safety check.
- **`scenarios/blank.ts`** – Calls `seedAccessModel()` to create the same four accounts in a blank-profile database.
- **`scenarios/index.ts`** – Aggregates/exports the scenario modules, including this one.
- **Other scenario files (`addresses.ts`, `subjects.ts`, `users.ts`, `wishlist.ts`, `flows/shop-history.ts`)** – Import the `SEED_*_ID` constants to reference specific accounts in their test flows.
- **`src/app/demo.ts`** – Demo app entry point; consumes `seedCredentials` for its login form.
- **`tests/integration/scenarios/apply.test.ts`, `tests/integration/scenarios/shop.test.ts`** – Integration tests that exercise the seed accounts and role assignments.

## Notes
- **Passwords are intentionally plaintext in source.** The Mongoose pre-save hook on the User schema hashes them on first write; the stored values must remain readable here because the frontend's e2e harness types them into a login form.
- **Env var names encode the role, not the "slot".** e.g. `NODE_SEED_ADMIN_PASSWORD` corresponds to the `admin` role the account actually holds, matching the paired frontend's own `.env` naming. Do not rename to match the variable prefix pattern (`NODE_SEED_USER_PASSWORD` → the *user* slot).
- **`root` holds two memberships by design** (tenant admin + platform operator). This is the only account with a `platform`-scoped role and exists to demonstrate the platform/tenant split in a single login.
- **The ObjectIds are real and date-stamped** (leading bytes ≈ Feb 2024). They are not generated at runtime; treat them as immutable identifiers.
