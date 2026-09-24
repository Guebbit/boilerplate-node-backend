---
source: src/modules/account/index.ts
sha256: 6d9c8bf8bdb04371196295aeba895b1f3b08279d496f5c99ff223f362a3f9ea3
generated_at: 2026-09-23T18:05:07.317217+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/index.ts

## Purpose

Public barrel for the Account module. It is the **only** surface a sibling module is permitted to import (enforced by the strategic DDD rule in `docs/theory/strategic-ddd.md` §5). It re-exports the service and email APIs while deliberately withholding internal sub-modules (`session/`, `oauth/`, `two-factor/`) so they remain reachable exclusively through `accountService` or `twoFactorService` rather than as standalone imports.

## Key elements

- **`export * from './services'`** — re-exports the account service surface (e.g. `accountService`, `twoFactorService`) from `src/modules/account/services/index.ts`.
- **`export * from './emails'`** — re-exports the account email templates/helpers from `src/modules/account/emails.ts`.

No types, models, or other declarations are defined here; the file is purely a re-export barrel.

## Relationships

- **`src/modules/account/services/index.ts`** — directly re-exported; provides the service functions that other modules call.
- **`src/modules/account/emails.ts`** — directly re-exported; provides email-sending helpers used by the services.
- **`scripts/ops/reap-inactive-accounts.ts`** — consumes the barrel (via `./services` re-export) to invoke account-service operations during cleanup.
- **`tests/integration/signup-grant-compensation.test.ts`** — imports through this barrel to exercise the account service and email paths in an integration test.

## Notes

- This module **publishes no model of its own** because it owns no database collection. The address-book model lives in `@modules/addresses`.
- `session/` tokens are intentionally *not* re-exported; every request authenticates through `kernel/authentication.ts` instead.
- `oauth/` and `two-factor/` sub-modules are also hidden behind the service objects rather than exposed as separate imports.
