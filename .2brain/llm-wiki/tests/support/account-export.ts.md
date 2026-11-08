---
source: tests/support/account-export.ts
sha256: d20acc9b0087cb3a1eaf972c2f77160a3f103f97dc8cd54fb3867dc097595df4
generated_at: 2026-11-08T09:50:44.711251+00:00
model: ollama:qwen3.8:27b
---

# tests/support/account-export.ts

## Purpose

Test-support helper that drives the account data-export flow the way a real client would: POST a request, wait for the inline build to settle, then GET the finished file. It exists so contract tests in multiple modules can share a single, correct sequence without re-implementing the wait-then-download dance.

## Key elements

- **`DownloadedExport`** (interface) — The resolved shape of a full export round-trip: the initial `POST` status/id/location, the `GET` status, and the downloaded body as `Record<string, unknown>`.
- **`requestAndDownloadExport(bearer: string)`** (async function, exported) — Performs the three-step sequence:
  1. `POST /account/export` with the given `Authorization` header; captures status, `id`, and `Location` header.
  2. Awaits `settleInlineExports()` to let the inline build finish (no broker in tests, so the "wait" is a settle hook, not a poll).
  3. `GET /account/export/file` with the same bearer; captures status and body.
  Returns a `DownloadedExport` combining all three responses.

## Relationships

- **`tests/support/http.ts`** — Provides the `api()` HTTP client used for both the POST and GET requests.
- **`src/modules/account/services/export.ts`** — Source of `settleInlineExports()`, called between the POST and GET to ensure the inline export build has completed before the file is fetched.
- **`src/modules/account/tests/contract/api.contract.test.ts`** — Consumes `requestAndDownloadExport` to exercise the API contract.
- **`src/modules/account/tests/contract/shop.contract.test.ts`** — Consumes the helper for shop-related export assertions.
- **`src/modules/example/tests/contract/api.contract.test.ts`** — Also imports the helper, indicating it is reused outside the account module.

## Notes

- The "wait for build" step relies entirely on `settleInlineExports()`; there is no polling loop. This is correct only because tests run without a message broker, so the build executes inline after the `202`.
- The `Location` header on the POST response is captured but is **not** used to construct the GET URL — the file endpoint is hardcoded to `/account/export/file`.
- The bearer token is passed as a plain string (the full `Authorization` header value), not as a raw token.
