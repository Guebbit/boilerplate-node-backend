---
source: tests/support/account-export.ts
sha256: d20acc9b0087cb3a1eaf972c2f77160a3f103f97dc8cd54fb3867dc097595df4
generated_at: 2026-10-29T07:05:28.255336+00:00
model: ollama:qwen3.8:27b
---

# tests/support/account-export.ts

## Purpose

Test-support helper that drives the account data-export flow the same way a real client would: submit a request, let the build settle, then download the file. It exists so contract tests can exercise the full ask → build → download sequence in one call without duplicating the HTTP choreography.

## Key elements

- **`DownloadedExport`** (interface) — The resolved shape of a full export cycle: the `POST` response (status, id, location header), the `GET` download status, and the parsed document body.
- **`requestAndDownloadExport(bearer: string)`** (async function) — POSTs to `/account/export`, extracts the export `id`, awaits `settleInlineExports()` to let the inline build finish, then GETs `/account/export/file`. Returns a `DownloadedExport`.

## Relationships

- **`tests/support/http.ts`** — Provides the `api()` helper used for both the `POST` and `GET` requests.
- **`src/modules/account/services/export.ts`** — Provides `settleInlineExports`, the settle hook that resolves the inline build so the subsequent `GET` can fetch the finished file (no message broker in the test environment).
- **`src/modules/account/tests/contract/api.contract.test.ts`** / **`shop.contract.test.ts`** — Consumers of `requestAndDownloadExport`; they call it to assert the end-to-end export contract.

## Notes

- "Waiting" for the build is **not** a poll loop. Because there is no broker in a test run, the build executes inline after the `202`, so `settleInlineExports()` is simply a Promise that resolves when that inline work completes. Do not replace it with a retry/sleep pattern.
- The `location` header on the `POST` response is captured but **not** followed; the download always hits the fixed `/account/export/file` route.
- The bearer token is passed to both calls; the test author is responsible for supplying a valid `Authorization` value.
