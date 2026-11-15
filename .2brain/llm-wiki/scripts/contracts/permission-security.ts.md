---
source: scripts/contracts/permission-security.ts
sha256: ac8b3b176a55bbccaeeb2e989c4fa5876905f48aa6e74df24076ead5a8dd11ec
generated_at: 2026-11-14T17:28:05.178858+00:00
model: ollama:qwen3.8:27b
---

# scripts/contracts/permission-security.ts

## Purpose

A bundler step that derives the 401/403 error codes implied by the permission names in each operation's OpenAPI `security` requirements and merges them into `x-error-codes`. It exists so that contract fragments never have to hand-list permission-driven codes: the bundler reads the standard OAS 3.1 scopes slot and writes the codes automatically.

## Key elements

- **`permissionNamesOf(operation)`** — extracts the deduplicated, first-seen permission names from an operation's `bearerAuth` / `apiKeyAuth` scopes arrays.
- **`sendsEnrollment(name)`** (internal) — for each preset role and verification state, builds a synthetic `AuthContext` to test whether a staff role is currently withheld but *would* hold the rule once `authenticatorArmed` is `true`. Returns `true` if so.
- **`codesOfPermission(name, where)`** (internal) — looks up the rule via `findRule` and returns a `{ '403': [...], '401': [...] }` map. Throws if the name has no rule.
- **`withPermissionErrorCodes: Step`** — the exported pipeline step. Iterates every operation, merges each permission's codes into `x-error-codes` (dedup + `toSorted` per status), and writes back only if the result is non-empty.

## Relationships

- **`src/kernel/permissions.ts`** — source of truth for rules. Imports `findRule`, `PRESET_ROLES`, `staffRoleWithheld`, `callerForSubject`, and the `PermissionSubject` type. All permission semantics are resolved through these; the file never caches or copies rule data.
- **`src/kernel/ability.ts`** — imports `holds` to evaluate whether a given caller/action/subject triple is permitted. Used inside `sendsEnrollment` to test the enrolled-vs-unenrolled pair.
- **`src/types/auth-context.ts`** (via `@types`) — imports `AuthContext` to construct the synthetic contexts in `sendsEnrollment`.
- **`scripts/contracts/openapi-document.ts`** — imports `Operation`, `Step`, and `operationsOf`. Provides the document shape the step mutates and the iteration helper.
- **`scripts/contracts/openapi-bundle.ts`** — consumes `withPermissionErrorCodes` as a step in the bundle pipeline (this file is a `Step` conforming to that contract).

## Notes

- Runs **before** the unknown-code validation step; any code it writes is itself subject to that later check.
- The enrollment check (`sendsEnrollment`) is intentionally conservative: it only considers `id`, `roles`, and `authenticatorArmed` as discriminative; all other `AuthContext` fields are neutral filler.
- Permission names use the `<action>:<Subject>` convention (e.g. `display:Payment`) and are placed in the OAS scopes slot under `bearerAuth` or `apiKeyAuth`—not in a custom extension.
- `toSorted()` is used (non-mutating), implying a modern target (ES2023+ / TS 5.4+).
