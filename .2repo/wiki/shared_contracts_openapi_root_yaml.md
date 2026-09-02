# shared/contracts/openapi.root.yaml

## Purpose

Root OpenAPI 3.0.3 specification for the Ecommerce Demo API. It exists as the shared, codegen-oriented contract from which client/server stubs, DTOs, and SDKs are generated across projects and languages. It centralises the components (parameters, responses, schemas, security) that every module spec reuses, and documents cross-cutting conventions (localisation, soft/hard delete, image upload limits) in one authoritative place.

## Key elements

- **`info.description`** – Documents the `Accept-Language` contract: every endpoint honours it for user-facing copy only (messages, error text), never for shape/status codes. The header is intentionally *not* declared per-operation; clients set it once in an interceptor.
- **`servers`** – Local (`http://localhost:3000`) and Production (`https://api.example.com`).
- **`tags`** – Twelve domain tags (Auth, Account, Users, Products, Cart, Wishlist, Orders, Payments, Delivery, Inventory, Feedback) plus System and Observability.
- **`components.securitySchemes.bearerAuth`** – HTTP bearer / JWT scheme; the top-level `security` block is commented out, so auth is opt-in per operation.
- **`components.parameters`** – Reusable parameter definitions: `PageParam`, `PageSizeParam`, `TextParam`, `IdParam`, `UserIdParam`, `ProductIdParam`, `HardDeleteParam`, `IdPathParam`, `ProductIdPathParam`. `HardDeleteParam` documents the three spelling conventions (`/hard` path, `?hardDelete` query, `hardDelete` body) and their precedence.
- **`components.responses`** – Standard envelope responses: `Success`, `Unauthorized`, `Forbidden`, `NotFound`, `Conflict`, `ValidationError`, `InternalError`.
- **`components.schemas`** – Shared scalar/envelope types (`Page`, `PageSize`, `Id`, `Text`, `Email`, `Password`, `PasswordNew`, `Locale`, `ImageUrl`, `ThumbnailUrl`, `PaginationMeta`, `MessageResponse`, `ErrorResponse`, `ValidationErrorResponse`, and multipart upload bodies). `Password` vs `PasswordNew` distinguishes "proving" an existing credential from "setting" a new one with stricter complexity rules.
- **Image upload note** – `imageUpload` fields in multipart bodies are declared as bare `format: binary` with *no* `maxLength` or `contentMediaType`; the real limits live in `storage.ts` and are restated in the frontend's `uploads.ts`.

## Relationships

- **`src/modules/{account,cart,delivery,feedback,inventory,locales,observability,orders,payments,products,users,wishlist}/openapi.yaml`** – Each module spec extends/references this root's `components` (parameters, responses, schemas) and adds its own operations under the matching tag.
- **`shared/contracts/asyncapi.root.yaml`** – Sibling contract for the asynchronous/event-driven surface; together the two define the full API contract.
- **`src/infrastructure/adapters/storage.ts`** – Referenced (in comments and the frontend's `uploads.ts`) as the runtime authority for accepted MIME types and `NODE_MAX_UPLOAD_BYTES` (default 5 MB). The spec deliberately does not restate those limits.

## Notes

- The top-level `security` block is **commented out**; each operation opts in individually.
- `Accept-Language` is a *contract paragraph*, not a declared parameter—do not add it to `components.parameters` or to individual operations.
- `PasswordNew` has no `pattern` on purpose: the required lookahead regex is incompatible with the `fast-check` string generator used in spec-based fuzz tests. Enforcement lives in `zodUserSchema` (server) and `usersPasswordSchema` (frontend).
- `ThumbnailUrl` is `readOnly` and absent for non-upload images; the server is the sole writer.
- If backend upload limits change, update `storage.ts` and `src/infrastructure/uploads.ts`; nothing in this spec (or generated code) will surface the drift automatically.
