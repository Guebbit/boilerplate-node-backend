# CONTRACT_PLAN_POLYMORPHISM.md

## Purpose
A design-decision record that documents where the API offers multiple spellings of one operation (e.g. `GET /x` vs `POST /x/search`), the rules that govern each spelling, and the cost/benefit thresholds for adding new ones. It is a backlog with verdicts—not a description of the request-input machinery (see `docs/theory/request-input.md` for that). Absorbed and replaced `CONTRACT_PLAN_POST_AS_GET.md` on 2026-08-24.

## Key elements
- **Disposition 1 — Source ranking with `hardDelete` exception:** Default precedence is `params > query > body` per surface. `hardDelete` is OR'd across sources via `anyTrue` on the `readInput` declaration in `src/infrastructure/http/request.ts`; a single `true` wins, and undecodable values pass through to 422.
- **Disposition 2 — Closed-set values, read vs write:** Unknown enum values on a read filter to "match nothing"; on a write they 422 via the Zod schema before the handler runs. Read half: `toFeedbackStatus` in `src/modules/feedback/service.ts`. Write half: `put-feedback-status.ts`.
- **Trigger rule:** Add a `POST /x/search` sibling only when filters exceed ~8 or include arrays/nested objects. Symmetry alone is not justification.
- **Four legitimacy rules for `/search` siblings:** No side effects; sub-resource (never an overload); mount before any `/:id` wildcard; server-cacheable only (`no-store` on wire, `keyAs` required for `setCache`).
- **Cache identity via `keyAs`:** Both spellings share one cache entry. Key built from a declared `keyParameters` allowlist, values normalised, body read before query. Pinned by `tests/unit/infrastructure/http/middlewares/cache.test.ts`.
- **Eight-step checklist** for adding a new `/search` sibling, from OpenAPI through `npm run contracts:bundle`.
- **Current-state table** listing which resources have both spellings (products, users, orders, feedback, cart) and which are query-only.

## Relationships
No graph neighbors are listed in the dependency graph. The document references (but does not depend on) `docs/theory/request-input.md`, `src/infrastructure/http/request.ts`, `src/modules/products/routes.ts`, and the frontend `response-schema-map.spec.ts` as supporting material.

## Notes
- The filter-count table in "Current state" is explicitly stale-prone; re-derive counts from each module's `openapi.yaml` rather than trusting the table.
- Step 2 of the checklist (`shared/contracts/openapi.root.yaml` `$ref`) is a silent-failure trap: the bundler drops the route with no error if it is missed.
- Steps 6–7 (frontend registry rows) can leave the backend gate green while the frontend is red; `check:spec-identity` only verifies the two `openapi.yaml` copies are byte-identical, not that the frontend consumed the change.
- `DELETE /cart/all` (added 2026-08-31) is explicitly **not** another polymorphic spelling—it is a separate URL introduced because a bodyless `DELETE /cart` was ambiguous between "remove one line" and "clear all," and the failure direction (silent full-clear) was unacceptable.
- This file is a living document with dated entries; "Updated" lines at the top mark when dispositions were decided or content was merged.
