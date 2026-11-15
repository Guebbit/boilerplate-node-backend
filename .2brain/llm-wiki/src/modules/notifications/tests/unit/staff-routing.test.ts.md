---
source: src/modules/notifications/tests/unit/staff-routing.test.ts
sha256: f8c665ea7588084cd220701a0dfc5ad857332d0151c7e6d5a70e4964e638fcdd
generated_at: 2026-11-14T20:27:49.238191+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/unit/staff-routing.test.ts

## Purpose

Unit tests for the staff-notification routing layer. Verifies that the `STAFF_ROUTES` table is complete and self-consistent (every notice has a valid route, referenced permission sets exist, email timing matches intent), and that the helper functions (`staffLinkOf`, `setsOfRoute`, `callerHoldsAnySet`, `staffNoticeEmail`) resolve links, permission gating, and localized email content correctly across the two served locales.

## Key elements

- **`PAGES`** – alias for `FRONTEND_LINK_RULES.staffPages`; the canonical link templates asserted against throughout the file.
- **`BODIES`** – one valid notice body (code + params) per staff notice code; serves as the fixture set and the expected key set for `STAFF_ROUTES`.
- **`describe('STAFF_ROUTES')`** – asserts route-key parity with `BODIES`, validates that every declared permission set exists in `PERMISSION_SETS`, and checks email timing (`'now'` vs `'none'`) and per-notice set inheritance.
- **`describe('staffLinkOf')`** – verifies link resolution: task notices fall back to the task page, an explicit `work` param takes precedence, assigned tasks stay on the task page, and webhook-disabled notices point at the subscription page.
- **`describe('staffNoticeEmail')`** – parameterized over `en`/`it`; asserts localized subject/summary, correct link with locale prefix and URL-encoding, category/kind naming, and that raw code strings never leak into output.
- **`describe('setsOfRoute')`** – confirms fixed routes return their own sets while `per-notice` routes return the caller-supplied list (or `[]` if none given).
- **`describe('callerHoldsAnySet')`** – exercises the admin-bypass rule and role-based set matching using `callerAs` fixtures.

## Relationships

- **`src/modules/notifications/staff-routing.ts`** – the module under test; provides `STAFF_ROUTES`, `staffLinkOf`, `setsOfRoute`, `callerHoldsAnySet`.
- **`src/modules/notifications/emails.ts`** – provides `staffNoticeEmail`, tested for correct i18n output and link embedding.
- **`src/kernel/permissions.ts`** – `PERMISSION_SETS` is the authoritative list used to validate route declarations.
- **`src/infrastructure/http/frontend-link.ts`** – exports `FRONTEND_LINK_RULES`; its `staffPages` member supplies the expected link templates (`PAGES`) used in assertions.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** – `translator` is used to resolve expected localized strings for assertions.
- **`src/types/index.ts`** – `TaskKind` enum is iterated to ensure every kind has a label in every locale.
- **`tests/support/callers.ts`** – `callerAs` builds role-tagged caller fixtures for permission tests.

## Notes

- `per-notice` routes are a special case: they declare no sets of their own; the producer is responsible for naming sets at emit time. Tests treat `sets === 'per-notice'` as "no sets to validate here."
- `notifications.staff.outbox-dead` is the only notice with `email: 'none'` and no link; email tests explicitly skip it.
- The i18n leak guard checks that the literal string `notifications.staff-mail` (an internal code fragment) never appears in subject or summary output.
- Locale tests are limited to `en` and `it`; adding a served language requires extending the `it.each` arrays and the `BODIES`-driven loops.
- Uses `Array.prototype.toSorted()` (ES2023) rather than in-place `sort()`.
