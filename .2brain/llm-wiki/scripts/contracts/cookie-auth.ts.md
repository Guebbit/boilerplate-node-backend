---
source: scripts/contracts/cookie-auth.ts
source_sha256: 96b64d47f3d75308f1d435c53c8e07f3df99e1ec8924b0bfb55c77d461373bf2
context_sha256: 7ce3906802406626923728364add1b15308e75aa30262fc95f9a6ade0bb2b521
generated_at: 2026-11-22T01:55:21.743170+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/cookie-auth.ts

## Purpose
A post-bundle step for the OpenAPI contract build that declares `cookieAuth` as a second authentication alternative on every operation that already accepts `bearerAuth`. It also adds a `403` response to unsafe-method operations. This mirrors runtime behavior: in `cookie` mode the `__Host-session` cookie authenticates the same routes a bearer does, and an unsafe request is refused with 403 unless its `Origin` is an allowed frontend origin (`src/kernel/middlewares/authorizations.ts#continueWithCookie`). The step derives the declaration from `bearerAuth` rather than having it written by hand on each operation.

## Key elements
- `withCookieAuth` (exported `Step`): iterates `operationsOf(document_)` and mutates the document in place. For each operation:
  - Skips it unless its `security` list names `bearerAuth` in at least one alternative.
  - Pushes `{ cookieAuth: [] }` onto `security` if no alternative already has `cookieAuth`.
  - For non-safe methods, sets `responses['403']` to `{ $ref: '#/components/responses/Forbidden' }` unless a `403` is already declared.
- `SAFE_METHODS` (internal): `get`, `head`, `options`. A cookie on these needs no origin check, so they get no `403`.
- `takesBearer` (internal): type guard that checks `security` is an array containing an alternative with a `bearerAuth` key.

## Relationships
- Imports `operationsOf`, `Operation` and `Step` from `./openapi-document`. `Step` is the type of `withCookieAuth`, and `operationsOf` supplies each `{ method, operation }`.
- Runs on the bundled document, like the other post-bundle steps in `./openapi-bundle`.
- Covered by `tests/unit/scripts/contracts/cookie-auth.test.ts`.

## Notes
- An operation's own `403` is never overwritten, since it is more specific than the origin refusal.
- The step is idempotent for `cookieAuth`, because it checks for an existing entry before pushing.
- The `403` references `#/components/responses/Forbidden`. This file does not define that component, so it must exist in the document.
- Operations without `bearerAuth` (including public ones) are left untouched.
- The file's header comment points to `scripts/contracts/fragments.ts` for further background on what a contract fragment contains.
