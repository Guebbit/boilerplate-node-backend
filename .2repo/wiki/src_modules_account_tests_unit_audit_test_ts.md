# src/modules/account/tests/unit/audit.test.ts

## Purpose

Pins the exact string values of `accountAuditActions` (the account module's audit wire contract). Because these strings are read by external dashboards and alert rules, a silent rename or typo would break tooling with no compile-time signal. This test is the module's owner-of-truth for *which* strings appear; the cross-cutting shape test only checks structural invariants (uniqueness, lower-snake-case) and cannot assert values without naming every domain.

## Key elements

- **`describe('the account audit vocabulary')`** — suite scoped to the account module's action set.
- **`'spells every action exactly as the log tooling expects'`** — asserts `accountAuditActions` deep-equals a literal of 21 `AUTH_*` keys mapped to dotted strings (e.g. `AUTH_LOGIN: 'auth.login'`, `AUTH_2FA_CHALLENGE_FAILED: 'auth.two_factor.challenge_failed'`). Any added, removed, or re-spelled entry fails.
- **`'keeps the \`auth.\` prefix the folder name does not control'`** — iterates every value and asserts it starts with `'auth.'`. Exists as a separate guard because the folder is `account/` while the wire prefix is `auth.`; a new action accidentally using `account.*` would pass every other check in the suite.

## Relationships

- **`src/modules/account/audit.ts`** — sole import source; provides the `accountAuditActions` object whose keys and values this test locks down.
- **`tests/cross-cutting/audit-actions.test.ts`** (referenced in the header comment, not imported) — sibling suite that validates shape invariants across all modules; this file is the per-module complement that asserts concrete values.

## Notes

- The strings are a **wire contract**, not an internal enum. Renaming a TypeScript key (`AUTH_LOGIN`) is a safe refactor; changing its string value (`'auth.login'`) silently breaks log ingestion, dashboards, and alert rules outside this repo.
- The `auth.` prefix vs. `account/` folder mismatch is intentional and historical. If you add a new action, use the `auth.` prefix — the dedicated prefix test will catch a `account.*` typo that no other test in the suite would.
- Adding a new action requires updating both this file's literal **and** ensuring it is unique + lower-snake-case (enforced by the cross-cutting test).
