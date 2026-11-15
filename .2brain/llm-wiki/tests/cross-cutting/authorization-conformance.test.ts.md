---
source: tests/cross-cutting/authorization-conformance.test.ts
sha256: 835f1a18203de29df784f9bb45d68436e2fb4dd132607868f781f8db0e1b32f8
generated_at: 2026-11-14T23:01:36.863414+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/authorization-conformance.test.ts

## Purpose

Runs the shared authorization conformance cases (`shared/cases/authorization.cases.yaml`, committed byte-identical in both backends) against this repository's CASL-based evaluator, verifying that every allow/deny decision matches the PHP twin's Laravel Gate/Policy implementation. Also enforces minimum case-count floors so a truncated or empty cases file cannot produce a falsely clean pass.

## Key elements

- **`ConformanceCase` / `CaseCaller`** — interfaces describing one row of the shared YAML file (action, subject type, resource attributes, expected outcome, caller declaration).
- **`callerOf(declared)`** — expands a case's optional `role` / `audience` / raw `permissions` into a full `Caller` via `assembleCaller`, `permissionsOfRole`, and `AUDIENCE_ROLES`.
- **Floor assertions** (`MIN_CASES`, `MIN_DENY`, `MIN_ALLOW`) — first test in the suite; ensures the parsed case list is non-trivial and contains a meaningful split of allow and deny expectations.
- **`it.each` loop** — iterates every case, builds a CASL ability with `buildAbility(callerOf(...))`, evaluates `.can(action, subject(type, attrs))`, and asserts the boolean maps to the expected `allow`/`deny`.

## Relationships

- **`src/kernel/ability.ts`** — `buildAbility` is the CASL ability factory invoked for every case assertion.
- **`src/kernel/permissions.ts`** — supplies `assembleCaller`, `permissionsOfRole`, and `AUDIENCE_ROLES` used by `callerOf` to resolve role/audience declarations into concrete permission sets.
- **`src/types/index.ts` → `src/types/auth-context.ts`** — source of the `Caller` type that `callerOf` returns and that `buildAbility` consumes.
- **`tests/support/paths.ts`** — `isDeployed('orders')` determines whether the shop module is present in the current deployment, which adjusts the floor thresholds (30/20/10 vs. 20/12/6).

## Notes

- The floors are split by outcome (allow vs. deny) deliberately: an evaluator that denies *everything* would pass all deny cases and still look green without the allow floor.
- The YAML file is never copied or synced between the two backend repos; each repo commits an identical file independently (same convention as the Spectral rulesets).
- `subject()` here is the CASL helper that tags a plain object with its type name — the cases describe resource rows, not class instances.
- The cases file is the source of truth for parity: widening a permission in one backend without updating the YAML will not be caught by the other side's tests.
