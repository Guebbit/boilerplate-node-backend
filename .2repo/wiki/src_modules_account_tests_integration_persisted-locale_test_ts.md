# src/modules/account/tests/integration/persisted-locale.test.ts

## Purpose

Integration tests that verify the `locale` field on the user document is (a) captured from the incoming request at signup, (b) writable afterwards via the users service, (c) preserved by unrelated updates, and (d) exposed to the client. The field exists so that stateless background workers (e.g., sending email at 3 a.m.) have a request-independent language source, which `Accept-Language` alone cannot provide.

## Key elements

- **`describe('a user's persisted locale')`** — top-level suite containing five assertions.
- **`it('is captured from the request they signed up in')`** — wraps `accountService.signup` in `runWithLocale('it', …)` and asserts the persisted `locale` is `'it'`.
- **`it('falls back to the boot locale outside a request')`** — signs up without a locale context and asserts the value equals `getDefaultLocale()`.
- **`it('is editable afterwards')`** — creates a user via the factory, then updates `locale` through `userService.updateById`.
- **`it('is left alone by an update that does not mention it')`** — sets `locale`, then updates only `username`, and re-reads the document to confirm `locale` is unchanged.
- **`it('reaches the client, since it is part of the User contract')`** — asserts `UserDocument.toJSON()` includes the `locale` key.

## Relationships

- **`src/modules/account/services/index.ts`** — the SUT: `accountService.signup` is exercised to verify locale capture at registration.
- **`src/modules/users/index.ts`** — re-exports `userRepository` and `userService`, which the tests use for post-signup edits and direct document reads.
- **`src/modules/users/service.ts`** — `userService.updateById` is the mutation path under test.
- **`src/modules/users/repository.ts`** — `userRepository.findById` provides the raw document read-back for assertions.
- **`src/modules/users/model.ts`** — defines `UserDocument` and its `toJSON()` method, both asserted on.
- **`src/modules/users/tests/factory.ts`** — `createUser` seeds a user for the edit/preservation/exposure cases.
- **`src/infrastructure/i18n/context.ts`** — provides `runWithLocale`, the request-scoped locale carrier simulated in the first test.
- **`src/infrastructure/i18n/catalog.ts`** — provides `getDefaultLocale`, the expected value when no request locale is present.
- **`src/infrastructure/i18n/index.ts`** — barrel re-export through which both of the above are imported.
- **`src/infrastructure/http/response.ts`** — supplies the `ResponseSuccess` type used to narrow `result` for field assertions.
- **`tests/support/caller-context.ts`** — `testCallerContext` is the minimal caller argument required by the service/repository calls.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the in-memory database at module scope before any test runs.

## Notes

- `setupTestDb()` is invoked at module top-level (outside `beforeEach`); it must be idempotent or a one-shot.
- The file's header comment is the normative spec for *why* this field lives in `account`'s tests rather than a central i18n suite: signup (which captures the value) is behind account routes.
- Edit tests deliberately route through the `users` barrel (`userService`), mirroring the production surface, rather than an account-specific endpoint.
- All email addresses are unique per test (`nuovo@`, `plain@`, `switcher@`, `untouched@`, `exposed@`) to avoid cross-test interference even though the suite does not call `setupTestDb` per test.
