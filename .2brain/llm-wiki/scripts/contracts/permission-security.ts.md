---
source: scripts/contracts/permission-security.ts
source_sha256: e84ce8169403a9433af0114b99abe29e644790394225946d8c813bdd81644f5d
context_sha256: b9a882ca0359f3d7cff3f344a00e88634b6e661c8b44c75518677e3c62b765a9
generated_at: 2026-11-22T01:58:53.414334+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/permission-security.ts

## Purpose
Derives the error codes that a permission implies for an OpenAPI operation. A guarded operation names its permission in the scopes list of its `bearerAuth` / `apiKeyAuth` security requirement (e.g. `['display:Payment']`). This bundler step reads those names and writes the resulting 403/401 codes into the operation's `x-error-codes`, so fragments never list them by hand. Rules are read through the kernel, never copied, so the contract answers the same question the guard does.

## Key elements
- `permissionNamesOf(operation)` — exported. Returns the permission names across an operation's security requirements, de-duplicated in first-seen order. Only the `bearerAuth` and `apiKeyAuth` schemes are read.
- `withPermissionErrorCodes` — exported bundler `Step`. For each operation (via `operationsOf`) it merges the codes of every named permission into `x-error-codes`. Codes are de-duplicated and sorted within each status. It sets `x-error-codes` only if the merged result is non-empty.
- `codesOfPermission(name, where)` — internal. Looks up the rule with `findRule` and returns:
  - 403: the rule's `deniedCode`, or `FORBIDDEN` if it has none, plus `SECOND_FACTOR_ENROLLMENT_REQUIRED` when `sendsEnrollment` is true.
  - 401: `REAUTH_REQUIRED` when the rule has a `stepUp` tier.
  - Throws if no rule declares the name.
- `sendsEnrollment(name)` — internal. Builds a neutral `AuthContext` for every preset role and both `verified` values. It returns true if the staff role is withheld (`staffRoleWithheld`) and the rule would hold once `authenticatorArmed` is true but does not hold now. It mirrors `wouldHoldOnceEnrolled`.

## Relationships
- `@kernel/permissions` — supplies `PRESET_ROLES`, `findRule`, `staffRoleWithheld`, `callerForSubject` and the `PermissionSubject` type. These are the rule source of truth.
- `@kernel/ability` — supplies `holds`, which evaluates a rule for a caller. It is called with `PermissionSubject` as the generic.
- `@types` (`src/types/index.ts`, with `AuthContext` from `src/types/auth-context.ts`) — the `AuthContext` type for the synthetic callers.
- `./openapi-document` — supplies the `Operation` and `Step` types and the `operationsOf` iterator.
- `openapi-bundle.ts` — the bundler that runs this step. Per the source comments, the step runs before the unknown-code check, so the codes it writes are validated too.

## Notes
- An unknown permission name fails the bundle with `[openapi] <METHOD> <route>: security names "<name>", which no rule declares.`
- The synthetic `AuthContext` fills everything except `id`, `roles`, `verified` and the armed flag with placeholder values. Only those fields decide the outcome.
- The `holds` calls are widened to the whole `PermissionSubject` union because the generic cannot correlate the rule's action/subject pair.
- The module's doc comment points to `scripts/contracts/fragments.ts` for the design write-up (section "the permission on an operation").
