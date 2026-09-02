# docs/theory/web-attack-defences.md

## Purpose

Maps each attack row from the Web Attack Catalog to the specific control and code location that stops it, so a "clean" verdict is always anchored to a named perimeter. It exists as the defence-side complement to the catalog's theory-only listing, scoped to authentication and session hardening.

## Key elements

- **Revocation and session lifetime table** — links catalog rows (missing invalidation, JWT revocation, session expiry, refresh-token reuse, session hijacking, predictable tokens, plaintext secrets at rest) to controls in `account/session/jwt.ts`, `users/service.ts`, `users/repository.ts`, and `users/model.ts`.
- **A boot that refuses table** — covers misconfiguration guards in `kernel/registry.ts` and per-module `requiredConfig`, proxy-trust warning in `app/security.ts`, and the demo-dataset interlock in `app/demo.ts`.
- **Hardening table** — small cross-cutting controls: page-size caps (`infrastructure/http/schemas.ts`), timing-attack dummy hash (`authentication.ts#DUMMY_PASSWORD_HASH`), `alg` pinning, `x-request-id` UUID validation (`app/request-context.ts`), explicit body limits, and `npm audit fix` targets.
- **Step-up authentication table** — `requireFreshAuth` middleware (`kernel/middlewares/authorizations.ts`) and its per-route mounts in `account/routes.ts`, `cart/routes.ts`, `payments/routes.ts`; freshness claims (`auth_time`/`amr`) in the JWT `TokenData`; remember-me expiry tiers in `account/session/config.ts`.
- **Two-factor authentication table** — MFA-specific controls: dedicated rate limiter (`mfaChallengeLimiter`), server-side challenge verification, TOTP replay protection via `afterTimeStep`, purpose-token separation (`purpose: 'mfa'`), AES-256-GCM secret storage, and the integration bypass test.
- **"What two-factor auth adds, honestly"** — a short narrative callout naming the new attack surface the control introduces (content truncated in source).

## Relationships

- **`docs/theory/web-attack-catalog.md`** — the theory-only catalogue this page references row-by-row; every table cell's first column is a row number from that document.
- **`docs/theory/data-protection.md`** — handles the overlapping set of files from a personal-data lens (retention, consent, redaction, export/erasure); this page explicitly defers to it and keeps only the auth/session slice.
- **`docs/theory/index.md`** — the theory-docs index that lists this page alongside the catalog and data-protection entries.

## Notes

- The page is deliberately scoped to **authentication and session hardening** only; anything about personal-data handling belongs in `data-protection.md`, not here.
- It documents the perimeter the repo reviewed and *left alone*, not just rows a recent change touched — a clean verdict without that context is considered incomplete.
- The "honestly" subsection after the 2FA table is a standing convention: every defence section should name what it newly exposes, not only what it stops.
