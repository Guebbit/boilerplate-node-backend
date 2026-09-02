# tests/cross-cutting/contract-scalars.test.ts

## Purpose
Guarantees that the shared scalar bounds declared in `infrastructure/http/schemas.ts` stay in lockstep with every per-operation constant that orval generates from `openapi.yaml`. Because orval duplicates a shared component into one constant per endpoint (e.g. forty identical `PageSizeMax` values), infrastructure cannot simply import "the" constant; this test closes that gap so a contract change fails loudly here instead of silently returning 422 for a legal value.

## Key elements
- **`constantsEndingIn(suffix)`** — helper that sweeps the entire `@api/schemas.zod` generated module and returns every `[name, value]` pair whose key ends with the given suffix. No hardcoded endpoint list.
- **`describe('contract scalars')`** — six assertions covering three shared scalars:
  - `PageSizeMax` / `pageSizeSchema` — the contract value must parse, and value+1 must *not* parse.
  - `PageMax` / `pageSchema` — same two-sided check for the maximum page number.
  - `HardDeleteDefault` / `hardDeleteSchema` — the contract value must equal the schema's default.
  - A canary test asserting each suffix yields >5 (or >2) matches, so a silent rename in orval's output doesn't let an empty sweep pass.

## Relationships
- **`src/infrastructure/http/schemas.ts`** — source of `pageSchema`, `pageSizeSchema`, and `hardDeleteSchema`, the Zod parsers whose bounds this test pins against the generated constants.
- **`@api/schemas.zod`** (generated) — the orval output module swept by `constantsEndingIn`; the test never imports a specific operation's constant, only the aggregate module.

## Notes
- The dual assertion pattern (accepts the value, rejects value + 1) catches both a stale upper bound in infrastructure *and* a lowered `maximum` in the contract that would otherwise go unnoticed.
- Coverage is suffix-based, not endpoint-based: adding a new operation to `openapi.yaml` and regenerating automatically extends the sweep with zero test changes.
- The canary length check (>5 / >2) is the only guard against orval changing its naming convention and producing a module where `constantsEndingIn` matches nothing, which would make every `toEqual([])` pass vacuously.
