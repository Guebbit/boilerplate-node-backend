---
source: src/app/config-routes.ts
source_sha256: 549ae7282a48c7b4e81218872aa9a7133aef0a743890e28a37c02ed1bcf2f652
context_sha256: c738493862637e50ed7215ea0f85982aa3ed0fa640e66bdf426fe13ed222634f
generated_at: 2026-11-22T02:29:37.037764+00:00
model: claude-code:claude-sonnet-5-5
---

# src/app/config-routes.ts

## Purpose
Defines the public `GET /config` endpoint: a single pre-session answer that a client reads before it has a session. It composes pieces owned by different modules into one response. It lives in `app/` rather than in a module because the answer belongs to no single module's owner. The operator's legal identity is served here, not on `GET /shop`, so the answer still exists if the removable shop is dropped.

## Key elements
- `router`: Express `Router` exporting the `/config` route. `src/app/routes.ts` mounts it at `/`.
- `GET /config` handler: awaits the antibot config, then responds via `successResponse<Config>` with:
  - `session` from `accountService.sessionConfig()`
  - `oauthProviders` from `accountService.oauthProviders()`
  - `antibot` from the awaited antibot config
  - `supportEmail` from `supportEmail()` (the `NODE_SUPPORT_EMAIL` setting)
  - `operator` from `operatorIdentity()`
  - `termsVersion` from `termsVersion()`
- `CACHE_CONTROL`: `'public, max-age=60'`, applied to successful responses only.

## Relationships
- `src/app/routes.ts`: mounts this router.
- `src/modules/account/index.ts`: supplies `accountService`, `operatorIdentity` and `termsVersion`. The `services/` and `consent-record.ts` neighbors are not imported here directly.
- `src/modules/antibot/index.ts` and `src/modules/antibot/service.ts`: supply the antibot service, whose config call is the only async part of the handler.
- `src/infrastructure/adapters/config.ts`: provides `supportEmail()`.
- `src/infrastructure/http/response.ts`: provides `successResponse`.
- `src/infrastructure/http/controller.ts`: provides `catchAs`, which handles failures under the name `'getConfig'`.
- `src/types/index.ts`: provides the `Config` response type.
- `tests/contract/route-spec-parity.test.ts` and `tests/integration/language-neutral-routes.test.ts`: tests that cover this route.

## Notes
- The `Cache-Control` header is set only inside the success branch. It overrides the app-wide `no-store` default (as the sitemap does), so error responses are never cached.
- The cache lifetime is one minute because every piece is read from the environment at boot. Nothing is live per request, and a restart shows up quickly.
- The `.catch` fires when `NODE_ANTIBOT_PROVIDER` or `NODE_ANTIBOT_EMAIL_POLICY` names something this build does not have.
- The route is public and needs no session.
