# src/modules/account/services/index.ts

## Purpose

Barrel file that aggregates every function in the account-service folder into a single `accountService` namespace and selectively re-exports a small subset by name. It exists so callers (controllers, tests, the module's `../index`) have one import target regardless of which of the six sub-files a function actually lives in.

## Key elements

- **`accountService`** (const object) — the sole namespace export. Carries all 29 functions across authentication, profile, addresses, verification, tokens, and token-cleanup. Every caller that does not import a function by name reaches it through this object.
- **Named re-exports** — `tokenAdd`, `signup`, `login`, `PASSWORD_RESET_TOKEN_TYPE`, `passwordChange`, `passwordChangeWithCurrent`, `updateProfile`, `addressForCheckout`, `sendVerificationEmail`, `EMAIL_VERIFY_TOKEN_TYPE`, `runTokenCleanup`. Only functions that at least one external caller imports by name appear here.
- **Sub-file imports** — pulls functions from `./authentication`, `./profile`, `./addresses`, `./verification`, `./tokens`, `./token-cleanup`.

## Relationships

- **Controllers (all 15 listed neighbors)** import from this file. Some pull the `accountService` namespace; others import individual names (e.g. `post-login` → `login`/`tokenAdd`, `post-logout-everywhere` → `tokenRemoveAll`, `get-sessions` → `sessionsList`, `delete-expired-tokens` → `runTokenCleanup`).
- **`src/modules/account/index.ts`** re-publishes `addressForCheckout` and other names from this file, making it the module-level entry point.
- **`../session/`** sits one layer below: provides JWT signing, refresh-cookie, and expiry config that the sub-files read. Nothing outside the account module imports `../session` directly.

## Notes

- **Dual export, intentional subset.** A function is reachable by name *only* if something outside the folder imports it that way. Functions with no named importers (e.g. `tokenRemoveAll`, address CRUD) are reachable solely through `accountService`. Adding a name to the export list without a caller is a maintenance hazard the file comments call out explicitly.
- **Namespace naming is enforced.** `tests/cross-cutting/service-namespaces.test.ts` fails the build if a module does not export exactly one `<something>Service`. The name is `accountService` (module-level), not a slice like `authService`.
- **Folder rather than single file.** The service was split into six files after passing ~300 lines; the rationale is recorded in `docs/theory/layers.md`. The split is by what operations *do*, not by resource, which is why the address book lives here instead of as a sibling service.
