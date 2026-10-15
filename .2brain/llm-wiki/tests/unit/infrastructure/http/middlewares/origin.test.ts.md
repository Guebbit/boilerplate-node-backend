---
source: tests/unit/infrastructure/http/middlewares/origin.test.ts
sha256: 3b03a2f7a01c73cd447212bd5943180d7fbdc33ea2bb5269e79da80275408df3
generated_at: 2026-10-15T13:12:46.473238+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/origin.test.ts

## Purpose

Unit-test suite for the `requireAllowedOrigin` Express middleware. It pins the guard's contract: a foreign `Origin` header is rejected with a 403 before `next` is called, while an allowed origin (or no origin) passes through. It also verifies the audit side-effect on refusal and the origin-length cap applied to logged data.

## Key elements

- **`run(origin)`** – helper that builds stubbed Express `Request`, `Response`, and `NextFunction` objects, invokes `requireAllowedOrigin`, and returns the stubs for assertion.
- **`beforeEach`** – clears the `recordAudit` mock and sets `NODE_CORS_ORIGIN` to `'https://shop.example,https://admin.example'`.
- **Allowed-origin pass-through** (`it.each`) – asserts `next` is called exactly once for each configured origin.
- **No-Origin pass-through** – asserts a request without an `Origin` header (curl, health check, same-origin) calls `next`.
- **Foreign-origin refusal** (`it.each`) – covers a different domain, a subdomain-of-attacker pattern, a protocol mismatch (`http` vs `https`), and the literal string `"null"`; all must yield a 403 and never invoke `next`.
- **Audit row** – confirms `recordAudit` is *not* called on pass, but *is* called on refusal with `action: SECURITY_FORBIDDEN`, `outcome: 'failure'`, and metadata containing `reason`, `origin`, `route`, and `method`.
- **Origin length cap** – a 500-char host is logged truncated to 200 characters.
- **Developer default** – when `NODE_CORS_ORIGIN` is `undefined`, `http://localhost:8080` is allowed but an arbitrary localhost port is not.

## Relationships

- **`src/infrastructure/http/middlewares/origin.ts`** – the system under test; `requireAllowedOrigin` is the single exported function under exercise.
- **`src/infrastructure/observability/audit.ts`** – mocked (`recordAudit` replaced with `jest.fn()`); `coreAuditActions.SECURITY_FORBIDDEN` is imported as a real value for the assertion payload.
- **`tests/support/environment.ts`** – provides `setEnvironment` to inject `NODE_CORS_ORIGIN` (or unset it) per test case.
- **`tests/support/stub.ts`** – provides `asStub<T>` to create typed partial stubs for Express `Request`, `Response`, and `NextFunction`.

## Notes

- The test also mocks `@infrastructure/http/request` → `callerContextOf` to pin a deterministic `requestId` (`'request-1'`), isolating the audit assertion from runtime request-scoped data.
- The literal string `"null"` (a known browser quirk for cross-origin requests to `data:`/`file:` URLs) is explicitly treated as a *foreign* origin, distinct from the header being absent.
- Protocol matters: `http://shop.example` is refused even though the hostname matches an allowed `https://` entry.
