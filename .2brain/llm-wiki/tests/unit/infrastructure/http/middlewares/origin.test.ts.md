---
source: tests/unit/infrastructure/http/middlewares/origin.test.ts
sha256: a3c561e03046569e66b030ce64a9e9fe127c2772757df79b609c476736e2c477
generated_at: 2026-11-08T10:14:51.717901+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/origin.test.ts

## Purpose

Unit-test suite for the `requireAllowedOrigin` Express middleware. It pins the middleware's observable contract: which `Origin` values are admitted, which are refused with `403`, what audit trail a refusal leaves behind, and how the middleware behaves when the allowed-origin list is unset.

## Key elements

- **`run(origin)`** – Local helper that builds a stubbed Express `Request`/`Response`/`NextFunction` tuple, invokes `requireAllowedOrigin`, and returns the stubs for assertion. The request stubs a `POST /account/refresh` whose `get('Origin')` returns the supplied value.
- **`beforeEach`** – Clears the `recordAudit` mock and sets `NODE_CORS_ORIGIN` to `https://shop.example,https://admin.example`.
- **Allowed-origin tests** – `it.each` over the two configured origins asserts `next` is called exactly once.
- **No-Origin test** – Confirms a request with no `Origin` header (curl, same-origin nav) passes.
- **Refusal tests** – `it.each` over foreign origins (`evil.example`, subdomain trick, `http://` scheme mismatch, literal `"null"`) asserts `403` status and that `next` is never called.
- **Audit-behaviour test** – Pass does not call `recordAudit`; refusal calls it once with `action: SECURITY_FORBIDDEN`, `outcome: 'failure'`, and `metadata` containing `reason`, `origin`, `route`, `method`.
- **Origin-length cap test** – Feeds a 500-char origin and asserts the audit `metadata.origin` is truncated to 200 characters.
- **Developer-default test** – Sets `NODE_CORS_ORIGIN` to `undefined`; verifies `http://localhost:8080` is admitted and `http://localhost:9999` is not.

## Relationships

- **`src/infrastructure/http/middlewares/origin.ts`** – The module under test; `requireAllowedOrigin` is the sole SUT.
- **`src/infrastructure/observability/audit.ts`** – `recordAudit` is mocked (partial: only the sink is replaced); `coreAuditActions.SECURITY_FORBIDDEN` is the constant used in assertions.
- **`tests/support/environment.ts`** – `setEnvironment` configures `NODE_CORS_ORIGIN` per test.
- **`tests/support/stub.ts`** – `asStub` creates the typed Express stubs used in `run`.

## Notes

- The suite mocks **only** the audit sink and `callerContextOf`; the middleware's parsing/comparison logic runs for real. This is a black-box test of observable I/O.
- A 200-character cap on the logged `origin` value is a convention enforced by the middleware (or its audit layer), not by the test itself — the test merely pins that cap.
- When `NODE_CORS_ORIGIN` is `undefined`, the middleware falls back to a developer default that admits `http://localhost:8080` specifically.
- The literal string `"null"` (as a browser sends for opaque origins) is treated as a foreign origin, not as "no header."
