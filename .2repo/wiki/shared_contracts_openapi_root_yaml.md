# shared/contracts/openapi.root.yaml

## Purpose

Root OpenAPI 3.0.3 specification for the Ecommerce Demo API (v2.0.0). It defines the shared building blocks — security schemes, reusable parameters, standard responses, and cross-module schemas — that every per-module spec inherits via `$ref`. Designed explicitly for code-generation (Orval/Zod, client/server stubs, DTOs) across multiple projects and languages.

## Key elements

- **`info.description`** — Doubles as the contract for `Accept-Language` handling. Documents that the header applies to all 33 operations, selects only user-facing copy (never shape/status/machine codes), falls back silently on unsupported tags, and sets `Content-Language` + `Vary: Accept-Language`.
- **`components.securitySchemes.bearerAuth`** — JWT bearer scheme available to any operation (global `security` is commented out by default).
- **`components.parameters`** — Reusable params: `PageParam`, `PageSizeParam`, `TextParam`, `IdParam`, `UserIdParam`, `ProductIdParam`, `HardDeleteParam`, `IdPathParam`, `ProductIdPathParam`. The hard-delete param documents the three-spelling convention (path `/hard`, query `?hardDelete=true`, body `hardDelete`) and precedence order.
- **`components.responses`** — Standard error/success envelopes: `Success`, `Unauthorized`, `Forbidden`, `NotFound`, `Conflict`, `ValidationError`, `InternalError`.
- **`components.schemas`** — Shared scalars (`Page`, `PageSize`, `Id`, `Text`, `Email`, `Password`, `Locale`, `ImageUrl`), `PaginationMeta`, envelope primitives (`EnvelopeSuccess`, `EnvelopeStatus`, `EnvelopeMessage`), `MessageResponse`, and `ErrorItem` (with stable `code` + localizable `message` + optional `details`).
- **Multipart `imageUpload` fields** — Deliberately left as bare `type: string, format: binary` with no `maxLength`/`contentMediaType`; see Notes.

## Relationships

- **`src/modules/*/openapi.yaml`** (account, cart, delivery, feedback, inventory, locales, observability, orders, payments, products, users) — Each module spec is a standalone OpenAPI document that `$ref`s the shared parameters, responses, and schemas defined here (e.g. `#/components/schemas/Id`, `#/components/responses/ValidationError`).
- **`openapi.yaml`** — Project-level OpenAPI entry point that aggregates or points to the module specs.
- **`shared/contracts/asyncapi.root.yaml`** — Sibling contract for event-driven (async) interfaces; this file covers only synchronous REST.
- **`spectral.modules.yaml`** — Spectral linting rules applied to this spec and the module specs to enforce structural conventions.
- **`src/infrastructure/adapters/storage.ts`** — Backend authority for image-upload limits (allowed MIME types, `NODE_MAX_UPLOAD_BYTES` size cap). The spec intentionally does not duplicate those constraints; this file is the enforcement point.

## Notes

- **`Accept-Language` is never declared per-operation.** The `info.description` paragraph is its contractual definition. Declaring it 33 times would add a redundant argument to every generated function; clients set it once via an interceptor.
- **Upload limits are backend-only.** Orval's Zod generator short-circuits `format: binary` to `zod.instanceof(File)` and the `zodSchemas` target has no `splitByContentType`, so any `maxLength` added here would reach no generated artefact. The real limits live in `storage.ts` and are restated in the frontend's `src/infrastructure/uploads.ts`. Changing them requires touching both files — nothing in the spec will announce the drift.
- **YAML anchors for envelope preamble.** `EnvelopeSuccess`, `EnvelopeStatus`, and `EnvelopeMessage` were originally YAML anchors (`&envelopeSuccess` etc.) during a concatenation-based assembly. They are now plain schemas because anchors cannot cross file boundaries, and each module is a standalone document.
- **`ImageUrl` uses `format: uri-reference`, not `uri`.** Uploaded images are stored and returned as server-relative paths (e.g. `/uploads/abc.jpg`), which are not valid absolute URIs.
- **Global `security` is commented out.** Authentication is opt-in per operation; the `bearerAuth` scheme is available but not enforced by default.
