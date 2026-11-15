---
source: src/modules/users/openapi.yaml
sha256: 2fe820e649d7b16e50a03b64084d89f43dab2257b90919f88958e3fa4b92f00b
generated_at: 2026-11-14T22:24:04.585776+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/openapi.yaml

## Purpose

The OpenAPI 3.1.0 contract for the **users** module: it declares the REST endpoints, request/response schemas, error codes, and tag metadata that the users service exposes. The file is a *module fragment* intended to be merged into a single API document by a bundler, so it intentionally omits global servers, security schemes, and shared components (those live in the root contract).

## Key elements

- **`x-error-codes` (top-level)** — Module-wide catalogue of domain-specific `409` errors (e.g. `USER_ALREADY_ACTIVE`, `USER_ROLE_NOT_ASSIGNED`, `USER_PURCHASE_HOLD_ALREADY_SET`). These are referenced by individual operations via a per-operation `x-error-codes` block.
- **`tags`** — Single `Users` tag (`x-family: Core`) under which every operation in this file is grouped.
- **`x-personal-data`** — Declares the `signInMethods` section that the bundler splices into the global `AccountExportResponse` schema. Removing this key removes the section from the export.
- **`paths./users`** — `GET` (paginated list with rich query filters: sort, text, email, username, active, deleted, purchaseHold, purchaseHoldReview) and `POST` (create; no password in body — the owner is emailed a self-service link).
- **`paths./users/{id}`** — `GET` and `PUT` (RFC 9110 §9.3.4 full-replace) operations, both accepting `application/json` and `multipart/form-data` where applicable.
- **`x-versioned`** — Marks which methods the bundler should decorate with `ETag` / `If-Match` / `Content-Location` / `412` semantics (listed as `get, put, patch, delete` on `/users/{id}` and `post` on `/users`).
- **Security** — Every operation accepts either `bearerAuth` or `apiKeyAuth` with fine-grained scopes (`read:User`, `create:User`, `update:User`).

## Relationships

- **`shared/contracts/openapi.root.yaml`** — Primary dependency. This file `$ref`s shared parameters (`PageParam`, `PageSizeParam`, `IdPathParam`, `TextParam`, `IdParam`), common responses (`Unauthorized`, `Forbidden`, `NotFound`, `ValidationError`, `Conflict`, `TooManyRequests`), shared schemas (`User`, `Email`), and the `Location` header. The users contract is meaningless without it.
- **`src/modules/users/authorization.yaml`** — Defines the scope/role rules (`ROLE_MANAGEMENT_REQUIRED`, `REAUTH_REQUIRED`) that the `x-error-codes` entries in this file reference; the `403` error codes map to policies declared there.
- **`src/modules/users/asyncapi.webhooks.yaml`** — Companion spec for the asynchronous webhooks the same module emits alongside the synchronous REST endpoints described here. The two files are independent documents kept in lock-step.
- **`src/modules/users/module.ts`** — The TypeScript entry-point that wires this OpenAPI fragment, the authorization rules, and the webhook definitions into the running service; it is the runtime consumer of every schema and operation-id declared here.

## Notes

- The file is a **fragment**, not a standalone OpenAPI document: it has no `servers`, no `securitySchemes`, and relies on `#`-relative refs for its own schemas while reaching three directories up (`../../../shared/contracts/openapi.root.yaml`) for everything shared.
- `purchaseHold` and `purchaseHoldReview` query parameters are intentionally `enum: [true]` only — there is no `false` value because "not held" is the absence of a state, not a filterable one.
- The `deleted` query parameter is described as *admin-effective*: a caller without permission to see soft-deleted rows receives an empty page rather than a `403`.
- The `PUT` description explicitly carves out `email`, `password`, and `image` from the representation; they are managed through `/account` or a dedicated upload. A `PUT` that omits `imageUrl` **keeps** the existing image (it is not cleared), unlike other optional fields which are.
- `uploadLimiter` middleware (referenced in `429` comments) is defined in `routes.ts`, not in this spec — the `429` responses here are documentation-only.
