---
source: tests/contract/route-spec-parity.test.ts
sha256: 540bc4e2029fcab1d834070f791223e7ad2da746dfa465c56317d086d79e88c2
generated_at: 2026-10-15T12:33:51.671503+00:00
model: ollama:qwen3.8:27b
---

# tests/contract/route-spec-parity.test.ts

## Purpose

Contract test that asserts a bidirectional parity between the routes the application actually mounts (read from live Express routers) and the operations declared in the bundled `openapi.yaml`. It catches undocumented endpoints, unfulfilled spec promises, and duplicate registrations.

## Key elements

- **`HTTP_METHODS`** – `Set` of the six valid OpenAPI operation keys used to filter spec path-item entries.
- **`toSpecPath(expressPath)`** – Rewrites Express parameter syntax (`:id`) to OpenAPI syntax (`{id}`) so both sides share one spelling.
- **`operationsOf(prefix, router)`** – Calls the `routeTable` helper on a single router, prefixes each path with the mount point, and returns an array of `METHOD /spec/{path}` strings.
- **`mountedOperations()`** – Collects operations from every entry in `enabledModules` (using each module's `basePath` + `routes`) and appends the system router's operations at root.
- **`declaredOperations()`** – Reads and YAML-parses `../../openapi.yaml`, flattens `paths` × method keys (filtered to `HTTP_METHODS`) into `METHOD /path` strings.
- **`isTestLever(operation)`** – Returns `true` for any operation whose path contains ` /__/`, used to exclude the demo extension's levers from both sides.
- **`describe('mounted routes and the published contract')`** – Four tests:
  1. *Non-empty guard* – both sides must have > 100 entries (prevents a broken walker from vacuously passing).
  2. *Spec covers mounted* – every mounted operation must appear in the spec.
  3. *Mounted covers spec* – every declared operation must be served by the app.
  4. *No duplicates* – no `METHOD path` pair is registered more than once in the mounted set.

## Relationships

- **`src/modules.ts`** – imports `enabledModules`, the module registry that exposes each enabled module's `basePath` and `routes` router. This is the authoritative list of what the app mounts.
- **`src/app/system-routes.ts`** – imports the system router (mounted at `/`), which is appended to the mounted-operations list after all module routers.
- **`tests/support/routes.ts`** – imports `routeTable`, the shared helper that walks an Express router's internal stack and returns a flat array of `{ method, path }` entries.

## Notes

- Uses the `enabledModules` registry rather than the booted Express `app` because Express 5's router stack does not retain mount-path information; the registry does.
- Deliberately out of scope: `/__test/*` routes (demo extension levers) and `express.static` (no route table, no spec operation).
- The spec side uppercases method keys explicitly; the mounted side relies on whatever case `routeTable` returns—both must agree for the comparisons to hold.
- The non-empty guard threshold (100) is a sanity floor, not a contractual count; it exists solely to fail loudly if the route walker or spec parser is broken.
