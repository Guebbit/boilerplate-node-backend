---
source: src/infrastructure/http/frontend-link.ts
sha256: 363e09a19843813efee5e6c03a308fffa7844c6be1d55f85034c1ae681135ba4
generated_at: 2026-09-23T17:42:41.788973+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/frontend-link.ts

## Purpose

Builds absolute URLs into the paired frontend for email links (account token confirmations and order pages). It lives in the infrastructure layer rather than in either the account or orders module because both need it and a module may only depend downward, not sideways (see `docs/theory/layers.md`).

## Key elements

- **`TokenLinkKind`** — Union type of the four token-bearing link kinds: `'verify' | 'reset' | 'delete' | 'email-change'`.
- **`FrontendLinkKind`** — `TokenLinkKind | 'order'`; the full set of kinds `frontendLink` accepts.
- **`LINK_ENV_VAR`** — Maps each kind to its `NODE_FRONTEND_LINK_*` environment variable name for per-kind route overrides.
- **`LINK_DEFAULT_TEMPLATE`** — Maps each kind to its default relative path template (e.g. `'verify-email/confirm?token={token}'`), where `{token}` or `{id}` are placeholders.
- **`frontendOrigin()`** — Returns `NODE_FRONTEND_URL` or falls back to `http://localhost:8080`. Read lazily so tests can set the env var after import.
- **`supportedLocale(locale)`** — Validates the locale against `listSupportedLocales()`; returns the default locale if unsupported.
- **`frontendLink(kind, parameters)`** — The sole exported function (with overloads). Resolves the template (env var or default), fills in `{token}`/`{id}` via `encodeURIComponent`, and returns `origin/locale/path`.

## Relationships

- **`src/infrastructure/i18n/index.ts`** — Imports `getDefaultLocale` and `listSupportedLocales` to validate and fall back on locale.
- **`src/modules/account/emails.ts`** — Calls `frontendLink` for the four token-bearing kinds (verify, reset, delete, email-change) when composing account confirmation/reset emails.
- **`src/modules/orders/emails.ts`** — Calls `frontendLink('order', …)` when composing order confirmation emails.
- **`src/modules/account/tests/unit/emails.test.ts`** / **`src/modules/orders/tests/unit/emails.test.ts`** — Indirectly exercise `frontendLink` through the email-composition code they test.
- **`tests/unit/infrastructure/http/frontend-link.test.ts`** — Direct unit tests for `frontendLink` (template resolution, locale fallback, env-var override, URL encoding).

## Notes

- The locale segment is **never** part of the template; it is always prepended by `frontendLink` and must be the first path segment on the frontend (every frontend route lives under `/:locale`).
- `NODE_FRONTEND_URL` is read **lazily** (inside `frontendOrigin()`), not at module scope — tests can set it after import. The same pattern is used in `account/oauth/config.ts` for the OAuth callback base.
- `frontendLink` uses function overloads so callers get a precise parameter type per kind (`token` vs `id`), but the implementation signature accepts both as optional.
- `{token}` and `{id}` are URL-encoded with `encodeURIComponent`; the frontend is expected to receive a fully formed query string or path segment, not to parse raw tokens out of the URL itself.
