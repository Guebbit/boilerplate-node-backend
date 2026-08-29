# src/modules/locales/controllers/write-locales.ts

## Purpose

Admin-only HTTP controllers for creating (POST /locales) and updating (PUT /locales/:locale) language records. They validate the request body with Zod, delegate the write to `localeService`, and shape the HTTP response. They do **not** register a language for use by the API at runtime — i18next reads supported locales once per worker at boot, so a row written here only becomes resolvable after a file is deployed.

## Key elements

- **`displayName`** (const) — Zod schema: `z.string().trim().min(1)`. Trims *before* the length check so a single-space string is rejected by the schema (400, named field) instead of surfacing as a Mongoose `required` violation (422, generic).
- **`createLocale(request, response)`** — Validates body against `CreateLocaleBody` extended with `displayName` for `name` and `nativeName`. Calls `localeService.createLanguage`. Returns **201** on success.
- **`updateLocale(request, response)`** — Validates body against `UpdateLocaleBody` extended with optional `displayName` for `name` and `nativeName`. Calls `localeService.updateLanguage` with the `:locale` param. Returns **200** on success. The locale tag itself is intentionally absent from the body schema (renaming it would rename an entire dictionary).

## Relationships

- **`src/modules/locales/services/index.ts`** — Source of `localeService`; provides `createLanguage` and `updateLanguage` which perform the actual persistence.
- **`src/infrastructure/http/controller.ts`** — Imports `catchAs` (uniform error handler), `refused` (short-circuits on service-level refusal), and `rejectValidation` (sends a 400 with Zod error details).
- **`src/infrastructure/http/response.ts`** — Imports `successResponse` to emit the standard success envelope.
- **`src/infrastructure/http/request.ts`** — Imports `callerContextOf` to extract the admin identity passed into the service layer.
- **`src/modules/locales/routes.ts`** — Wires `createLocale` / `updateLocale` to their respective method+path entries.
- **`src/types/index.ts`** — Source of the `CreateLocaleRequest` and `UpdateLocaleRequest` types used to parameterize Express's `Request<TParams, TRes, TBody>`.

## Notes

- Both controllers use the promise-chain pattern (`.then` / `.catch`) rather than `async/await`, consistent with the rest of the controller layer.
- The `displayName` trim-before-min trick is a deliberate workaround for a JSON Schema limitation (no trim operation); the OpenAPI spec still declares `minLength: 1`, which is weaker than the runtime check. If you add a new free-text field, apply the same pattern rather than relying on the schema's `minLength` alone.
- Validation failures are returned via `Promise.resolve(rejectValidation(...))` (not `throw`), so the outer `.catch(catchAs)` in the service chain never sees a Zod error.
