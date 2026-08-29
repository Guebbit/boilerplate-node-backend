# contract.postman.json

## Purpose
A Postman Collection (v2.1.0) that provides ready-to-run request examples and captured responses for the Ecommerce Demo API. It serves as a live testing and onboarding artifact: developers import it into Postman to exercise endpoints without hand-typing URLs, headers, or auth.

## Key elements
- **Collection info** — identifies the collection as "Ecommerce Demo API" with its Postman `_postman_id` and schema version.
- **System folder → API health check** — `GET {{baseUrl}}/` with `Accept: application/json`. Returns a liveness indicator (`{"status":"ok"}`). No auth required.
- **Locales folder → Supported languages** — `GET {{baseUrl}}/locales`. Public, unauthenticated. Returns the full locale manifest (tag, name, direction, `tenants`, `active`, `source`, `entryCount`, `revision`) plus `default` and `fallback` pointers. An ADMIN bearer token is not required here but, per the description, one would see inactive rows as well.
- **Locales folder → Add a language** — `POST {{baseUrl}}/locales` with bearer auth (`{{token}}`). Registers a locale in the dynamic/frontend tier only; does not deploy a backend dictionary. Returns `201` with the created record, `401`/`403` on auth failure.
- **Variables** — `{{baseUrl}}` (target host) and `{{token}}` (JWT bearer) are expected collection/environment variables.
- **Captured responses** — each request carries one or more example responses (status, headers, JSON body) for quick reference without hitting a live server.

## Relationships
- **`openapi.yaml`** — The OpenAPI specification is the source-of-truth contract for the same endpoints catalogued here. `contract.postman.json` mirrors those paths, methods, and response shapes in an executable form. Changes to `openapi.yaml` (new paths, altered schemas, auth requirements) should be reflected in this collection.

## Notes
- The example bodies are illustrative, not canonical: the 200 response for `GET /locales` shows tag `"it"` paired with the name "Spanish" / "Español", and the 201 response references `baseLanguage: "pt"`. Treat these as placeholder data, not a real locale mapping.
- Error response bodies (401, 403, 500) reuse a generic `VALIDATION_ERROR` about a missing `"email"` field regardless of the actual failure mode; they exist to demonstrate the error envelope shape, not the real message.
- The file is truncated in this repo snapshot (the 403 response body for "Add a language" is cut off), so the full set of example responses may extend beyond what is visible.
- Postman collection IDs (`_postman_id`, per-request `id`) are stable identifiers for import/export; avoid manual edits to them.
