---
source: src/modules/account/tests/integration/persisted-locale.test.ts
sha256: 2479ef3c00a604f1f9a1a9d7baf7d25a523e7d6967a443cb1694b0e716f029cc
generated_at: 2026-09-23T18:13:47.119315+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/persisted-locale.test.ts

## Purpose

Integration tests verifying that the `locale` field on the user document is (1) captured from the request language at signup, (2) falls back to the boot default outside a request, (3) editable after signup via the users service, (4) unaffected by partial updates that omit it, and (5) serialised to the client as part of the public `User` contract.

## Key elements

- **`describe('a user's persisted locale')`** — single suite with five cases covering the two "halves" of the field's lifecycle: capture-at-signup and edit-afterwards.
- **`runWithLocale('it', …)`** (from `@infrastructure/i18n`) — wraps `accountService.signup` to simulate an `Accept-Language` context without a real HTTP request.
- **`getDefaultLocale()`** — used to assert the fallback locale when no request context is present.
- **`accountService.signup(…)`** — exercises the account module's signup path, which is where locale is first persisted.
- **`userService.updateById(id, { locale: 'it' }, …)`** — exercises the users module's update path for the "editable afterwards" and "left alone" cases.
- **`createUser` / `PLAIN_PASSWORD` / `userRepository`** (from `@modules/users/tests/factories`) — test factory and direct repository access for assertions that bypass the service layer.
- **`ResponseSuccess<UserDocument>`** — type-guard for asserting on the shape of service results.
- **`setupTestDb()`** — installs an in-memory database before the suite runs.

## Relationships

- **`tests/support/setup-test-db.ts`** — provides `setupTestDb()` for the in-memory Mongo instance.
- **`tests/support/callers.ts`** — provides `testCallerContext` (authenticated caller identity) passed to every service call.
- **`src/modules/users/tests/factories.ts`** — supplies the `createUser` factory, `PLAIN_PASSWORD` constant, and a direct `userRepository` handle.
- **`src/modules/account/services/index.ts`** — exports `accountService`, whose `signup` method is the primary SUT for the capture-at-signup tests.
- **`src/modules/users/index.ts`** — re-exports `userService` and the `UserDocument` type used in assertions.
- **`src/modules/users/model.ts`** — defines the `UserDocument` shape (including `locale` and `toJSON()`).
- **`src/modules/users/repository.ts`** — underlying repository backing `userRepository.findById`.
- **`src/modules/users/service.ts`** — implementation behind `userService.updateById`.
- **`src/infrastructure/i18n/index.ts`** — exports `getDefaultLocale` and `runWithLocale`.
- **`src/infrastructure/i18n/context.ts`** — request-scoped locale context that `runWithLocale` sets.
- **`src/infrastructure/i18n/catalog.ts`** — locale catalog referenced by the i18n infrastructure.
- **`src/infrastructure/http/response.ts`** — defines `ResponseSuccess`, the discriminated-union envelope asserted throughout.

## Notes

- The file deliberately lives under `account/tests` even though three of the five cases exercise the `users` service, because the field's *origin* (signup) belongs to the account module. The "editable afterwards" and "left alone" cases cross into users-module territory.
- The "left alone" test performs two sequential `updateById` calls and then reads via the repository directly, confirming that omitting `locale` from a partial update does not reset it.
- The `toJSON()` assertion guards against a future regression where `locale` is added to the document but excluded from the public serialisation.
