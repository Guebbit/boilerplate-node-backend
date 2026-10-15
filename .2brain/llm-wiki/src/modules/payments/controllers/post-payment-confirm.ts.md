---
source: src/modules/payments/controllers/post-payment-confirm.ts
sha256: 7dc5091369752b74855687314a7b2a4117e6d25255b1706e866d17f9209bd994
generated_at: 2026-10-15T11:23:49.182707+00:00
model: ollama:qwen3.8:27b
---

# src/modules/payments/controllers/post-payment-confirm.ts

## Purpose

HTTP handler for `POST /payments/:id/confirm`. Receives the tokenised payment-method reference from the browser's payment form, delegates to the payment service to complete the charge, and maps the outcome (succeeded, declined, or in-flight) to the appropriate HTTP status and response body.

## Key elements

- **`postPaymentConfirm(request, response)`** – The sole export. Validates the `:id` param, parses the body against `ConfirmPaymentBody`, calls `paymentService.confirmPayment(...)`, sets metrics, and writes the response. Declines produce `409 PAYMENT_DECLINED`; in-flight (`requires_action` / `processing`) and successes both produce `200`.

## Relationships

- **`@infrastructure/http/controller`** – Provides the `parseBody`, `refused`, and `catchAs` helpers used for validation, error mapping, and unhandled-error serialization.
- **`@infrastructure/http/ids`** – `requireId` extracts and validates the `:id` route param (404 on miss).
- **`@infrastructure/http/request`** – `callerContextOf` pulls the caller's context (IP, user-agent, etc.) to pass into the service.
- **`@infrastructure/http/response`** – `successResponse` serialises the 200 body.
- **`../services` (`paymentService`)** – The domain operation actually executed (`confirmPayment`).
- **`../presenter`** – `presentPayment` shapes the `Payment` entity into the public API shape before sending.
- **`../metrics`** – `paymentConfirmTotal` counter is incremented with a discriminated `outcome` label.
- **`../routes`** – Registers this handler at `POST /payments/:id/confirm`.
- **`@types`** – `Payment` type used in the response generic.

## Notes

- **Cross-cutting flag on `request`:** The handler sets `request.paymentConfirmDeclined` (a boolean). This is read downstream by the decline-budget rate limiter's `requestWasSuccessful` (in `rate-limits.ts`) so that only genuine card declines spend budget, not the route's other 409 paths. Any change to this property name or assignment site will silently break that limiter.
- **In-flight is 200, not 4xx:** `requires_action` and `processing` statuses return 200 because the browser still has a next step; a 4xx would signal "stop" to the client.
- **Metric label discipline:** Not-found and race-condition rejections are deliberately *not* counted in `paymentConfirmTotal` (they aren't confirm attempts). In-flight is its own `outcome` label rather than being folded into success or decline, so a spike in challenges is distinguishable from a spike in declines.
