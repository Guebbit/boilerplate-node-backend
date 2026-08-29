# docs/tools/security.md

## Purpose

Documentation page that catalogs the project's security tooling (Helmet, CORS, rate-limit, JWT, bcrypt, cookie-parser), explains the split-token auth architecture and its request flow, and records the rationale behind specific security decisions (rate-limit budgets, regex escaping, `trust proxy`, SSE cookie auth, metrics credential, 401-vs-403 policy). It exists so contributors and AI assistants can understand *why* the security middleware is configured the way it is without reverse-engineering the code.

## Key elements

- **Main security tools table** — lists Helmet, cors, express-rate-limit, jsonwebtoken, cookie-parser, bcrypt with a one-line "why" for each.
- **Auth architecture (split-token model)** — access token (Bearer JWT) vs. refresh token (HttpOnly `jwt` cookie); where verification happens (`getAuth`, `verifyAccessToken`, `verifyRefreshToken`, `users.tokens` store).
- **Rate-limit budgets** — global 100 req/min limiter + a separate smaller limiter on `POST /account/login` with `skipSuccessfulRequests`; test-suite budget raised 10× in `tests/support/setup.ts`.
- **Metrics endpoint credential** — static bearer token (`NODE_METRICS_TOKEN`) for Prometheus scraping; deny-by-default when unset; compared via `timingSafeEqual`.
- **Regex-escaping rule** — search terms are escaped before `$regex`; empty/whitespace-only terms yield `undefined` (not `''`) to avoid matching all documents.
- **`trust proxy` / `NODE_TRUST_PROXY_HOPS`** — must equal the actual proxy count; `0` (default) for local/compose; `true` is explicitly warned against.
- **401 vs 403 policy** — 401 = "authenticate and retry", 403 = "known but refused"; all guards follow this.
- **SSE endpoint auth** — `EventSource` cannot set headers, so `isAdminViaCookie` verifies the HttpOnly refresh cookie (signature + DB presence) instead of a Bearer token.
- **Strategy note** — security concerns live near routes/middleware, before business logic.

## Relationships

- **`docs/tools/runtime.md`** — defines the environment variables this page's security behavior depends on (`NODE_METRICS_TOKEN`, `NODE_TRUST_PROXY_HOPS`). Security middleware is inert or misconfigured without the runtime env described there.

## Notes

- The global rate limiter is deliberately per-**minute** (not per-quarter-hour) to avoid locking out legitimate browsing sessions; see the rationale in the file for why a long window is worse.
- `skipSuccessfulRequests` on the login limiter means a correct sign-in spends zero budget — important for shared egress IPs (CGNAT, offices).
- An unset `NODE_METRICS_TOKEN` **denies** access rather than opening the endpoint; the shipped `.env-example` and compose file set it so the stack works out-of-the-box.
- A search term that reduces to an empty string must return `undefined`, not `''`, because `$regex: ''` matches every document — a silent "match all" inversion.
- SSE auth deliberately avoids query-string tokens (`?token=…`) to prevent leakage via access logs, `Referer` headers, and browser history.
