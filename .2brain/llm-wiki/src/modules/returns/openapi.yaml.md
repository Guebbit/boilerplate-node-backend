---
source: src/modules/returns/openapi.yaml
source_sha256: cd227a53c7f8ed6f317e3f64b0df1e8e1912e7b77e8fdf3a21a8664aa32f28e0
context_sha256: cf6206d579959218d53ed0cd6b0716e1542f4dec284a88bf70ed655335bcfb54
generated_at: 2026-11-22T07:26:33.170033+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/openapi.yaml

## Purpose
This is the OpenAPI 3.1.0 contract for the `returns` module (version `0.1.0`). It defines the module's HTTP operations, its error codes, and its contribution to the account data export. It covers sending goods back, including the EU withdrawal button (a return with `reason: withdrawal`), and cancelling unshipped goods.

## Key elements
- **`tags`**: a single `Returns` tag, in the `After the sale` family.
- **`x-error-codes`**: the module's error catalogue, each entry with an HTTP status and a description. Examples:
  - 422: `RETURN_DEDUCTION_INVALID`, `RETURN_REMEDY_INVALID`, `RETURN_LINES_INVALID`, `RETURN_PROOF_DATE_INVALID`, `RETURN_RESTOCK_INVALID`, `RETURN_CANCELLATION_INVALID`, `RETURN_STATEMENT_INVALID`.
  - 409: `RETURN_NOT_RECEIVABLE`, `RETURN_PROOF_ALREADY_RECORDED`, `RETURN_REFUND_OPENED_ON_PROOF`, `RETURN_REFUND_OPEN`, `RETURN_NOT_CLOSABLE`, `RETURN_NOT_CANCELABLE`, `RETURN_NOT_DECIDABLE`, `RETURN_ORDER_NOT_RETURNABLE`, `RETURN_NOTHING_TO_CANCEL`, `RETURN_WINDOW_CLOSED`.
- **`x-personal-data.returns`**: this module's section of the `POST /account/export` response. It is an array of `ExportReturn` (`#/components/schemas/ExportReturn`) covering every return on the account's own orders, found by `orderId`. It is empty, never absent, when nothing was returned. The bundler adds it to `AccountExportResponse`.
- **`GET /returns`** (`listReturns`): a paginated list, `bearerAuth`, `x-cache: private-no-cache`.
  - Staff with `read:Return` see all returns. Anyone else sees returns on their own orders.
  - Filters: `orderId`, `status`, `reason`, and a JSON:API-style `sort` (e.g. `-createdAt,status`).
  - Responses: 200 `ReturnsResponse`, 401, 422.
- **`POST /returns`** (`createReturn`): the single entry point for opening a return, a withdrawal, or a cancellation.
  - It takes an `Idempotency-Key` header and a `CreateReturnRequest` body, and answers 201 with a `Return` and a `Location` header.
  - **`kind: return`** (the default) is for goods that have left.
    - The buyer opens one for any reason whose deadline is open.
    - Staff with `update:Return` open one on the buyer's behalf. It is born `approved`, and waived policy checks are recorded in `policyExceptions`.
  - **Withdrawal after shipping**: born `approved`.
  - **Withdrawal before dispatch**: cancels the order with a full refund and releases stock. The `Return` is born `closed`.
  - **`kind: cancellation`**: cancels the remainder of one fulfillment order (`fulfillmentOrderId`). It is born `closed`.
    - Staff need `create:Refund` and a fresh session (`stepUp: critical`).
    - The buyer uses it only as part of a withdrawal.
  - **Staff-recorded withdrawals**: staff can record a withdrawal the buyer stated outside the shop. This requires `requestedAt` and `statedVia` (`phone`, `email`, `letter`, `other`), and asks for a fresh session.
  - **Operation `x-error-codes`**: 401 `REAUTH_REQUIRED`; 409 `IDEMPOTENCY_IN_FLIGHT`, `RETURN_NOTHING_TO_CANCEL`, `RETURN_ORDER_NOT_RETURNABLE`, `RETURN_WINDOW_CLOSED`; 422 `IDEMPOTENCY_KEY_MISMATCH`, `RETURN_CANCELLATION_INVALID`, `RETURN_LINES_INVALID`, `RETURN_STATEMENT_INVALID`, `RETURN_REMEDY_INVALID`.
- **Local schema refs** used by the visible operations: `ReturnStatus`, `ReturnReason`, `ReturnSort`, `ReturnsResponse`, `CreateReturnRequest`, `Return`, `ExportReturn`.

## Relationships
- The descriptions of `POST /returns` depend on order-side behavior (whether a withdrawal happens before or after dispatch, and cancelling an order with a refund). This suggests a link to `src/modules/shop/openapi.yaml`, but this is an inference: the visible content has no direct `$ref` to that file.
- The permission names used in descriptions (`read:Return`, `update:Return`, `create:Refund`, `update:Order`) are presumably defined by `src/modules/returns/authorization.yaml`. This is also an inference.
- No visible reference to `src/modules/returns/asyncapi.webhooks.yaml`.

## Notes
- A withdrawal is not a separate endpoint. It is a return with `reason: withdrawal`, and its outcome depends on whether the goods have shipped.
- The server sets `requestedAt` and `statedVia` for the buyer. If the buyer sends either, the request fails with 422.
- Only `defective` or `wrong_item` returns can have a remedy other than a refund (`RETURN_REMEDY_INVALID`). A handling deduction cannot be kept back on those reasons (`RETURN_DEDUCTION_INVALID`).
- The client never counts days itself; the description says an order-level `actions.withdraw` flag says whether the withdraw button is offered.
- Removing the module removes its section of the account export.
