---
source: tests/cross-cutting/contract-error-declarations.test.ts
sha256: 441e6b60ddcb72b8ec0861462d9afcbf4170a38e03d435a3694e6a9307f86955
generated_at: 2026-11-14T23:02:35.107738+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/contract-error-declarations.test.ts

## Purpose

Cross-cutting contract test that verifies every OpenAPI operation fragment correctly declares the error responses and `x-error-codes` that the runtime guards and the shared id-rule *must* produce. It exists because an undeclared status is not cosmetic: the generated frontend client has no type for it, and the PHP twin's response-schema suite will reject it.

## Key elements

- **`operations()`** — Reads every module's `openapi.yaml` fragment under `MODULES_ROOT`, flattens all path × method pairs into `{ module, route, method, codes[] }` entries.
- **`TAKES_AN_ID`** — Regex (`/\{[^}]*[Ii]d\}/`) matching any path parameter whose name contains "id"; the trigger for the 404 obligation.
- **`takingAnId()`** — Filters `operations()` to those matching `TAKES_AN_ID`.
- **`sendsEnrollment(action, subject)`** — Replays the kernel's ability check for every preset role × verified state to determine whether a guard would emit `SECOND_FACTOR_ENROLLMENT_REQUIRED` (403) for a given ask.
- **`obligationsOf(route)`** — Given a mounted route, returns the list of `{ status, code }` pairs its guards obligate the operation to declare (401 `REAUTH_REQUIRED` from fresh-auth guards or step-up rules, 403 `deniedCode`, 403 enrollment).
- **`specKey(route)`** — Converts a mounted-route path (Express `:param`) to OpenAPI `{param}` form for cross-referencing.
- **`describe('declared error responses')`** — Asserts every id-taking operation lists `404` in its responses.
- **`describe('declared error codes')`** — Three assertions: (1) no non-app-scoped catalogue code is orphaned, (2) every guard-made code is listed on every operation whose route mounts that guard, (3) security-scope permission names match the guard's asks exactly (both directions).

## Relationships

- **`tests/support/paths.ts`** — Provides `MODULES_ROOT` (directory of per-module contract fragments).
- **`tests/support/contract-routes.ts`** — Provides `everyMountedRoute()` and the `MountedRoute` type used to enumerate actual guard mounts and their permission asks.
- **`tests/support/spec-walk.ts`** — Provides `errorCodeIndex()` (catalogue, app-scoped set, per-operation listed codes), `listOperations()`, and `readSpec()` for cross-referencing `x-error-codes` and `security` blocks.
- **`tests/support/stub.ts`** — Provides `asStub<AuthContext>()` to construct synthetic auth contexts inside `sendsEnrollment`.
- **`src/kernel/permissions.ts`** — Source of truth for `PRESET_ROLES`, `findRule`, `ruleId`, `staffRoleWithheld`, `callerForSubject`; the test mirrors the guard's logic through these same helpers.
- **`src/kernel/ability.ts`** — `holds()` is the ability check the test invokes to replicate the guard's enrollment decision.
- **`src/types/index.ts` / `src/types/auth-context.ts`** — `AuthContext` type used when constructing stub contexts.
- **`scripts/contracts/generate-request-content-types.ts`** — Consumes the same contract fragments this test reads; a test failure signals a gap the generator would propagate into the frontend client.

## Notes

- **Reads fragments, not the bundle.** The bundled `openapi.yaml` is generated; a failure there would point at a line nobody edits. This test always resolves back to a per-module fragment.
- **Explicit non-assertion of 500s on three endpoints** (`GET /account`, `GET /observability/events`, `GET /observability/metrics`) — the doc block states whether those are omissions or deliberate shapes is an endpoint-level question requiring a three-repo change.
- **422 for body/query ids** is deliberately out of scope; `tests/integration/malformed-ids.test.ts` covers that path.
- **Canary assertion** (`operations().length > 40`, `takingAnId().length ≥ 20`) guards against a renamed fragment or path-shape change silently emptying the sweep.
- **`sendsEnrollment` uses `as never` casts** on the action/subject parameters because the caller (`obligationsOf`) already typed them via the guard mount; the cast is a type-system acknowledgement, not a runtime escape hatch.
- The `jest.mock` of `@kernel/middlewares/authorizations` delegates to `authGuardsMock()` from `@tests/routes`, so the permission rules exercised here are the real kernel rules, not a separate copy.
