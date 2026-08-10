# Endpoints

All available HTTP endpoints grouped by category. Auth column indicates the minimum access level required.

## System (public)

A minimal root endpoint used to verify the process is alive.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | none | Public ping — always 200 if process is running |

## Observability

Endpoints for health checks, metrics, and audit logs. The two public routes feed external scrapers (Prometheus) and the live dashboard (SSE). The admin routes are intended for internal tooling. See the dedicated [Observability Endpoints](./observability.md) page for response shapes and tool links.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/observability/events` | none | SSE stream: live metrics snapshot every 5 s |
| GET | `/observability/metrics` | none | Prometheus exposition format (text/plain) |
| GET | `/observability/health` | admin | Full health snapshot |
| GET | `/observability/metrics/overview` | admin | Curated KPI JSON |
| GET | `/observability/audit` | admin | Recent audit events |

## Account & Auth

JWT-based authentication. Login returns an `accessToken` (short-lived) and a `refreshToken` (long-lived, stored in a cookie). The refresh endpoints issue a new access token without re-authenticating. Password reset is a two-step flow: request sends an email with a signed link, confirm validates it and updates the password.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/account/login` | none | Authenticate and get JWT |
| POST | `/account/signup` | none | Register a new user |
| GET | `/account` | user | Get current user profile |
| GET | `/account/refresh` | none | Refresh access token (uses HttpOnly cookie) |
| POST | `/account/reset` | none | Request password reset email |
| POST | `/account/reset-confirm` | none | Confirm password reset |
| POST | `/account/logout-all` | user | Revoke all refresh tokens |
| DELETE | `/account` | user | Delete own account |

## Products

Standard CRUD for the product catalogue. Read endpoints are public and Redis-cached. Write endpoints (create, update, delete) are admin-only and invalidate the cache on change. Both single-item and bulk operations are supported.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/products` | none | List products (cached) |
| POST | `/products/search` | none | Search with filters |
| GET | `/products/:id` | none | Single product detail |
| POST | `/products` | admin | Create product |
| PUT | `/products` | admin | Bulk update products |
| PUT | `/products/:id` | admin | Update single product |
| DELETE | `/products` | admin | Bulk delete products |
| DELETE | `/products/:id` | admin | Delete single product |

## Cart

Per-user, server-side cart. Items are scoped to the authenticated user. `POST /cart/checkout` converts the cart into an order, clears the cart, records the `cartCheckoutTotal` metric and emits a `CHECKOUT_COMPLETED` analytics event.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/cart` | user | Get current cart |
| GET | `/cart/summary` | user | Cart summary (totals) |
| POST | `/cart` | user | Add item to cart |
| PUT | `/cart/:productId` | user | Update cart item quantity |
| DELETE | `/cart/:productId` | user | Remove item from cart |
| DELETE | `/cart` | user | Clear entire cart |
| POST | `/cart/checkout` | user | Checkout → create order |

## Orders

Orders are normally created via checkout but can also be created manually by an admin. Each order has a PDF invoice available for download. Read endpoints for regular users are scoped to their own orders only; admins can reach all orders through the write endpoints.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/orders` | user | List own orders (cached) |
| POST | `/orders/search` | user | Search own orders |
| GET | `/orders/:id` | user | Single order detail |
| GET | `/orders/:id/invoice` | user | Download order invoice PDF |
| POST | `/orders` | admin | Create order manually |
| PUT | `/orders` | admin | Bulk update orders |
| PUT | `/orders/:id` | admin | Update single order |
| DELETE | `/orders` | admin | Bulk delete orders |
| DELETE | `/orders/:id` | admin | Delete single order |

## Users (admin)

Full user management, admin-only. Supports individual and bulk operations. The equivalent self-service actions (profile read, account deletion) live under `/account`.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/users` | admin | List all users |
| POST | `/users/search` | admin | Search users |
| GET | `/users/:id` | admin | Single user detail |
| POST | `/users` | admin | Create user |
| PUT | `/users` | admin | Bulk update users |
| PUT | `/users/:id` | admin | Update single user |
| DELETE | `/users` | admin | Bulk delete users |
| DELETE | `/users/:id` | admin | Delete single user |

## Feedback

Contact form submissions from anonymous or authenticated users. Admins can list all submissions and update their status (e.g. mark as resolved). Submitting a contact form also triggers a confirmation email via the mail worker.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/feedback/contact` | none | Submit a contact form |
| GET | `/feedback` | admin | List all feedback (cached) |
| PUT | `/feedback/:id` | admin | Update feedback status |

## Realtime

Realtime is server → client only, via Server-Sent Events on `GET /observability/events` — an ordinary Express route, so all the usual middleware applies. Event names and payload shapes come from `asyncapi.yaml`; see [Observability Endpoints](./observability.md).

There is no WebSocket endpoint. SSE covers the push case without upgrade handling and works unchanged under clustering, since each stream is served entirely by the worker that accepted it. Adding bidirectional messaging means adding `ws` plus an `'upgrade'` listener on the HTTP server in `src/app.ts` — and, if connections need to talk to each other, a Redis/NATS backplane, because a connection is pinned to one worker.

## Related pages

- [Observability Endpoints](./observability.md)
- [API overview](./index.md#rest-patterns-used-here)
- [OpenAPI Workflow](./openapi-workflow.md)
