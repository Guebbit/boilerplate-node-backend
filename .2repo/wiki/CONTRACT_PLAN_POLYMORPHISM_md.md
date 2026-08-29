# CONTRACT_PLAN_POLYMORPHISM.md

## Purpose

A design-planning document that records *where* the API offers multiple spellings of one operation, *where* it deliberately does not, and the rules governing both choices. It resolves two open design questions (source-ranking for `hardDelete`, out-of-set values on reads vs writes), states the trigger threshold for adding a `POST /x/search` sibling, and tracks per-module current state. It is a backlog with verdicts, not a reference for the input-parsing machinery (see `docs/theory/request-input.md` for that).

## Key elements

- **Dispositions** — Two resolved decisions: (1) `hardDelete` uses OR-semantics across sources instead of the default `params > query > body` ranking, implemented via `anyTrue` in `readInput`; (2) out-of-set values match nothing on reads (fail closed) but return 422 on writes (reject).
- **Trigger rule** — Add a `POST /x/search` sibling only when filters exceed ~8 or include arrays/nested objects. Symmetry alone is explicitly rejected as a reason.
- **`/search` sibling rules** — Four invariants: no side effects, sub-resource (never an overload), mount before `/:id` wildcards, server-side caching only (no browser cache, `Cache-Control: no-store`).
- **Cache identity** — Both spellings share one cache entry via a shared `keyAs`; the key is built from a declared `keyParameters` allowlist with normalised values.
- **Checklist (8 touch points)** — The concrete steps to add a new `/search` sibling, from `openapi.yaml` through `CHANGELOG.md` and `npm run contracts:bundle`.
- **Current state table** — Per-module inventory of which endpoints have both spellings (products, users, orders, feedback) and which query-only lists are ranked candidates (audit, locales entries, inventory movements/levels).

## Relationships

- **CHANGELOG.md** — Listed as step 8 of the `/search`-sibling checklist; a new sibling requires a changelog entry before running `npm run contracts:bundle` and `npm run sync:frontend`.

## Notes

- This file **absorbed and replaced** `CONTRACT_PLAN_POST_AS_GET.md` (now deleted). Do not look for that file.
- The frontend registry (`response-schemas.ts` + `response-schema-map.spec.ts`) is the most common source of breakage when adding a sibling: the backend contract gate stays green while the frontend spec goes red.
- `GET /feedback` no longer accepts a body (removed 2026-08-23); only `POST /feedback/search` carries the filter payload.
- The `cart` module uses polymorphism for mutations (add/edit via `POST /cart` vs `PUT /cart/{productId}`), not for reads — a different pattern from the `/search` siblings.
- Mount-order rule (static segment before wildcard) applies to **any** static segment beside a param, not just `/search` (e.g. `GET /products/categories`).
