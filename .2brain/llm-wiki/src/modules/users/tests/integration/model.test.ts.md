---
source: src/modules/users/tests/integration/model.test.ts
sha256: a4ad3fc409b0250974d5f6b85566ffc02e242d765e7fb73e968496de1a8d3669
generated_at: 2026-11-08T08:55:13.236705+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/model.test.ts

## Purpose

Integration tests that verify two invariants of the User model against a real (in-memory) MongoDB: (1) email addresses are stored and matched case-insensitively, and (2) the password hash can never leak into a serialized response. The file asserts both guards independently—`select: false` at query time and `applyUserTransform` at serialization time—so that a regression in either layer is caught.

## Key elements

- **`expectNoCredentials(payload)`** – Serialises `payload` to JSON and asserts the string contains neither the word `password` nor the bcrypt prefix `$2b$`. Applied to every shape that could reach a client.
- **`withCredentials()`** – Thin wrapper around `createUser()` (from `tests/factories.ts`) used as the canonical "seed a user with a password" helper within this file.
- **`describe('email is case-insensitive')`** – Three specs: lowercasing on store, case-insensitive `findForLogin`, and unique-index rejection of a case-only duplicate.
- **`describe('select: false (the safety net)')`** – Confirms `findById`, `findOne`, and `findAll` (lean) omit `password`, while `findByIdWithCredentials` intentionally returns it.
- **`describe('applyUserTransform (the contract boundary)')`** – Verifies `toJSON()` strips the password, rewrites `_id`→`id`, removes `__v`, emits exactly the OpenAPI `User` property set (parameterised via `it.each`), keeps `active` and `deletedAt` independent, defaults `active` to `true`, and that `userService.search` / `userService.getById` serialise lean results identically.

## Relationships

- **`src/modules/users/repository.ts`** – Exercises `userRepository.findById`, `findOne`, `findAll`, and `findByIdWithCredentials` to confirm `select: false` is wired on the schema.
- **`src/modules/users/services/index.ts`** – Calls `userService.findForLogin`, `userService.search`, and `userService.getById` to validate the service-layer serialisation path (including lean results).
- **`src/modules/users/tests/factories.ts`** – Provides `createUser`, the factory that seeds documents (optionally with `password`, `verifiedAt`, `active`, `deletedAt`) into the test database.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is invoked at module load to start an in-memory Mongo and apply Mongoose models before any spec runs.
- **`tests/support/stub.ts`** – `asStub<T>` casts a service-return (which may be a plain object from a lean query) to a typed shape for property access in assertions.

## Notes

- `userService` is imported twice (named `userService` and aliased `userServiceObject`) so that both the barrel re-export and the direct relative path are exercised; the `findForLogin` spec uses the aliased form.
- The "exact property set" spec (`it.each`) intentionally excludes `role`—membership role is owned by `@modules/access`, not the User document.
- `BASE_PROPERTIES` includes `locale` (public, part of the `User` contract) and excludes `password`, `_id`, `__v`—the assertion is a full equality check on `Object.keys`, so adding or removing a field in `applyUserTransform` will fail this test.
- The `active`/`deletedAt` independence test seeds all four combinations in a single `Promise.all` to confirm they are orthogonal columns, not a derived flag.
