---
source: src/modules/account/module.ts
source_sha256: 0a8952faa835ba2773123a77f6462635987f2ff3cba6cdd8061cd088bb86a682
context_sha256: c7e48844f314aed94681942f242275f6c2d814057bb64e65e36e0f2bef929937
generated_at: 2026-11-22T03:31:12.178846+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/module.ts

## Purpose
Manifest entry for the `account` module: authentication and the account lifecycle (signup, login, refresh, password reset, logout everywhere, two-step deletion). It wires the module's routes, jobs, rate limits, personal-data hooks, queue consumer, config slices and domain-event subscriptions into the app's `AppModule` shape. It is a separate service over the same User record that `users` owns, mounted at `/account` (versus `/users`).

## Key elements
- **Default export (`satisfies AppModule`)**: the manifest.
  - `name: 'account'`, mounted at `/account` with `router` from `./routes`.
  - `jobs: accountJobs`, `rateLimits: accountRateLimits`.
  - `config`: `accountConfig.slice`, `sessionConfig.slice`, `oauthConfig.slice`.
  - `reencrypt: reencryptTotpSecrets`: TOTP secrets live on the `users` document but are encrypted under this module's key.
  - `locales` and `templates` point to directories next to the file.
- **`onRegistered(modules)`**: runs once all enabled modules are known. It registers `accountAuthResolver` via `registerAuthResolver`, then calls `setPersonalDataSections(resolvePersonalDataSections(modules))` so `POST /account/export` has its section list.
- **`personalData`**: three sections.
  - `accountExports`: `collect` returns `undefined` (the section is omitted); `erase` calls `eraseExports`.
  - `sessions`: `collect` calls `exportSessions`; `erase` calls `eraseSessionsAndTokens`, which also removes one-time tokens.
  - `erasureLedger`: `collect` returns `undefined`; `erase` calls `recordErasure`, which runs inside the erasure transaction.
- **`consumers`**: handles the `WORKER_CHANNELS.ACCOUNT_EXPORT` queue (`worker.account.export`) with `runExportJob`, validated by `AccountExportJobPayloadSchema`, with `prefetch: 1`.
- **`subscribe()`**: registers domain-event handlers.
  - `USER_SETUP_REQUESTED`: loads the user through `accountUserService` and calls `requestAccountSetup`. It drops the request if the user no longer exists.
  - `USER_DEACTIVATED`: `revokeFor('deactivation', userId)`.
  - `USER_DELETION_CANCELED`: `handleRestoredByStaff`.
  - `ACCOUNT_ANALYTICS_CONSENT_WITHDRAWN`: `resolveAnalyticsProvider().forget(userId)`.

## Relationships
- **`@kernel/registry`**: supplies the `AppModule` type and `resolvePersonalDataSections`. Other modules' `personalData` declarations are gathered through it.
- **`@kernel/authentication`**: `registerAuthResolver` installs the app-wide auth resolver.
- **`@kernel/events`**: `onDomainEvent` is used for all subscriptions.
- **`src/infrastructure/observability/analytics`**: `resolveAnalyticsProvider` is called to forget a user after consent is withdrawn.
- **`./events`**: provides `ACCOUNT_ANALYTICS_CONSENT_WITHDRAWN`. The event is declared in `asyncapi.domain-events.yaml`.
- **`./config`, `./oauth/config`, `./rate-limits`, `./routes`, `./jobs`**: supply the config slices, rate limits, router and jobs registered in the manifest.
- **`@modules/users`**: provides the `USER_*` event constants and `accountUserService` (via `users/friends/account`). The two modules share the User document without an import-graph edge for that.
- **`src/modules.ts`**: the module registry that loads this manifest (inferred from the neighbor listing and `registerModules` in the comments).
- **`src/modules/access/module.ts` and `shared/rules/rate-limits.yaml`**: listed as graph neighbors, but no direct interaction is visible in this file.

## Notes
- The auth resolver is installed in `onRegistered`, not at import time. Importing this file (for a type, or in a test) does not install it.
- The export worker only assembles the sections it is handed. This module resolves the list itself in `onRegistered`, so `POST /account/export` reaches other modules without importing them.
- This module owns `accountexports`, `sessions`, `verificationtokens` and `erasureledgers`. The User document is shared with `users`, so a schema change there must be agreed in both modules.
- If the analytics `forget` call rejects, the dispatch fails. The outbox retries it and parks it as `dead`, which alerts.
- The module doc references `./asyncapi.internal.yaml` for the queue declaration.
