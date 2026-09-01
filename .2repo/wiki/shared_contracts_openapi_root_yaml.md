# shared/contracts/openapi.root.yaml

## Purpose

The root OpenAPI 3.0.3 contract for the Ecommerce Demo API. It is a codegen-oriented, multi-language spec that defines the shared vocabulary — security schemes, reusable parameters, standard responses, and cross-module schemas (pagination, IDs, envelope shapes) — that every per-module `openapi.yaml` composes against. It exists so that generated client/server stubs, DTOs, and SDKs have a single, stable source of truth for anything more than one module references.

## Key elements

- **`info.description`** — Carries the i18n contract: every endpoint honours `Accept-Language` for user-facing copy only (`errors[].message`, success `message`); it never changes shape, status code, or machine-readable fields. The header is deliberately *not* declared per-operation to avoid a redundant argument in every generated function.
- **`components.securitySchemes.bearerAuth`** — JWT bearer auth; the global `security` block is commented out, so auth is opt-in per operation.
- **`components.parameters`** — Reusable query/path params: `PageParam`, `PageSizeParam`, `TextParam`, `IdParam`, `UserIdParam`, `ProductIdParam`, `HardDeleteParam`, `IdPathParam`, `ProductIdPathParam`. `HardDeleteParam` documents the three-spelling rule (`/hard` path, `?hardDelete` query, body flag) with a fixed precedence.
- **`components.responses`** — Standard error/success envelopes: `Success`, `Unauthorized`, `Forbidden`, `NotFound`, `Conflict`, `ValidationError`, `InternalError`.
- **`components.schemas` (shared)** — `Page`, `PageSize`, `Id`, `Text`, `Email`, `Password`, `Locale`, `ImageUrl`, `ThumbnailUrl`, `PaginationMeta`, `EnvelopeSuccess`, `EnvelopeStatus`, `EnvelopeMessage`, `MessageResponse`, `ErrorItem`.
- **Multipart `imageUpload` fields** — Declared as bare `format: binary` with no `maxLength`/`contentMediaType`; limits live exclusively in the backend (see Notes).

## Relationships

- **`src/modules/*/openapi.yaml`** (account, cart, delivery, feedback, inventory, locales, observability, orders, payments, products, users, wishlist) — Each module spec is a standalone document that `$ref`s the shared parameters, responses, and schemas defined here. They do not import via a `servers` or `components` merge; they re-declare or reference the root definitions.
- **`shared/contracts/asyncapi.root.yaml`** — Sibling contract covering the async/event side of the system; shares the same codegen pipeline and team ownership but models message flows rather than HTTP operations.
- **`src/infrastructure/adapters/storage.ts`** — Referenced in inline comments as the single authority for image-upload limits (accepted MIME types, `NODE_MAX_UPLOAD_BYTES`). The spec intentionally omits those limits; storage.ts is where they are enforced.

## Notes

- **`Accept-Language` is absent from `components.parameters`.** This is a deliberate design choice documented in `info.description` and a comment in `parameters`. Adding it as a parameter would inject a redundant argument into every generated function.
- **Image-upload constraints are not in the spec.** A `maxLength` or `contentMediaType` on `format: binary` would not reach any generated artefact (orval's zod generator short-circuits to `zod.instanceof(File)`, and the multipart body is excluded from the `zodSchemas` target). The real limits live in `src/infrastructure/adapters/storage.ts` and are restated in the frontend's `src/infrastructure/uploads.ts`. If limits change, those two files must change in lockstep — nothing in the spec will signal the drift.
- **`EnvelopeSuccess` / `EnvelopeStatus` / `EnvelopeMessage`** are standalone schemas (not YAML anchors) so that module files in separate documents can `$ref` them. They exist because the document is no longer assembled by concatenation; anchors cannot cross files.
- **`OrderIdParam`** is commented out in `parameters` but may still be referenced by the orders module spec.
- **`security` is commented out at the top level.** Operations must explicitly opt in; do not assume global auth.
