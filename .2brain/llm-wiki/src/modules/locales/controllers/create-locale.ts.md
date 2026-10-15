---
source: src/modules/locales/controllers/create-locale.ts
sha256: 52e5b41ef130d42956f4c04ab4d7537e993a109a6cfa7109f7af8ebfcd8a3547
generated_at: 2026-10-15T10:41:45.201989+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/controllers/create-locale.ts

## Purpose

Handles the `POST /locales` admin endpoint: registers a new language entry in the dynamic tier. It validates the request body against a Zod schema, delegates to the locale service, and returns a `201 Created` with a `Location` header. It is the "create" half of the locale CRUD trio (edit lives in `./update-locale.ts`, removal in `./delete-locale.ts`).

## Key elements

- **`createLocale`** — exported async handler function. Parses the body via `parseBody` (schema: `CreateLocaleBody` extended with `localeDisplayName` for both `name` and `nativeName`), calls `localeService.createLanguage`, shapes the result through `presentLocale`, and responds with `createdResponse` (201, body, `Location: /locales/<tag>`). Errors are funneled through `refused` (business-level) and `catchAs` (unexpected).

## Relationships

- **`@infrastructure/http/controller`** — supplies the `parseBody`, `refused`, and `catchAs` helpers that structure the request/response flow and error handling.
- **`@infrastructure/http/request`** — `callerContextOf(request)` extracts the authenticated caller's identity and passes it into the service call.
- **`@infrastructure/http/response`** — `createdResponse` emits the 201 status, JSON body, and `Location` header.
- **`@types`** — `CreateLocaleRequest` types the parsed body; `Language` types the response payload.
- **`../services` (`localeService`)** — the domain layer that persists the new language and returns a result (data or refusal).
- **`../presenters` (`presentLocale`)** — maps the service's domain result into the API response shape.
- **`../routes`** — registers `createLocale` as the handler for the `POST /locales` route.

## Notes

- Registering a locale here does **not** immediately make the API answer in that language. `listSupportedLocales()` is read once per worker at boot and i18next registers its resources from that snapshot; a newly created locale only becomes resolvable on the next worker restart. The file header comment calls this out explicitly to prevent the misconception that `POST /locales` is a live toggle.
- The Zod schema is extended inline with `localeDisplayName` pulled from the service, so the *validation* of display-name format is owned by the service, not hardcoded in the schema.
- The handler uses a promise chain (`.then/.catch`) rather than `async/await`, consistent with the project's controller style.
