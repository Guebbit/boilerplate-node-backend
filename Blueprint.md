# Backend Replication Blueprint (Agnostic, MongoDB)

This document captures the backend architecture and behavior of this repository in a language-agnostic way so it can be replicated later in **PHP**, **Java**, and **Python** with MongoDB.

## 1) Architectural Style

- OpenAPI-first monolith backend.
- Clear layered design:
    - **Routes/Endpoints**
    - **Controllers**
    - **Services**
    - **Repositories/DAOs**
    - **MongoDB Models/Schemas**
- Shared utilities:
    - auth/JWT
    - response envelope
    - logging
    - uploads
    - email templates
    - invoice PDF generation
    - environment validation
    - token cleanup
- Domain modules:
    - account/auth
    - users
    - products
    - cart
    - orders
    - system/health

## 2) API Contract Strategy

- `openapi.yaml` is the source of truth.
- API is operation-based and domain-grouped.
- Typed artifacts are generated from OpenAPI.
- Common listing pattern:
    - `GET /resource` for listing
    - `POST /resource/search` for advanced filters

## 3) Security & Auth Model

- Access token:
    - JWT
    - short-lived
    - sent via `Authorization: Bearer ...`
- Refresh token:
    - long-lived
    - stored in DB and in httpOnly cookie (`jwt`)
    - revocable server-side
- Refresh endpoints:
    - from cookie: `GET /account/refresh`
    - from path token: `GET /account/refresh/{token}`
- Role model:
    - authenticated user
    - admin
- Middleware/guard composition:
    - optional auth hydration
    - strict auth required
    - admin required

## 4) Data/Persistence Model (MongoDB)

- Mongoose-style schemas with timestamps.
- **Users**:
    - profile fields
    - `admin` flag
    - cart items
    - token list (`type`, `token`, `expiration`)
    - soft delete via `deletedAt`
- **Products**:
    - catalog fields
    - `active` flag
    - soft delete via `deletedAt`
- **Orders**:
    - user reference (`userId`)
    - user email snapshot
    - embedded product snapshots + quantity
    - status lifecycle
    - optional notes
- Delete strategy:
    - soft delete for users/products
    - hard delete supported by explicit route behavior/flags

## 5) Business Rules Pattern

- Validation belongs in service layer (schema + custom business checks).
- Repositories remain persistence-only (CRUD/query/aggregate).
- Services implement:
    - filtering/search logic
    - pagination
    - ownership scope checks
    - create/update/delete policies
- Cart checkout rule:
    - cart -> order conversion
    - then cart clear

## 6) Cross-Cutting Concerns

- Standard JSON response envelope for success/errors.
- Request correlation ID via `x-request-id`.
- Global error handler with typed operational errors.
- i18n-friendly message keys.
- Upload handling with MIME allowlist + deterministic pathing.
- Email templating for signup/reset/order notifications.
- Optional invoice PDF endpoint.

## 7) Runtime / Ops

- Required env validation at startup.
- DB connect retry/backoff.
- Optional clustering mode.
- Security middleware:
    - rate limiting
    - secure headers
- Development-only routes mounted only outside production.

## 8) Testing Approach

- Unit-focused tests for repositories/services/controllers.
- Isolated MongoDB in tests via memory-server setup helpers.
- Test factories for users/products/orders.
- Scripts exist for:
    - lint
    - type-check/build
    - tests
    - OpenAPI lint

## 9) Replication Priorities

- Preserve behavior parity before internal refactors.
- Keep route auth and ownership semantics exactly.
- Keep one canonical response envelope shape.
- Preserve cart/order coupling and order snapshot behavior.
- Preserve full token lifecycle:
    - issue
    - store
    - refresh
    - revoke
    - cleanup

---

## Endpoint Map with Auth Role

### Account/Auth

- `GET /account` — auth
- `POST /account/login` — public
- `POST /account/signup` — public
- `POST /account/reset` — public
- `POST /account/reset-confirm` — public
- `GET /account/refresh` — public (requires valid refresh token)
- `GET /account/refresh/{token}` — public (requires valid refresh token)
- `POST /account/logout-all` — auth
- `DELETE /account/tokens/expired` — admin

### Users (admin module)

- `GET /users` — admin
- `POST /users/search` — admin
- `POST /users` — admin
- `PUT /users` — admin
- `DELETE /users` — admin
- `GET /users/{id}` — admin
- `PUT /users/{id}` — admin
- `DELETE /users/{id}` — admin

### Products

- `GET /products` — public
- `POST /products/search` — public
- `GET /products/{id}` — public
- `POST /products` — admin
- `PUT /products` — admin
- `DELETE /products` — admin
- `PUT /products/{id}` — admin
- `DELETE /products/{id}` — admin

### Cart

- `GET /cart` — auth
- `POST /cart` — auth
- `DELETE /cart` — auth
- `PUT /cart/{productId}` — auth# Backend Replication Blueprint (Agnostic, MongoDB)
		
		
This document captures the backend architecture and behavior of this repository in a language-agnostic way so it can be replicated later in **PHP**, **Java**, and **Python** with MongoDB.
		
		
## 1) Architectural Style
		
		
- OpenAPI-first monolith backend.
		
- Clear layered design:
		
    - **Routes/Endpoints**
		
    - **Controllers**
		
    - **Services**
		
    - **Repositories/DAOs**
		
    - **MongoDB Models/Schemas**
		
- Shared utilities:
		
    - auth/JWT
		
    - response envelope
		
    - logging
		
    - uploads
		
    - email templates
		
    - invoice PDF generation
		
    - environment validation
		
    - token cleanup
		
- Domain modules:
		
    - account/auth
		
    - users
		
    - products
		
    - cart
		
    - orders
		
    - system/health
		
		
## 2) API Contract Strategy
		
		
- `openapi.yaml` is the source of truth.
		
- API is operation-based and domain-grouped.
		
- Typed artifacts are generated from OpenAPI.
		
- Common listing pattern:
		
    - `GET /resource` for listing
		
    - `POST /resource/search` for advanced filters
		
		
## 3) Security & Auth Model
		
		
- Access token:
		
    - JWT
		
    - short-lived
		
    - sent via `Authorization: Bearer ...`
		
- Refresh token:
		
    - long-lived
		
    - stored in DB and in httpOnly cookie (`jwt`)
		
    - revocable server-side
		
- Refresh endpoints:
		
    - from cookie: `GET /account/refresh`
		
    - from path token: `GET /account/refresh/{token}`
		
- Role model:
		
    - authenticated user
		
    - admin
		
- Middleware/guard composition:
		
    - optional auth hydration
		
    - strict auth required
		
    - admin required
		
		
## 4) Data/Persistence Model (MongoDB)
		
		
- Mongoose-style schemas with timestamps.
		
- **Users**:
		
    - profile fields
		
    - `admin` flag
		
    - cart items
		
    - token list (`type`, `token`, `expiration`)
		
    - soft delete via `deletedAt`
		
- **Products**:
		
    - catalog fields
		
    - `active` flag
		
    - soft delete via `deletedAt`
		
- **Orders**:
		
    - user reference (`userId`)
		
    - user email snapshot
		
    - embedded product snapshots + quantity
		
    - status lifecycle
		
    - optional notes
		
- Delete strategy:
		
    - soft delete for users/products
		
    - hard delete supported by explicit route behavior/flags
		
		
## 5) Business Rules Pattern
		
		
- Validation belongs in service layer (schema + custom business checks).
		
- Repositories remain persistence-only (CRUD/query/aggregate).
		
- Services implement:
		
    - filtering/search logic
		
    - pagination
		
    - ownership scope checks
		
    - create/update/delete policies
		
- Cart checkout rule:
		
    - cart -> order conversion
		
    - then cart clear
		
		
## 6) Cross-Cutting Concerns
		
		
- Standard JSON response envelope for success/errors.
		
- Request correlation ID via `x-request-id`.
		
- Global error handler with typed operational errors.
		
- i18n-friendly message keys.
		
- Upload handling with MIME allowlist + deterministic pathing.
		
- Email templating for signup/reset/order notifications.
		
- Optional invoice PDF endpoint.
		
		
## 7) Runtime / Ops
		
		
- Required env validation at startup.
		
- DB connect retry/backoff.
		
- Optional clustering mode.
		
- Security middleware:
		
    - rate limiting
		
    - secure headers
		
- Development-only routes mounted only outside production.
		
		
## 8) Testing Approach
		
		
- Unit-focused tests for repositories/services/controllers.
		
- Isolated MongoDB in tests via memory-server setup helpers.
		
- Test factories for users/products/orders.
		
- Scripts exist for:
		
    - lint
		
    - type-check/build
		
    - tests
		
    - OpenAPI lint
		
		
## 9) Replication Priorities
		
		
- Preserve behavior parity before internal refactors.
		
- Keep route auth and ownership semantics exactly.
		
- Keep one canonical response envelope shape.
		
- Preserve cart/order coupling and order snapshot behavior.
		
- Preserve full token lifecycle:
		
    - issue
		
    - store
		
    - refresh
		
    - revoke
		
    - cleanup
		
		
---
		
		
## Endpoint Map with Auth Role
		
		
### Account/Auth
		
		
- `GET /account` — auth
		
- `POST /account/login` — public
		
- `POST /account/signup` — public
		
- `POST /account/reset` — public
		
- `POST /account/reset-confirm` — public
		
- `GET /account/refresh` — public (requires valid refresh token)
		
- `GET /account/refresh/{token}` — public (requires valid refresh token)
		
- `POST /account/logout-all` — auth
		
- `DELETE /account/tokens/expired` — admin
		
		
### Users (admin module)
		
		
- `GET /users` — admin
		
- `POST /users/search` — admin
		
- `POST /users` — admin
		
- `PUT /users` — admin
		
- `DELETE /users` — admin
		
- `GET /users/{id}` — admin
		
- `PUT /users/{id}` — admin
		
- `DELETE /users/{id}` — admin
		
		
### Products
		
		
- `GET /products` — public
		
- `POST /products/search` — public
		
- `GET /products/{id}` — public
		
- `POST /products` — admin
		
- `PUT /products` — admin
		
- `DELETE /products` — admin
		
- `PUT /products/{id}` — admin
		
- `DELETE /products/{id}` — admin
		
		
### Cart
		
		
- `GET /cart` — auth
		
- `POST /cart` — auth
		
- `DELETE /cart` — auth
		
- `PUT /cart/{productId}` — auth
		
- `DELETE /cart/{productId}` — auth
		
- `GET /cart/summary` — auth
		
- `POST /cart/checkout` — auth
		
		
### Orders
		
		
- `GET /orders` — auth (scoped for non-admin)
		
- `POST /orders/search` — auth (scoped for non-admin)
		
- `POST /orders` — admin
		
- `PUT /orders` — admin
		
- `DELETE /orders` — admin
		
- `GET /orders/{id}` — auth (owner or admin)
		
- `PUT /orders/{id}` — admin
		
- `DELETE /orders/{id}` — admin
		
- `GET /orders/{id}/invoice` — auth (owner or admin)
		
		
---
		
		
## Canonical Response Envelope
		
		
### Success
		
		
- `success: true`
		
- `status: <http-status>`
		
- `message: <string>`
		
- `data: <payload>`
		
		
### Error
		
		
- `success: false`
		
- `status: <http-status>`
		
- `message: <technical-or-domain-code>`
		
- `errors: <string[]>`
		
		
---
		
		
## Environment Variable Matrix (Minimum + Common)
		
		
### Required minimum
		
		
- `NODE_DB_URI`
		
- `NODE_ACCESS_TOKEN_SECRET`
		
- `NODE_REFRESH_TOKEN_SECRET`
		
		
### Common runtime
		
		
- `NODE_ENV`
		
- `NODE_PORT`
		
- `NODE_URL`
		
- `NODE_ENABLE_CLUSTERING`
		
- `NODE_DEFAULT_LOCALE`
		
- `NODE_FALLBACK_LOCALE`
		
- `NODE_TOKEN_CLEANUP_INTERVAL`
		
		
### JWT expiry tuning
		
		
- `NODE_ACCESS_TOKEN_SECRET_TIME`
		
- `NODE_REFRESH_TOKEN_SECRET_TIME_SHORT`
		
- `NODE_REFRESH_TOKEN_SECRET_TIME_MEDIUM`
		
- `NODE_REFRESH_TOKEN_SECRET_TIME_LONG`
		
		
### SMTP/mail
		
		
- `NODE_SMTP_NAME`
		
- `NODE_SMTP_HOST`
		
- `NODE_SMTP_PORT`
		
- `NODE_SMTP_USER`
		
- `NODE_SMTP_PASS`
		
- `NODE_SMTP_SENDER`
		
		
### Upload/static
		
		
- `NODE_PUBLIC_PATH`
		
		
### Optional PDF runtime
		
		
- `PUPPETEER_EXECUTABLE_PATH`
		
		
---
		
		
## Test Plan Blueprint
		
		
Cover at least:
		
		
- auth token issue/refresh/revoke paths
		
- role-based access (auth vs admin)
		
- ownership scoping (orders for non-admin users)
		
- users/products search filters + pagination
		
- cart operations + summary math
		
- checkout flow (order created + cart cleared)
		
- soft delete vs hard delete behaviors
		
- token cleanup behavior (manual + scheduled trigger points)
		
- repository-only tests (CRUD and query correctness)
		
- controller mapping tests (status/envelope/error mapping)
		
		
---
		
		
## Commands (Reference)
		
		
- Start dev server: `npm run dev`
		
- Type-check: `npm run ts-check`
		
- Lint: `npm run lint`
		
- Test: `npm run test`
		
- OpenAPI lint: `npm run lint:openapi`
		
- Full non-mutating check: `npm run complete:check`
		
		
---
		
		
## Reusable Master Prompt (Copy/Paste)
		
		
Use with `LANGUAGE=PHP`, then `LANGUAGE=Java`, then `LANGUAGE=Python`.
		
		
```md
		
You are a senior backend architect. Build a production-ready **{LANGUAGE} + MongoDB** backend by replicating the behavior and architecture of an existing OpenAPI-first ecommerce backend.
		
		
# Goal
		
		
Create a backend with equivalent domain behavior, security model, API surface, and layering.
		
Prioritize behavioral parity over framework-specific idioms.
		
		
# Mandatory architecture
		
		
Implement these layers and keep responsibilities strict:
		
		
1. **Routes/Endpoints**: HTTP mapping + auth middleware composition only.
		
2. **Controllers**: parse input, call services, map to response envelope.
		
3. **Services**: business logic, validation, authorization scope logic, orchestration.
		
4. **Repositories/DAOs**: Mongo-only CRUD/aggregation operations; no business rules.
		
5. **Models/Schemas**: document definitions + indexes + timestamps.
		
		
# Domains and features
		
		
Implement modules:
		
		
- account/auth
		
- users
		
- products
		
- cart
		
- orders
		
- system (health)
		
		
# API behavior to reproduce
		
		
## Account/Auth
		
		
- `GET /account` (auth required)
		
- `POST /account/login` (returns access token, sets refresh cookie)
		
- `POST /account/signup`
		
- `POST /account/reset`
		
- `POST /account/reset-confirm`
		
- `GET /account/refresh`
		
- `GET /account/refresh/{token}`
		
- `POST /account/logout-all` (auth required)
		
- `DELETE /account/tokens/expired` (admin)
		
		
## Users (admin-only module)
		
		
- `GET /users`
		
- `POST /users/search`
		
- `POST /users`
		
- `PUT /users`
		
- `DELETE /users`
		
- `GET /users/{id}`
		
- `PUT /users/{id}`
		
- `DELETE /users/{id}`
		
		
## Products
		
		
- Public read/search:
		
    - `GET /products`
		
    - `POST /products/search`
		
    - `GET /products/{id}`
		
- Admin write:
		
    - `POST /products`
		
    - `PUT /products`
		
    - `DELETE /products`
		
    - `PUT /products/{id}`
		
    - `DELETE /products/{id}`
		
		
## Cart (auth required)
		
		
- `GET /cart`
		
- `POST /cart`
		
- `DELETE /cart`
		
- `PUT /cart/{productId}`
		
- `DELETE /cart/{productId}`
		
- `GET /cart/summary`
		
- `POST /cart/checkout`
		
		
## Orders (auth required; admin for writes)
		
		
- `GET /orders`
		
- `POST /orders/search`
		
- `POST /orders` (admin create)
		
- `PUT /orders` (admin update)
		
- `DELETE /orders` (admin delete)
		
- `GET /orders/{id}` (owner or admin)
		
- `PUT /orders/{id}` (admin)
		
- `DELETE /orders/{id}` (admin)
		
- `GET /orders/{id}/invoice` (owner or admin)
		
		
# Security model
		
		
- Access JWT: short-lived bearer token.
		
- Refresh token: long-lived, stored in DB and cookie, revocable server-side.
		
- Middleware chain supports:
		
    - optional auth hydration,
		
    - strict auth enforcement,
		
    - admin enforcement.
		
- Add global rate limiting and secure headers.
		
- Add request correlation ID (`x-request-id`) support.
		
		
# Data model requirements (MongoDB)
		
		
- **User**: email, username, passwordHash, admin, imageUrl, cart(items), tokens(type/token/expiration), deletedAt, timestamps.
		
- **Product**: title, price, description, active, imageUrl, deletedAt, timestamps.
		
- **Order**: userId, email, products[] as embedded product snapshots + quantity, status enum, notes, timestamps.
		
- Soft delete for users/products via `deletedAt`.
		
- Orders remain hard-deletable.
		
		
# Business rules
		
		
- Validation in service layer (schema-based + custom checks).
		
- Search endpoints support pagination and filters.
		
- Non-admin product visibility excludes inactive/deleted items.
		
- Non-admin order listing/details scoped to own userId.
		
- Cart totals computed (items count, quantity, price).
		
- Checkout creates order from cart and then clears cart.
		
- Password reset uses one-time expiring token.
		
- Token cleanup job + admin cleanup endpoint.
		
		
# Response/error contract
		
		
- Enforce one uniform JSON envelope for all endpoints:
		
    - success boolean
		
    - status code
		
    - message
		
    - data (success) OR errors (failure)
		
- Global error handler that maps known validation/domain errors and falls back to 500.
		
		
# Non-functional requirements
		
		
- Environment validation at startup (DB URI + JWT secrets minimum).
		
- DB connection retries with exponential backoff.
		
- Structured logging.
		
- i18n-ready message keys.
		
- Optional file upload/image handling.
		
- Optional email templating.
		
- Optional invoice PDF generation endpoint.
		
		
# Testing requirements
		
		
- Unit tests for services/repositories/controllers.
		
- Isolated test DB (Mongo memory/local isolated instance).
		
- Fixtures/factories for users/products/orders.
		
- Coverage for auth, RBAC, search filters, pagination, cart/checkout, token lifecycle, soft/hard delete flows.
		
		
# Deliverables
		
		
1. Final folder structure by layer/domain.
		
2. Complete endpoint map with auth/role per endpoint.
		
3. Mongo schema definitions and indexes.
		
4. Service-level rule summary per domain.
		
5. Error catalog + response examples.
		
6. Env var matrix.
		
7. Test plan + implemented tests.
		
8. Run commands for lint, tests, and app start.
		
9. Short migration notes for `{LANGUAGE}` framework choices.
		
		
# Constraints
		
		
- Keep behavior equivalent to the reference architecture.
		
- Use idiomatic libraries for `{LANGUAGE}` but preserve contract and flows.
		
- Do not skip RBAC, token revocation, ownership scoping, pagination, or soft-delete semantics.
		
```
		
		
---
		
		
## Migration Notes by Language (Short)
		
		
- **PHP**: prefer Laravel + MongoDB driver/ODM; map services/repositories explicitly; use middleware for auth/admin.
		
- **Java**: prefer Spring Boot + Spring Data MongoDB; use filters/interceptors for correlation-id and JWT handling.
		
- **Python**: prefer FastAPI + Pydantic + Mongo driver/ODM; use dependency injection for auth scope and service wiring.
- `DELETE /cart/{productId}` — auth
- `GET /cart/summary` — auth
- `POST /cart/checkout` — auth

### Orders

- `GET /orders` — auth (scoped for non-admin)
- `POST /orders/search` — auth (scoped for non-admin)
- `POST /orders` — admin
- `PUT /orders` — admin
- `DELETE /orders` — admin
- `GET /orders/{id}` — auth (owner or admin)
- `PUT /orders/{id}` — admin
- `DELETE /orders/{id}` — admin
- `GET /orders/{id}/invoice` — auth (owner or admin)

---

## Canonical Response Envelope

### Success

- `success: true`
- `status: <http-status>`
- `message: <string>`
- `data: <payload>`

### Error

- `success: false`
- `status: <http-status>`
- `message: <technical-or-domain-code>`
- `errors: <string[]>`

---

## Environment Variable Matrix (Minimum + Common)

### Required minimum

- `NODE_DB_URI`
- `NODE_ACCESS_TOKEN_SECRET`
- `NODE_REFRESH_TOKEN_SECRET`

### Common runtime

- `NODE_ENV`
- `NODE_PORT`
- `NODE_URL`
- `NODE_ENABLE_CLUSTERING`
- `NODE_DEFAULT_LOCALE`
- `NODE_FALLBACK_LOCALE`
- `NODE_TOKEN_CLEANUP_INTERVAL`

### JWT expiry tuning

- `NODE_ACCESS_TOKEN_SECRET_TIME`
- `NODE_REFRESH_TOKEN_SECRET_TIME_SHORT`
- `NODE_REFRESH_TOKEN_SECRET_TIME_MEDIUM`
- `NODE_REFRESH_TOKEN_SECRET_TIME_LONG`

### SMTP/mail

- `NODE_SMTP_NAME`
- `NODE_SMTP_HOST`
- `NODE_SMTP_PORT`
- `NODE_SMTP_USER`
- `NODE_SMTP_PASS`
- `NODE_SMTP_SENDER`

### Upload/static

- `NODE_PUBLIC_PATH`

### Optional PDF runtime

- `PUPPETEER_EXECUTABLE_PATH`

---

## Test Plan Blueprint

Cover at least:

- auth token issue/refresh/revoke paths
- role-based access (auth vs admin)
- ownership scoping (orders for non-admin users)
- users/products search filters + pagination
- cart operations + summary math
- checkout flow (order created + cart cleared)
- soft delete vs hard delete behaviors
- token cleanup behavior (manual + scheduled trigger points)
- repository-only tests (CRUD and query correctness)
- controller mapping tests (status/envelope/error mapping)

---

## Commands (Reference)

- Start dev server: `npm run dev`
- Type-check: `npm run ts-check`
- Lint: `npm run lint`
- Test: `npm run test`
- OpenAPI lint: `npm run lint:openapi`
- Full non-mutating check: `npm run complete:check`

---

## Reusable Master Prompt (Copy/Paste)

Use with `LANGUAGE=PHP`, then `LANGUAGE=Java`, then `LANGUAGE=Python`.

```md
You are a senior backend architect. Build a production-ready **{LANGUAGE} + MongoDB** backend by replicating the behavior and architecture of an existing OpenAPI-first ecommerce backend.

# Goal

Create a backend with equivalent domain behavior, security model, API surface, and layering.
Prioritize behavioral parity over framework-specific idioms.

# Mandatory architecture

Implement these layers and keep responsibilities strict:

1. **Routes/Endpoints**: HTTP mapping + auth middleware composition only.
2. **Controllers**: parse input, call services, map to response envelope.
3. **Services**: business logic, validation, authorization scope logic, orchestration.
4. **Repositories/DAOs**: Mongo-only CRUD/aggregation operations; no business rules.
5. **Models/Schemas**: document definitions + indexes + timestamps.

# Domains and features

Implement modules:

- account/auth
- users
- products
- cart
- orders
- system (health)

# API behavior to reproduce

## Account/Auth

- `GET /account` (auth required)
- `POST /account/login` (returns access token, sets refresh cookie)
- `POST /account/signup`
- `POST /account/reset`
- `POST /account/reset-confirm`
- `GET /account/refresh`
- `GET /account/refresh/{token}`
- `POST /account/logout-all` (auth required)
- `DELETE /account/tokens/expired` (admin)

## Users (admin-only module)

- `GET /users`
- `POST /users/search`
- `POST /users`
- `PUT /users`
- `DELETE /users`
- `GET /users/{id}`
- `PUT /users/{id}`
- `DELETE /users/{id}`

## Products

- Public read/search:
    - `GET /products`
    - `POST /products/search`
    - `GET /products/{id}`
- Admin write:
    - `POST /products`
    - `PUT /products`
    - `DELETE /products`
    - `PUT /products/{id}`
    - `DELETE /products/{id}`

## Cart (auth required)

- `GET /cart`
- `POST /cart`
- `DELETE /cart`
- `PUT /cart/{productId}`
- `DELETE /cart/{productId}`
- `GET /cart/summary`
- `POST /cart/checkout`

## Orders (auth required; admin for writes)

- `GET /orders`
- `POST /orders/search`
- `POST /orders` (admin create)
- `PUT /orders` (admin update)
- `DELETE /orders` (admin delete)
- `GET /orders/{id}` (owner or admin)
- `PUT /orders/{id}` (admin)
- `DELETE /orders/{id}` (admin)
- `GET /orders/{id}/invoice` (owner or admin)

# Security model

- Access JWT: short-lived bearer token.
- Refresh token: long-lived, stored in DB and cookie, revocable server-side.
- Middleware chain supports:
    - optional auth hydration,
    - strict auth enforcement,
    - admin enforcement.
- Add global rate limiting and secure headers.
- Add request correlation ID (`x-request-id`) support.

# Data model requirements (MongoDB)

- **User**: email, username, passwordHash, admin, imageUrl, cart(items), tokens(type/token/expiration), deletedAt, timestamps.
- **Product**: title, price, description, active, imageUrl, deletedAt, timestamps.
- **Order**: userId, email, products[] as embedded product snapshots + quantity, status enum, notes, timestamps.
- Soft delete for users/products via `deletedAt`.
- Orders remain hard-deletable.

# Business rules

- Validation in service layer (schema-based + custom checks).
- Search endpoints support pagination and filters.
- Non-admin product visibility excludes inactive/deleted items.
- Non-admin order listing/details scoped to own userId.
- Cart totals computed (items count, quantity, price).
- Checkout creates order from cart and then clears cart.
- Password reset uses one-time expiring token.
- Token cleanup job + admin cleanup endpoint.

# Response/error contract

- Enforce one uniform JSON envelope for all endpoints:
    - success boolean
    - status code
    - message
    - data (success) OR errors (failure)
- Global error handler that maps known validation/domain errors and falls back to 500.

# Non-functional requirements

- Environment validation at startup (DB URI + JWT secrets minimum).
- DB connection retries with exponential backoff.
- Structured logging.
- i18n-ready message keys.
- Optional file upload/image handling.
- Optional email templating.
- Optional invoice PDF generation endpoint.

# Testing requirements

- Unit tests for services/repositories/controllers.
- Isolated test DB (Mongo memory/local isolated instance).
- Fixtures/factories for users/products/orders.
- Coverage for auth, RBAC, search filters, pagination, cart/checkout, token lifecycle, soft/hard delete flows.

# Deliverables

1. Final folder structure by layer/domain.
2. Complete endpoint map with auth/role per endpoint.
3. Mongo schema definitions and indexes.
4. Service-level rule summary per domain.
5. Error catalog + response examples.
6. Env var matrix.
7. Test plan + implemented tests.
8. Run commands for lint, tests, and app start.
9. Short migration notes for `{LANGUAGE}` framework choices.

# Constraints

- Keep behavior equivalent to the reference architecture.
- Use idiomatic libraries for `{LANGUAGE}` but preserve contract and flows.
- Do not skip RBAC, token revocation, ownership scoping, pagination, or soft-delete semantics.
```

---

## Migration Notes by Language (Short)

- **PHP**: prefer Laravel + MongoDB driver/ODM; map services/repositories explicitly; use middleware for auth/admin.
- **Java**: prefer Spring Boot + Spring Data MongoDB; use filters/interceptors for correlation-id and JWT handling.
- **Python**: prefer FastAPI + Pydantic + Mongo driver/ODM; use dependency injection for auth scope and service wiring.