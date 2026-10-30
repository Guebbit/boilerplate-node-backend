---
source: src/modules/delivery/tests/unit/hold-notice.test.ts
sha256: b2c9bdcbaffc7cfa270bff80a573a177b16c43b0897c3b7ef937436fe119a2bf
generated_at: 2026-10-29T03:49:16.967952+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/hold-notice.test.ts

## Purpose
Unit tests for the buyer-facing hold-notice logic in the delivery module. They lock in two contracts: how an internal hold reason maps to a public notice string, and whether a given reason/message combination triggers a buyer mail.

## Key elements
- **`describe('holdNoticeOf')`** – Verifies the reason→notice mapping (`awaiting_stock`→`awaiting_stock`, `incorrect_address`→`check_address`, `high_risk`→`delayed`, `other`→`delayed`) and asserts that `high_risk` and `other` are indistinguishable to the buyer.
- **`describe('holdNeedsBuyerNotice')`** – Table-driven tests for the boolean "should we mail the buyer?" logic: `awaiting_stock` never mails; other reasons mail only when a custom message is supplied.

## Relationships
- **`src/modules/delivery/domain/hold-notice.ts`** – Contains the `holdNoticeOf` and `holdNeedsBuyerNotice` implementations under test.
- **`src/modules/delivery/domain/index.ts`** – Barrel re-export; the test imports both functions via `../../domain` rather than reaching into the individual file.

## Notes
- The test suite deliberately encodes a **privacy invariant**: `high_risk` must produce the same notice as `other`. If a future change differentiates the two strings, the "cannot tell a risk hold" test will fail — treat that as intentional, not incidental.
- `holdNeedsBuyerNotice` returns `false` for `awaiting_stock` *even when* a message is present; this is a hard rule that the `awaiting_stock` path is handled outside the buyer-mail flow.
