---
source: src/modules/account/controllers/post-account-export.ts
sha256: f891b9037b461a274cf4fb0e3b041c40da59f06457a16f7b6a2f2a3bc7542a71
generated_at: 2026-11-08T04:04:11.518115+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-account-export.ts

## Purpose

Thin HTTP adapter for `POST /account/export`. Receives an authenticated request, delegates the actual data-export request to the `requestExport` service, and shapes the HTTP response (status, body, `Location` header). It contains no business logic beyond wiring the caller's identity into the service call.

## Key elements

- **`postAccountExport(request, response)`** — the sole export. Extracts the caller's `id` from `request.authContext`, calls `requestExport(id, callerContextOf(request))`, then either short-circuits via `refused`, or returns `202` with the export payload, its status, and a `Location: /account/export` header (a status-monitor poll target per RFC 9110 §15.3.3, not a redirect). Errors are funnelled through `catchAs`.

## Relationships

- **`src/modules/account/services/export.ts`** — source of `requestExport`, the function that actually initiates the background export. Imported directly rather than through the `accountService` barrel (the barrel deliberately excludes the data-export service; see that barrel's docblock for rationale).
- **`src/modules/account/routes.ts`** — mounts `postAccountExport` behind `requireFreshAuth` (isAuth) middleware; the controller trusts `request.authContext` is populated.
- **`src/infrastructure/http/controller.ts`** — provides the `catchAs` (error-to-HTTP) and `refused` (service-level rejection → 4xx) helpers.
- **`src/infrastructure/http/response.ts`** — provides `successResponse` for the happy-path JSON body.
- **`src/infrastructure/http/request.ts`** — provides `callerContextOf` to build the request-context object passed to the service.

## Notes

- The `Location` header is set via Express's `response.location()` purely as an informational poll target; the client does not follow it. The export file is built asynchronously and a download link is sent by e-mail when ready.
- No additional auth or permission checks exist in this controller — `requireFreshAuth` on the route is the sole identity proof.
- The `!` non-null assertion on `request.authContext` is safe only because the route is always mounted behind the auth middleware; calling this handler outside that route would be undefined behaviour.
