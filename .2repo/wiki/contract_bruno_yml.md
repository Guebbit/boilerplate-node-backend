# contract.bruno.yml

## Purpose

Bruno API collection (OpenCollection 1.0.0) defining the "Ecommerce Demo API" as a set of hand-runnable HTTP requests with inline response examples. It serves as the executable, human-readable counterpart to the machine-readable OpenAPI spec, letting developers and AI agents send requests directly from the Bruno CLI or desktop app.

## Key elements

- **`info.name`** — Collection label: *Ecommerce Demo API*.
- **`config.environments`** — Two predefined environments: **Local** (`http://localhost:3000`) and **Production** (`https://api.example.com`), each exposing a `baseUrl` variable used in every request URL.
- **`items[]` (top-level folders)** — Organized request groups, each a `type: folder` node:
  - **System** — `GET /` (API health check); returns a JSON envelope with `success`, `status`, `message`, `data.status: "ok"`.
  - **Locales** — Three endpoints:
    - `GET /locales` — list supported language tags, direction, scopes, revision info.
    - `POST /locales` — create a language entry; requires **Bearer token** auth (`{{token}}`). Body: `tag`, `name`, `nativeName`, `direction`, `active`.
    - `GET /…` (truncated) — "API message dictionary".
- **`examples[]`** — Each request carries one or more named response examples (200, 201, 401, 403, 409, 422, 500) documenting the full JSON response body, headers, and status line.
- **`settings`** (per request) — `encodeUrl`, `timeout: 0`, `followRedirects: true`, `maxRedirects: 5`.

## Relationships

- **`openapi.yaml`** — The OpenAPI 3 specification for the same API. This Bruno collection mirrors its paths, methods, and response schemas; the two files should stay in sync when the API contract changes. The Bruno file adds runnable examples and environment variables that the spec expresses as abstract parameter/operation objects.

## Notes

- All URLs use the `{{baseUrl}}` environment variable—switching between Local and Production is done by changing the active environment in Bruno, not by editing the file.
- Auth for mutating endpoints is declared per-request as `bearer` with a `{{token}}` variable that must be supplied at runtime (not set in the file).
- The error response examples (401, 403, 409, 422, 500) all reuse the same boilerplate `VALIDATION_ERROR` / "Field email is required" body. Treat these as **structural templates** showing the error envelope shape, not as the actual error messages the server will return for each status code.
- The file is truncated in this repo snapshot; the `Locales` folder likely contains additional endpoints beyond what is visible here.
