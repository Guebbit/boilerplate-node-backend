---
source: src/modules/users/factories.ts
sha256: 4ac5c0aadd3f4573534eefc0bfde6aac98ed26be75e2cc5378041b4c8de2444f
generated_at: 2026-09-23T19:32:46.507695+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/factories.ts

## Purpose

Builds user document fixtures (seed accounts and test personas) by supplying only the fields a caller explicitly pins, leaving everything else to the Mongoose schema's defaults. It exists so that seeded rows reflect what the schema actually stores rather than duplicating or guessing at defaults.

## Key elements

- **`PLAIN_PASSWORD`** (`'Fx7$qLwZ9m!'`) — exported constant so tests that log in reference the same string the builder writes. Deliberately not in `breached-passwords/list.txt`.
- **`UserOverrides`** (type) — the set of fields a caller may pin. Derived from the generated `User` type via `OverridesFor`, with `verifiedAt` re-added (widened to `Date | string`) and `password`/`tokens` added back because the response contract omits them. `role` is intentionally excluded.
- **`UserFixture`** (type) — `Partial<UserDocument>` plus a required `_id`; the shape passed to `userRepository.create`.
- **`makeUser(fields?)`** — the builder. Fills `username`, `email`, `password` with sensible defaults, applies `identityOf`/`toDate`/`stripUndefined` from the persistence factory helpers, and returns a `UserFixture`.

## Relationships

- **`src/infrastructure/persistence/factories.ts`** — provides `identityOf`, `stripUndefined`, `toDate`, and `OverridesFor`, the generic helpers this module composes.
- **`src/modules/users/model.ts`** — supplies the `UserDocument` and `Token` types; also owns the pre-save hook that hashes `password` (which is why this factory must keep it plaintext).
- **`src/types/index.ts`** — source of the generated `User` type that `UserOverrides` is derived from.
- **`scenarios/users.ts`** — primary consumer for seed accounts.
- **`scenarios/flows/shop-history.ts`** — consumes `makeUser` / `PLAIN_PASSWORD` to set up flow actors.
- **`src/modules/users/tests/factories.ts`** — re-exports or wraps `makeUser` and `PLAIN_PASSWORD` for the test tree.
- **`src/modules/users/tests/unit/factories.test.ts`** — unit-tests this module directly.
- **`src/modules/users/tests/unit/schema-contract.test.ts`**, **`validation.test.ts`**, **`integration/repository.test.ts`** — consume fixtures built here.

## Notes

- **Password is always plaintext here.** Hashing is the model's pre-save hook's job. Writing a hash in a fixture would desync from that hook.
- **No `role` field.** Roles live on a membership document, not the user document. A fixture needing a role must call `assignRole` / `assignDefaultRole` (`@modules/access`) separately using the `_id` returned by `makeUser`.
- **Schema-owned defaults are intentionally absent** (`imageUrl`, `locale`, `active`, `tokens`, `verifiedAt`) so a seeded row exercises the real schema behavior.
- `PLAIN_PASSWORD` satisfies the real signup password policy (`CreateUserBody.shape.password`) so fixtures can drive actual signup flows, but was chosen to avoid the breached-password list.
