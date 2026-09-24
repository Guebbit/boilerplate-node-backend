---
source: src/modules/account/tests/unit/audit.test.ts
sha256: a69f8eaa0b139f95d4398a113e8bdae63778e8e98b1f7922ee0586bc91307609
generated_at: 2026-09-23T18:14:56.296708+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/unit/audit.test.ts

## Purpose

Unit test that pins the exact string values of every account-domain audit action constant. The strings are a **wire contract** consumed by dashboards and alert rules outside this repository, so renaming a key or changing a value silently breaks external tooling. A cross-cutting test elsewhere verifies only the _shape_ (uniqueness, lower snake_case) across all modules; this file is where the account owner asserts the actual values.

## Key elements

- **`describe('the account audit vocabulary')`** — top-level suite; two `it` blocks.
- **`expect(accountAuditActions).toEqual({ … })`** — asserts all 27 action→string pairs verbatim (e.g. `AUTH_LOGIN: 'auth.login'`, `AUTH_2FA_CHALLENGE_FAILED: 'auth.two_factor.challenge_failed'`). Fails if any key or value drifts.
- **`it('keeps the `auth.` prefix …')`** — iterates `Object.values(accountAuditActions)` and asserts every value starts with `'auth.'`. Guards against a new action accidentally using an `account.*` prefix, which would pass the cross-cutting shape check but violate the wire contract.

## Relationships

- **`src/modules/account/audit.ts`** — sole import. Provides the `accountAuditActions` constant object whose keys and string values this test locks down.
- _(Referenced in comments only, not imported)_ `tests/cross-cutting/audit-actions.test.ts` — the companion suite that checks cross-module shape rules. This file complements it by pinning domain-specific values.

## Notes

- The folder is named `account` but every wire string uses the `auth.` prefix. This is intentional and called out in the test comment; do not "fix" the prefix to `account.*`.
- Adding a new audit action to `audit.ts` requires updating the `toEqual` map here. The second test will also catch a wrong prefix, but only if you omit it from the first test's expected object.
- The file uses no mocks, no fixtures, and no external test utilities beyond a standard Jest `describe/it/expect`.
