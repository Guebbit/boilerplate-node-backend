# docs/theory/request-input.md

## Purpose

Single written statement of which input sources (route params, query string, body) each endpoint reads, in what precedence order, and how values are treated on the way in. It exists so that controllers name a **surface** rather than re-deriving the polymorphism rules per call site, and so the closed set of source combinations stays reviewable against the spec.

## Key elements

- **`SURFACE_SOURCES`** (in `@infrastructure/http/request`) — closed map from a surface name (`search`, `list`, `write`, `delete`, `path`) to an ordered array of sources. Controllers pass the surface name; they never pass the array directly.
- **`readInput(request, { surface })`** — entry point controllers call. Resolves the source list from the surface, merges values in precedence order (highest source wins), hands the result to the Zod schema, and returns either the validated value or a 422 with issue messages.
- **Five surfaces** — `search` (body > query), `list` (query only), `write` (params > body), `delete` (params > query > body), `path` (params only).
- **`hardDelete` exception** — on the three hard-delete routes this parameter is **OR'd** across params, query, and body (any `true` wins) rather than ranked. Any non-boolean value produces a 422.
- **Shared pagination schema** — `page`/`pageSize` are merged from sources then validated by one shared Zod schema across all list/search endpoints.
- **Multipart-only decoding** — boolean and string-array body fields (`active`, `categories`, `tags`, `admin`) are decoded only when the content type is `multipart/form-data`; otherwise passed through untouched.

## Relationships

- **`src/infrastructure/http/request.ts`** — implements `SURFACE_SOURCES` and `readInput`; this page documents its behavior and the closed surface set.
- **`src/infrastructure/http/schemas.ts`** — provides the Zod schemas (pagination, ObjectId, field-level) that `readInput` invokes after merging.
- **`src/infrastructure/persistence/search.ts`** — downstream consumer of the validated input for the `search`/`list` surfaces; builds query filters from the merged result.
- **`middlewares/route-flag.ts`** — sets route-level context (e.g., admin flag) that affects how certain merged values are treated (e.g., `userId` on orders ignored for non-admin callers).
- **`tests/contract/request-sources.test.ts`** — pins the `SURFACE_SOURCES` set; adding or removing a surface/source fails this test, serving as the prompt to update this page.
- **`tests/contract/request-contract.test.ts`** — exercises the end-to-end read-merge-validate contract for each surface.
- **`docs/theory/request-flow.md`** — broader request lifecycle; this page covers the input-resolution step within that flow.
- **`docs/index.md`** — wiki root; links to this page as the reference for input-source semantics.

## Notes

- **GET cannot carry a body** (RFC 9110 §9.3.1). Declaring a body source on a GET-only route is a no-op claim; the correct fix is to add a `POST /x/search` sibling.
- **Cache-key blind spot**: `setCache` keys on declared **query** parameters only. A filter that arrives via body is invisible to the cache key, so a body-borne filter on a cached GET silently defeats caching.
- **Closed surface set**: there is no mechanism for a controller to pass an ad-hoc source array. A sixth combination must be added to `SURFACE_SOURCES` deliberately, which is where review against the spec happens.
- **`hardDelete` is the only OR'd parameter** in the entire input model; every other parameter follows strict source ranking.
