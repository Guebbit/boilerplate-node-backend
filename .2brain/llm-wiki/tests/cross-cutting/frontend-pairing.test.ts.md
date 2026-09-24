---
source: tests/cross-cutting/frontend-pairing.test.ts
sha256: 8422453cedc91224dd3cff935a00dc725c451b86b4cd9cc6563585cf010e0574
generated_at: 2026-09-23T19:56:03.422576+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/frontend-pairing.test.ts

## Purpose

Cross-repo pairing test that verifies the hand-written mapping between every enabled backend module and its counterpart module(s) in the `boilerplate-vue-frontend` repository. It exists because the name correspondence is asymmetric (routeless modules, one-screen-multiple-endpoints, frontend-only modules), so a simple name-matcher would produce wrong answers. The test guards both directions: local completeness of the map, and—when the sibling checkout is present—that every claimed frontend name actually exists and every frontend module is accounted for.

## Key elements

- **`Pairing`** (interface) — `counterparts: readonly string[]` (frontend module names covering this domain; empty = no frontend screen) and optional `why?: string` (prose explanation required when names differ or the list is empty).
- **`FRONTEND_PAIRING`** — `Readonly<Partial<Record<string, Pairing>>>`. The authoritative map from 17 backend module names to their frontend counterparts. Notable asymmetric entries: `access`/`antibot` (empty), `addresses`→`account`, `audit-logs`→`admin`, `observability`→`admin`+`realtime`.
- **`FRONTEND_ONLY`** — Frontend modules with no backend counterpart (currently just `demo`).
- **`moduleNames()`** — Derives the enabled backend module names from `enabledModules`.
- **`siblingRoot` / `siblingModules` / `siblingPresent` / `siblingExpected`** — Resolve the sibling frontend path and gate the cross-repo test block. `siblingExpected` reads `process.env.FRONTEND_PATH`, not `CI`.
- **`frontendModules()`** — Lists actual directory names under the sibling's `src/modules/`.
- **`claimedNames()`** — Unions all frontend names referenced in `FRONTEND_PAIRING` counterparts and `FRONTEND_ONLY` keys.
- **First `describe`** — Local integrity: every enabled module has a map entry; no entry references a disabled module.
- **Second `describe`** (conditional on `siblingPresent`) — Cross-repo verification: claimed names exist over there; every module over there is claimed. If the sibling is absent, warns loudly and asserts vacuously when `siblingExpected` is false.

## Relationships

- **`src/modules.ts`** — Imports `enabledModules` to obtain the canonical list of enabled backend modules. The test's local-integrity checks are anchored entirely to this list.
- **`scripts/pairing/paired-frontend-path.ts`** — Imports `resolveFrontendPath()` to locate the sibling frontend checkout. All cross-repo file-system reads depend on this resolved path.

## Notes

- The cross-repo half is **conditional and self-announcing**: when the sibling is absent it emits a `console.warn` (bypassing eslint) rather than silently passing. This mirrors the convention in `tests/unit/scripts/pairing/spec-identity.test.ts`.
- `siblingExpected` is keyed on `FRONTEND_PATH` (whether a developer explicitly configured a checkout), **not** on `CI`. The rationale: the pipeline has a dedicated `spec-identity` job for the cross-repo guard; failing here would make a single-repo clone red for an unresolvable condition.
- The `why` field is free-form prose. No test asserts its shape, length, or grammar.
- Eleven of the seventeen backend modules map 1-to-1 by identical name; the remaining six require the `why` explanation to disambiguate.
- `audit-logs`→`admin` is the canonical example the docblock calls "stated, not derived": a name matcher would flag it as unpaired, which is wrong.
