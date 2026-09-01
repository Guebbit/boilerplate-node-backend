# tests/cross-cutting/frontend-pairing.test.ts

## Purpose
Cross-repo pairing test that verifies the hand-maintained `FRONTEND_PAIRING` map stays consistent with both this repository's enabled modules **and** the actual module folders in the paired `boilerplate-vue-frontend` checkout. It exists because a simple name-matcher gets the mapping wrong (e.g. `audit-logs` → `admin`) and because drift in either direction — a renamed, added, or removed module — is otherwise invisible to either repo's own test suite.

## Key elements
- **`FRONTEND_PAIRING`** — `Readonly<Partial<Record<string, Pairing>>>` mapping each backend module name to its frontend counterpart(s) and an optional `why` sentence. Encodes the two non-1:1 cases (`audit-logs` → `admin`; `observability` → `admin` + `realtime`).
- **`FRONTEND_ONLY`** — Frontend modules with no backend module (currently just `demo`).
- **`Pairing` interface** — Shape of each map entry: `counterparts: readonly string[]` and optional `why: string`.
- **`moduleNames()`** — Projects `enabledModules` (from `src/modules.ts`) to a string array.
- **`frontendModules()`** — Reads the sibling's `src/modules` directory, returns sub-directory names.
- **`claimedNames()`** — Union of every frontend name referenced in `FRONTEND_PAIRING` and `FRONTEND_ONLY`.
- **First `describe` block** — Completeness checks: every enabled module has a map entry; no entry references a disabled module; at least one module is found.
- **Second `describe` block** — Live cross-repo checks (gated on sibling presence): every claimed frontend name exists in the sibling; every sibling module folder is claimed by the map.

## Relationships
- **`src/modules.ts`** — Source of `enabledModules`; the test asserts 1-to-1 coverage between that list and `FRONTEND_PAIRING`'s keys.
- **`scripts/paired-frontend-path.ts`** — Provides `resolveFrontendPath()` to locate the sibling `boilerplate-vue-frontend` checkout; without a valid path the second half is skipped with a visible warning (or a CI assertion failure).

## Notes
- **Conditional sibling check:** The second `describe` block is guarded by `existsSync`. In CI the skip is surfaced as a failing assertion (`expect(message).toBe('')`); locally it prints a `console.warn` and the remaining tests are absent. This mirrors the same guard pattern in `tests/unit/scripts/spec-identity.test.ts`.
- **`why` is unasserted prose:** No test validates its shape, length, or regex. It is documentation, not a contract.
- **Asymmetry is intentional:** `audit-logs` → `admin` and `observability` → `admin` + `realtime` are architectural decisions, not naming drift. A naive name-matcher would flag `audit-logs` as unpaired, which is explicitly called out as the wrong answer in the file's header comment.
- **`FRONTEND_ONLY` participates in the "accounts for every module over there" check** via `claimedNames()`, so adding a new frontend-only module requires an entry here or the test fails.
