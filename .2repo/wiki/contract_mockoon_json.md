# contract.mockoon.json

## Purpose

Mockoon mock-server configuration for the **Ecommerce Demo API** (port `3001`). It defines a set of pre-canned HTTP routes and inline JSON responses so that clients and tests can exercise the API contract without a live backend.

## Key elements

- **`name` / `port` / `endpointPrefix`** – Server identity; listens on `3001` with no base-path prefix.
- **`routes[]`** – Each entry is one HTTP endpoint (method + path) with one or more canned `responses[]`.
  - `GET ""` – Health-check; single `200` default response.
  - `GET "locales"` – Lists supported locales; default `200` plus a non-default `500`.
  - `POST "locales"` – Creates a locale; default `201` plus non-default `401`, `403`, `409`, `422`, `500` error responses.
  - `GET "locales/:locale"` – Returns the dictionary for one locale; `200` default plus a `404`.
  - *(additional routes truncated in source)*
- **`responses[].default`** – Boolean flag; the response with `default: true` is returned when no rule matches. Non-default responses are available for manual selection in the Mockoon UI.
- **`responses[].bodyType: "INLINE"`** – All bodies are embedded as escaped JSON strings in this file; no external file references.
- **`responses[].rules` / `rulesOperator`** – Present but empty in every route; no conditional (request-based) response switching is configured.
- **`uuid` (file, route, response level)** – Stable identifiers used by the Mockoon CLI/UI for referencing individual pieces.
- **`lastMigration: 33`** – Mockoon schema version; the file has been migrated up to v33.

## Relationships

- **`openapi.yaml`** – The OpenAPI contract this mock implements. The route paths (`/`, `/locales`, `/locales/:locale`) and response shapes here mirror the operations defined in the spec. Keeping both in sync is a manual responsibility: changes to `openapi.yaml` do not auto-generate updates to this file.

## Notes

- **Boilerplate error bodies.** Every non-default error response (401, 403, 409, 422, 500, 404) carries the *same* `VALIDATION_ERROR: "Field \"email\" is required"` payload. This is placeholder text, not endpoint-specific validation—don't treat the error messages as meaningful.
- **Inconsistent locale data.** The `locales` responses use tag `"it"` (Italian) paired with name `"Spanish"` / nativeName `"Español"`. Treat as sample data, not a real locale mapping.
- **No templating or rules.** All responses are static; `disableTemplating` is `false` but no `{{...}}` expressions or request-matching rules are present. Dynamic behavior would require editing `rules[]` on individual responses.
- **File is a Mockoon artifact, not source-of-truth for the contract.** The authoritative API definition lives in `openapi.yaml`; this file exists to *serve* a running mock of that contract during development and testing.
