---
source: scripts/contracts/generate-request-content-types.ts
generated_at: 2026-11-22T01:57:08.946028+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/generate-request-content-types.ts

## Purpose
A generator script that reads the bundled `openapi.yaml` and writes two TypeScript files under `api.generated/`. The first is a request media-type table. The second is a per-path route table (written as `operation-routes.ts`, beside the first). The backend uses these tables so the 415 content-type guard and the 405 method-not-allowed handler need no hand-written route knowledge and compile no regexes at boot. The frontend does not use them.

## Key elements
- `INPUT` / `OUTPUT` / `document`: input is `<REPO_ROOT>/openapi.yaml`, parsed with `parseOpenApi`. `OUTPUT` comes from the required `--out` argument.
- `compileTemplate(template)`: turns a contract path such as `/products/{id}/restore` into the source text of a case-insensitive regex literal. Each `{param}` becomes `[^/]+`, and the text between params is regex-escaped. It also returns `parameterCount`. Params may sit inside a segment, as in `products-{page}.xml`.
- `renderRows()`: builds one row per write operation (`WRITE_METHODS`) with `method`, `pattern`, `parameterCount` and `types`.
  - `types` holds the request body's content types. A write with no `requestBody` gets `types: []`, so any body is refused.
  - Rows are sorted by fewest parameters first, then by key.
- `renderRouteRows()`: builds one row per path with `pattern`, `parameterCount`, `module`, `methods` and `securityOpenMethods`.
  - `module` is the first `x-module` found across the path's operations, or `null`.
  - `securityOpenMethods` comes from `securityOpenMethods(operations)`.
  - Rows use the same ordering as above.
- `output` / `routesOutput`: the full file text, with a "DO NOT EDIT" header. They export `RequestContentType` and `REQUEST_CONTENT_TYPES`, and `OperationRoute` and `OPERATION_ROUTES`.
- The last two lines call `writeOrCheck` for both files. The routes file is placed in the same folder as `--out`.

## Relationships
- `scripts/contracts/openapi-document.ts`: supplies `parseOpenApi`, `HTTP_METHODS`, `WRITE_METHODS` and `securityOpenMethods`.
- `scripts/contracts/generated-file.ts`: supplies `writeOrCheck`, which writes the files or, under `--check`, compares them with disk and exits 1 on a mismatch.
- `scripts/cli.ts`: supplies `requiredPath`, which parses `--out`.
- `scripts/modules-on-disk.ts`: supplies `REPO_ROOT`, used to resolve the contract input and `--out`.
- `tests/cross-cutting/contract-error-declarations.test.ts`: listed as a graph neighbor. The file's content shows no direct interaction with it.

## Notes
- The script runs at import time (top-level execution) and has no exports. Run it as `tsx scripts/contracts/generate-request-content-types.ts --out <path> [--check]`.
- Output is invoked via `npm run gen:api`, which rebuilds `api.generated/` from scratch.
- Regexes are case-insensitive because Express routing is, so `/Account` must reach the same gate as `/account`.
- Specific paths sort before parameterized ones, so static segments such as `/products/search` match before `/products/{id}`.
- A write method with no declared body is listed with empty `types`. This stops a gateway that strips bodies from changing a request, and stops a body sent to a button endpoint from being silently dropped with a 200.
