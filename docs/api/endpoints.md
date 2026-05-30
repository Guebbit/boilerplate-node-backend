# Endpoints

All available HTTP endpoints grouped by category. Auth column indicates the minimum access level required.

## System (public)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | none | Public ping — always 200 if process is running |

## Observability

See the dedicated [Observability Endpoints](./observability.md) page for details, response shapes, and links to related observability tools.

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/observability/events` | none | SSE stream: live metrics snapshot every 5 s |
| GET | `/observability/metrics` | none | Prometheus exposition format (text/plain) |
| GET | `/observability/health` | admin | Full health snapshot |
| GET | `/observability/metrics/overview` | admin | Curated KPI JSON |
| GET | `/observability/audit` | admin | Recent audit events |

## Account & Auth

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/account/login` | none | Authenticate and get JWT |
| POST | `/account/signup` | none | Register a new user |
| GET | `/account` | user | Get current user profile |
| GET | `/account/refresh` | none | Refresh access token |
| GET | `/account/refresh/:token` | none | Refresh via token param |
| POST | `/account/reset` | none | Request password reset email |
| POST | `/account/reset-confirm` | none | Confirm password reset |
| POST | `/account/logout-all` | user | Revoke all refresh tokens |
| DELETE | `/account` | user | Delete own account |

## Products

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

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| POST | `/feedback/contact` | none | Submit a contact form |
| GET | `/feedback` | admin | List all feedback (cached) |
| PUT | `/feedback/:id` | admin | Update feedback status |

## WebSocket

| Endpoint | Auth | Description |
| --- | --- | --- |
| `/ws/chat` | none | Demo WebSocket chat |

## Related pages

- [Observability Endpoints](./observability.md)
- [API overview](./index.md#rest-patterns-used-here)
- [OpenAPI Workflow](./openapi-workflow.md)
