---
source: src/modules/delivery/tests/unit/hold-notice.test.ts
sha256: b2c9bdcbaffc7cfa270bff80a573a177b16c43b0897c3b7ef937436fe119a2bf
generated_at: 2026-11-08T05:45:47.790398+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/hold-notice.test.ts

## Purpose

Unit tests for the buyer-facing hold-notice logic: verifying that internal hold reasons map to the correct buyer-visible notice string, and that a buyer receives a mail notification only when appropriate. Encodes the privacy constraint that a risk-screening hold must be indistinguishable from any other check hold.

## Key elements

- **`describe('holdNoticeOf')`** — Table-driven test asserting the reason→notice mapping (`awaiting_stock`→`awaiting_stock`, `incorrect_address`→`check_address`, `high_risk`→`delayed`, `other`→`delayed`) and a dedicated test that `high_risk` and `other` produce the *identical* string.
- **`describe('holdNeedsBuyerNotice')`** — Table-driven test for the boolean "send a mail" decision, parameterised by reason and an optional pre-existing message. Key rule: `awaiting_stock` never triggers a mail; other reasons mail only when a message is supplied.

## Relationships

- **`src/modules/delivery/domain/hold-notice.ts`** — Source of the two functions under test (`holdNoticeOf`, `holdNeedsBuyerNotice`). This file imports them via the barrel.
- **`src/modules/delivery/domain/index.ts`** — Barrel re-export; the test imports both functions from `../../domain` (i.e., this index), not from `hold-notice.ts` directly. Changing the barrel's export list affects this test's import resolution.

## Notes

- The privacy guarantee is *asserted*, not just implied: the `cannot tell a risk hold from any other reason held for a check` test explicitly compares `holdNoticeOf('high_risk')` to `holdNoticeOf('other')`. Any future mapping that differentiates risk from other reasons will fail this test by design.
- `holdNeedsBuyerNotice` takes an optional `message` parameter (second arg, `undefined` or a string). The mailing rule depends on both the reason *and* whether a message was already set — `awaiting_stock` is a hard no regardless of message.
- Tests use `as const` tuples with `it.each`, so the display names interpolate the literal values; keep the tuple order aligned with the destructuring in the callback.
