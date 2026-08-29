# contract.insomnia.json

## Purpose

An Insomnia REST-client collection (format 5.0, schema 5.1) that packages ready-to-send HTTP requests for the Ecommerce Demo API. It exists so developers can explore, test, and demo the API interactively without re-typing endpoints, headers, or auth tokens, and so the request/response expectations are captured in a form that mirrors the OpenAPI spec.

## Key elements

- **`collection` array** – ordered list of folders, each with a `name`, a stable `meta.id` (`fld_*`), and a `sortKey` for UI ordering.
- **`System` folder** – single request: `GET /` ("API health check"). Unauthenticated; confirms the process is alive.
- **`Locales` folder** – the bulk of the collection; covers the full locale CRUD surface:
  - `GET /locales` – list supported languages (public, cacheable).
  - `POST /locales` – register a new language (admin; bearer token).
  - `PUT /locales/{locale}` – edit display name / direction / visibility (admin).
  - `DELETE /locales/{locale}` – remove a language and its entries (admin; 409 if still active).
  - `GET /locales/{locale}` – fetch the **API-tier** (deployed) message dictionary.
  - `GET /locales/{locale}/messages` – fetch the **dynamic-tier** (database) message dictionary (public).
  - `GET /locales/{locale}/entries` – paginated, searchable list of stored translation rows (admin).
  - `POST /locales/{locale}/entries` – add a single translation entry (admin; 409 on key collision).
  - `PUT /locales/{locale}/entries` – bulk **replace** all entries (admin).
  - (truncated) `PATCH` on the same path for **merge** semantics.
- **Per-request fields** – `url` (templated with `{{ _.baseURL }}`), `method`, `headers`, `authentication` (bearer, disabled or `{{ _.token }}`), `body` (JSON examples), `settings`, and a `meta.description` that documents intended behavior and edge cases.
- **`meta` block** – collection-level id, creation/modification timestamps, and a top-level `name`.

## Relationships

- **`openapi.yaml`** – The collection is the interactive counterpart to the OpenAPI specification. Every request in this file maps to a path + method defined in the spec; together they define the same contract. The spec is the machine-readable source of truth for schemas and status codes; this collection is the human-driven execution surface (with concrete example bodies and auth wiring). Keeping them in sync is the maintainer's responsibility—neither auto-generates the other here.

## Notes

- All URLs and the bearer token are Insomnia environment variables (`{{ _.baseURL }}`, `{{ _.token }}`); the file contains no absolute hosts or real secrets.
- Auth is **disabled** (`disabled: true`) on public read routes and **active** on admin routes. A new environment must supply `token` before the admin requests will work.
- The two-tier locale model (deployed files vs. database entries) is documented extensively in the request descriptions; the `PUT` vs. `PATCH` distinction on `/entries` is the critical gotcha for bulk translation imports.
- `sortKey` values use gaps of 1000 between folders and small increments within a folder to allow future insertion without renumbering.
- The file is truncated in this view; additional folders/requests may exist beyond what is shown.
