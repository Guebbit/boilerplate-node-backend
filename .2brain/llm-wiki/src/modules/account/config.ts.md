---
source: src/modules/account/config.ts
sha256: 225a4d3c14130616fa3ff46253e0dbea0ff7bb370ea32681c558e7b2a207849c
generated_at: 2026-09-27T14:21:57.221590+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/config.ts

## Purpose

Defines the four token-bearing link kinds that `account` confirmation emails can carry (verify, reset, delete, email-change) and resolves each into a frontend URL. It centralises the env-var overrides and default route templates so that `infrastructure/http/frontend-link.ts` stays module-agnostic — it only formats a template into a URL and never learns about account-specific kinds.

## Key elements

- **`AccountLinkKind`** (type export) — union of `'verify' | 'reset' | 'delete' | 'email-change'`; the exhaustive set of token-bearing links this module supports.
- **`LINK_ENV_VAR`** (const, not exported) — maps each kind to its `NODE_FRONTEND_LINK_*` environment variable name.
- **`LINK_DEFAULT_TEMPLATE`** (const, not exported) — maps each kind to the default frontend route with a `{token}` placeholder (e.g. `'password-reset/confirm?token={token}'`).
- **`accountFrontendLink`** (function export) — resolves a link for a given kind by looking up the env override (falling back to the default template), then delegates to `frontendLink` with the locale and token as parameters.

## Relationships

- **`src/infrastructure/http/frontend-link.ts`** — provides `frontendLink`, imported and called by `accountFrontendLink`. This file is the *caller*; the infrastructure layer performs the actual template interpolation and URL assembly without knowing which module initiated the request.
- **`src/modules/account/emails.ts`** — sibling in the same module; consumes `accountFrontendLink` (and `AccountLinkKind`) to embed the resolved URL in email body copy.
- **`src/modules/account/tests/unit/config.test.ts`** — unit-tests `accountFrontendLink` output (template resolution, env-var fallback, token interpolation).
- **`src/modules/account/tests/unit/emails.test.ts`** — exercises `emails.ts`, which in turn calls into this file's exported function.

## Notes

- The `{token}` placeholder is always substituted by `frontendLink` server-side; the frontend never parses a raw token out of a path.
- Env-var names follow the `NODE_FRONTEND_LINK_<KIND>` convention (KIND uppercased); defaults are documented in `.env-example`.
- The default routes correspond to the paired frontend's own `src/modules/account/routes.ts`; if those routes move, the templates here must be updated in lockstep.
- Per `docs/theory/layers.md`, infrastructure must not reference module names — this file exists precisely to keep that boundary intact.
