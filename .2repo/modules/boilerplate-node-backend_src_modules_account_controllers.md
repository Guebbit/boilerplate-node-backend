---
tags:
  - 2repo
  - 2repo/module
  - project/boilerplate-node-backend
type: module
module: src/modules/account/controllers/
files: 20
updated: 2026-08-31T20:52:32.358079+00:00
---

# src/modules/account/controllers/

## Purpose

The HTTP controller layer for the Account module. Each file is a thin Express handler that extracts request context (auth, body, params, cookies), delegates the actual business logic to the account service, and shapes the result into an HTTP response. No domain rules, token minting, or persistence logic lives here.

## Key parts

- **Authentication & sessions** — `post-login.ts`, `post-logout.ts`, `post-logout-everywhere.ts`, `get-refresh-token.ts`, `get-sessions.ts`, `delete-session.ts`. Cover the full session lifecycle: credential login, cookie-based refresh, single/global logout, and session introspection/revocation.
- **Account lifecycle** — `post-signup.ts`, `post-verify-request.ts`, `post-verify-confirm.ts`, `delete-account-request.ts`, `delete-account-confirm.ts`. The signup → verify → (eventual) delete flow, including one-time-token spend patterns and the two-step delete confirmation.
- **Password management** — `post-password-change.ts`, `post-reset-request.ts`, `post-reset-confirm.ts`. Self-service change (current-password proof) and the email-token reset flow, both enforcing identical-response semantics to prevent user enumeration.
- **Profile & addresses** — `get-account.ts`, `put-account.ts`, `get-addresses.ts`, `write-addresses.ts`, `delete-address.ts`. Read/update the caller's own profile and manage the shipping-address book (add, edit, list, remove).
- **Token housekeeping** — `delete-expired-tokens.ts`. Admin-triggered sweep of expired tokens; records a success metric and returns a flat response.

## How it connects

- **`src/modules/account/` (parent)** — Every controller delegates its core operation to a method on `accountService` (e.g. `accountService.refreshAccessToken`, `accountService.signup`). The service owns all token semantics, business rules, and persistence; controllers only translate HTTP ↔ service calls.
- **`src/infrastructure/adapters/`** — Side-effects that outlive a single request (sending verification/reset emails, recording metrics) are emitted from these controllers via infrastructure adapters, keeping the service layer transport-agnostic.
- **`src/modules/users/`** — `put-account.ts` exists as the self-service profile-edit path precisely because the `/users` write routes in the Users module are admin-gated; the two modules cover different authorization contexts for the same data.
- **`src/modules/account/tests/`** — Unit/integration tests that exercise these controllers, typically mocking `accountService` to assert correct request parsing, delegation, and response shaping.

## Where to start

1. **`post-login.ts`** — It's the most involved controller (cookie minting, metrics, audit, analytics) and shows the pattern every other file follows: extract → delegate → shape response → emit cross-cutting concerns.
2. **`delete-account-confirm.ts`** — A good second read because it demonstrates the one-time-token "spend atomically" pattern that also appears in `post-verify-confirm` and `post-reset-confirm`, making the shared token-validation idiom immediately clear.

## Connected modules
```mermaid
flowchart LR
    m_src_modules_account_controllers["src/modules/account/controllers/"]
    m_src["src/<br/>22 files"]
    m_src_infrastructure["src/infrastructure/<br/>43 files"]
    m_src_infrastructure_adapters["src/infrastructure/adapters/<br/>15 files"]
    m_src_modules_account["src/modules/account/<br/>23 files"]
    m_src_modules_account_tests["src/modules/account/tests/<br/>19 files"]
    m_src_modules_users["src/modules/users/<br/>30 files"]
    m_src_modules_account_controllers --- m_src
    m_src_modules_account_controllers --- m_src_infrastructure
    m_src_modules_account_controllers --- m_src_infrastructure_adapters
    m_src_modules_account_controllers --- m_src_modules_account
    m_src_modules_account_controllers --- m_src_modules_account_tests
    m_src_modules_account_controllers --- m_src_modules_users
    style m_src_modules_account_controllers stroke-width:3px
```

[[boilerplate-node-backend_src|src/]] · [[boilerplate-node-backend_src_infrastructure|src/infrastructure/]] · [[boilerplate-node-backend_src_infrastructure_adapters|src/infrastructure/adapters/]] · [[boilerplate-node-backend_src_modules_account|src/modules/account/]] · [[boilerplate-node-backend_src_modules_account_tests|src/modules/account/tests/]] · [[boilerplate-node-backend_src_modules_users|src/modules/users/]]

## Files
- `src/modules/account/controllers/delete-account-confirm.ts` — Handler for `DELETE /account/delete-confirm`. Validates a one-time account-deletion token, spends it atomically, then delegates the hard-delete to the account service. It is the final step in the "confirm deletion" flow (the earlier step only issues the token/link).
- `src/modules/account/controllers/delete-account-request.ts` — Controller handler for `DELETE /account`. Accepts an authenticated user's deletion request, looks up the user by email, and delegates to the account service to mint a one-time confirmation token and send it via email. The token never passes through this layer.
- `src/modules/account/controllers/delete-address.ts` — Thin HTTP adapter for `DELETE /account/addresses/:addressId`. It extracts auth context and the `addressId` param, delegates to `accountService.addressRemove`, and formats the result into an Express response. It exists so the route layer stays declarative while request parsing and response shaping live here.
- `src/modules/account/controllers/delete-expired-tokens.ts` — Thin HTTP adapter for `DELETE /account/tokens/expired`. Wires the Express route to `accountService.adminTokenCleanup`, records a success metric, and formats the response — no business logic lives here.
- `src/modules/account/controllers/delete-session.ts` — Thin HTTP adapter for `DELETE /account/sessions/:sessionId`. It extracts the authenticated caller's id and the target session id from the request, delegates the actual revocation to `accountService.sessionRevoke`, and maps the result to a `200` or `404` HTTP response.
- `src/modules/account/controllers/get-account.ts` — Thin HTTP adapter for the `GET /account` endpoint. It validates the auth context, delegates the actual data fetch to `accountService.getOwnProfile`, and shapes the result into a standard success/reject response. It exists so the route layer stays declarative while the service layer stays transport-agnostic.
- `src/modules/account/controllers/get-addresses.ts` — Thin HTTP adapter for `GET /account/addresses`. It extracts the authenticated user's ID from the request and delegates to `accountService.addressesGet`, returning the caller's full address book. It exists as the read endpoint that write/delete controllers reuse as their "result" shape so clients never need a follow-up read.
- `src/modules/account/controllers/get-refresh-token.ts` — Express route handler for `GET /account/refresh`. Reads the refresh token from the `jwt` `HttpOnly` cookie, conditionally triggers a collection-wide expired-token sweep, then delegates to `accountService.refreshAccessToken` to mint a new short-lived access token. Cookie-only by design so the refresh token never appears in URLs, proxy logs, or `Referer` headers.
- `src/modules/account/controllers/get-sessions.ts` — Thin Express controller for `GET /account/sessions`. It extracts the authenticated user ID and the current refresh-token cookie, then delegates to `accountService.sessionsList` to return the caller's live refresh tokens as a session list. All token semantics (which types count as a session, hiding raw token values, marking the current session) live in the service layer.
- `src/modules/account/controllers/post-login.ts` — The `POST /account/login` HTTP controller. It authenticates a user's credentials via the account service, then mints the full session (refresh token → cookies → short-lived access token). All observability (metrics, audit, analytics) is emitted here rather than in the service layer, because the success signal must fire only after the tokens and cookies actually exist.
- `src/modules/account/controllers/post-logout-everywhere.ts` — Thin HTTP adapter for `POST /account/logout-all`. It delegates the actual token invalidation to `accountService.tokenRemoveAll`, then clears the session cookies on the response. No business logic lives here.
- `src/modules/account/controllers/post-logout.ts` — HTTP controller for `POST /account/logout`. It acts as a thin adapter that reads the refresh token from the request cookie, delegates to `accountService.logoutCurrentSession`, clears the session cookies, and returns a localized success message. It exists to keep the route layer free of business logic while providing a single, predictable logout endpoint.
- `src/modules/account/controllers/post-password-change.ts` — Thin HTTP adapter for `POST /account/password`. Validates the request body, delegates to the account service's `passwordChangeWithCurrent` method (which requires the current password as proof), and maps the service result onto a standardized HTTP response. Exists so the route layer stays declarative while business logic lives in the service.
- `src/modules/account/controllers/post-reset-confirm.ts` — Handles `POST /account/reset-confirm`: validates a one-time password-reset token (delivered via email link), verifies the new password pair, atomically spends the token, sets the new password, and invalidates all active sessions.
- `src/modules/account/controllers/post-reset-request.ts` — Thin HTTP adapter for `POST /account/reset-request`. It validates the request body, delegates to `accountService.requestPasswordReset`, and returns an identical success response regardless of whether the email corresponds to a real account — the core design goal is preventing user enumeration.
- `src/modules/account/controllers/post-signup.ts` — Thin HTTP adapter for `POST /account/signup`. It extracts form fields and the uploaded-image payload from the Express request, delegates to `accountService.signup`, and owns the cross-cutting concerns that must run on **both** the success and failure paths: uploaded-image cleanup, metrics increment, and the fire-and-forget verification email.
- `src/modules/account/controllers/post-verify-confirm.ts` — Handles `POST /account/verify-confirm`: validates a one-time email-verification token in the request body, atomically spends it, and marks the account's email as verified. It is deliberately public (no auth middleware) because the token itself is the credential, mirroring the pattern used by `reset-confirm` and `delete-confirm`.
- `src/modules/account/controllers/post-verify-request.ts` — Thin HTTP adapter for `POST /account/verify-request`. It re-sends the email verification link for a user whose original signup email never arrived. All business logic (including which account states are eligible for re-verification) lives in the service layer; this file only extracts auth context, delegates, and shapes the HTTP response.
- `src/modules/account/controllers/put-account.ts` — HTTP handler for `PUT /account`: lets an authenticated user update their own profile (email, username, locale, image, phone, website). It is a thin adapter over `accountService.updateProfile`, plus two side-effects that accompany a self-service edit — uploaded-image cleanup on failure and a re-verification email when the address changes. It exists as a separate self-service path because the `/users` write routes are admin-gated.
- `src/modules/account/controllers/write-addresses.ts` — Handles the two write operations for shipping addresses (add and edit) in a single file because they share an identical three-step shape: parse body → call the account service → branch on `result.success`. Read and delete handlers live in separate files because they do not parse a request body.

---
[[boilerplate-node-backend_INDEX|← boilerplate-node-backend index]]
