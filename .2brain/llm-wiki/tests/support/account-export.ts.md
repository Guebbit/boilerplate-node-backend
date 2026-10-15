---
source: tests/support/account-export.ts
sha256: 0ad73e8dcd1406308ea3ef1d31a7ee97dea47e682e5fdd60f33fd205654eb9c5
generated_at: 2026-10-15T12:55:51.572396+00:00
model: ollama:qwen3.8:27b
---

# tests/support/account-export.ts

## Purpose

Test-support helper that drives the account data-export flow the way a real client would: POST a request, wait for the inline build to settle, then GET the finished export. It exists so contract tests can exercise the full request→build→download cycle in one call without re-implementing the sequence.

## Key elements

- **`DownloadedExport`** (interface) — the resolved shape: `request` (POST status + export `id`), `status` (GET status), and `data` (the export document as a plain object).
- **`requestAndDownloadExport(bearer)`** (async function, exported) — POSTs to `/account/export` with the given `Authorization` header, calls `settleInlineExports()` to flush the inline build, then GETs `/account/export/:id`. Returns a `DownloadedExport`.

## Relationships

- **`tests/support/http.ts`** — provides the `api()` HTTP-client factory used for both the POST and GET calls.
- **`src/modules/account/services/export.ts`** — provides `settleInlineExports()`, which the helper calls as the "wait" step (no broker in tests, so the build is inline).
- **`src/modules/account/tests/contract/api.contract.test.ts`** — consumer; exercises the export endpoints via this helper.
- **`src/modules/account/tests/contract/shop.contract.test.ts`** — consumer; same usage in shop-scoped contract tests.
- **`src/modules/example/tests/contract/api.contract.test.ts`** — listed as a graph neighbor (likely a shared pattern or cross-reference in the example module's contract tests).

## Notes

- "Waiting" is not a poll. Because tests run without a message broker, the export build completes inline after the `202`, and `settleInlineExports()` is the service's own settle hook. Do not replace this with a retry loop.
- The caller supplies the raw `Authorization` header value (the bearer token string); the helper does not look it up from a fixture or environment variable.
- The GET response body is cast to `Record<string, unknown>`; the actual shape depends on the export service's serialization and is not validated here.
