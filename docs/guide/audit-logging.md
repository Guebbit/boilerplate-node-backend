# Audit Logging

> **TL;DR** — Security and admin events are logged to a dedicated `auditLogger` (separate from the main app logger) with a formal schema, automatic redaction, and optional Loki shipping under a distinct stream label.

---

## Quick-start

```ts
import { emitAuditEvent, AuditAction, extractRequestContext } from '@utils/audit';

// Failed login
emitAuditEvent({
    action: AuditAction.AUTH_LOGIN_FAILED,
    actor_user_id: 'anonymous',
    actor_role: 'anonymous',
    outcome: 'failure',
    ...extractRequestContext(req),
    metadata: { email: req.body.email }
});

// Admin deletes a user
emitAuditEvent({
    action: AuditAction.ADMIN_USER_DELETED,
    actor_user_id: req.user!.id,
    actor_role: 'admin',
    outcome: 'success',
    target_type: 'user',
    target_id: userId,
    ...extractRequestContext(req),
});
```

---

## What is an audit log?

Audit logs answer **"who did what, when, and with what outcome?"**

| Application log              | Audit log                        |
| ---------------------------- | -------------------------------- |
| Debugging / performance      | Compliance / security            |
| High volume, short retention | Lower volume, longer retention   |
| Any error or event           | Only security-relevant actions   |
| Can be noisy                 | Should be precise and structured |

---

## Architecture

```text
Request
  │
  ├─ Middleware (isAuth / isAdmin)
  │      │  401/403 → security.unauthorized / security.forbidden
  │      ▼
  └─ Controller
         │
         ├─ Service call
         │
         ├─── emitAuditEvent() ──► auditLogger (audit stream)
         │                              │
         │                 ┌────────────┼────────────┐
         │                 ▼            ▼            ▼
         │             audit.log    Console    Loki (log_type=audit)
         │
         └─── logger (app stream)
```

---

## Formal audit event schema

Every event emitted through `emitAuditEvent()` must satisfy `IAuditEvent`:

| Field            | Type                                  | Required | Description                                       |
| ---------------- | ------------------------------------- | -------- | ------------------------------------------------- |
| `actor_user_id`  | `string`                              | ✅        | User ID, or `'anonymous'` for unauthenticated     |
| `actor_role`     | `'admin' \| 'user' \| 'anonymous'`   | ✅        | Role of the actor                                 |
| `action`         | `AuditActionValue`                    | ✅        | Dot-notation action name                          |
| `outcome`        | `'success' \| 'failure'`             | ✅        | Whether the action succeeded                      |
| `ip`             | `string`                              | —        | Client IP from `req.ip`                           |
| `user_agent`     | `string`                              | —        | User-Agent header                                 |
| `request_id`     | `string`                              | —        | `req.requestId` (x-request-id)                    |
| `trace_id`       | `string`                              | —        | OTel trace ID for cross-signal correlation        |
| `target_type`    | `string`                              | —        | Resource type: `'user'`, `'product'`, `'order'`   |
| `target_id`      | `string`                              | —        | ID of the affected resource                       |
| `metadata`       | `Record<string, unknown>`             | —        | Extra context (keep small, non-sensitive)         |

> **Timestamp** is injected automatically by Winston's `format.timestamp()` — no need to add it manually.

---

## `emitAuditEvent()` — log levels

| Outcome     | Log level |
| ----------- | --------- |
| `'success'` | `info`    |
| `'failure'` | `warn`    |

---

## `extractRequestContext()` helper

Reduces boilerplate when building events inside request handlers:

```ts
const ctx = extractRequestContext(req);
// → { ip, user_agent, request_id, trace_id }

emitAuditEvent({
    action: AuditAction.AUTH_LOGIN_SUCCEEDED,
    actor_user_id: userId,
    actor_role: 'user',
    outcome: 'success',
    ...ctx,          // spread all four fields at once
});
```

---

## Action taxonomy

### Auth

| Action key                           | Value                            | When                            |
| ------------------------------------ | -------------------------------- | ------------------------------- |
| `AUTH_LOGIN_SUCCEEDED`               | `auth.login.succeeded`           | Successful login                |
| `AUTH_LOGIN_FAILED`                  | `auth.login.failed`              | Wrong credentials               |
| `AUTH_SIGNUP_SUCCEEDED`              | `auth.signup.succeeded`          | New account created             |
| `AUTH_SIGNUP_FAILED`                 | `auth.signup.failed`             | Signup validation error         |
| `AUTH_PASSWORD_RESET_REQUESTED`      | `auth.password_reset.requested`  | Reset email sent                |
| `AUTH_PASSWORD_RESET_COMPLETED`      | `auth.password_reset.completed`  | Password successfully changed   |
| `AUTH_REFRESH_SUCCEEDED`             | `auth.refresh.succeeded`         | New access token issued         |
| `AUTH_REFRESH_FAILED`                | `auth.refresh.failed`            | Invalid or missing refresh token|
| `AUTH_LOGOUT_ALL_SUCCEEDED`          | `auth.logout_all.succeeded`      | All sessions revoked            |
| `AUTH_TOKEN_EXPIRED_CLEANUP`         | `auth.token.expired_cleanup`     | Admin ran token cleanup         |

### Admin

| Action key               | Value                     | When                        |
| ------------------------ | ------------------------- | --------------------------- |
| `ADMIN_USER_CREATED`     | `admin.user.created`      | Admin creates a user        |
| `ADMIN_USER_UPDATED`     | `admin.user.updated`      | Admin edits a user          |
| `ADMIN_USER_DELETED`     | `admin.user.deleted`      | Admin soft/hard-deletes user|
| `ADMIN_PRODUCT_CREATED`  | `admin.product.created`   | Admin creates a product     |
| `ADMIN_PRODUCT_UPDATED`  | `admin.product.updated`   | Admin edits a product       |
| `ADMIN_PRODUCT_DELETED`  | `admin.product.deleted`   | Admin deletes a product     |
| `ADMIN_ORDER_CREATED`    | `admin.order.created`     | Admin creates an order      |
| `ADMIN_ORDER_UPDATED`    | `admin.order.updated`     | Admin updates an order      |
| `ADMIN_ORDER_DELETED`    | `admin.order.deleted`     | Admin deletes an order      |

### Security / access control

| Action key                  | Value                       | When                             |
| --------------------------- | --------------------------- | -------------------------------- |
| `SECURITY_UNAUTHORIZED`     | `security.unauthorized`     | `isAuth` rejects with 401        |
| `SECURITY_FORBIDDEN`        | `security.forbidden`        | `isAdmin` rejects with 403       |
| `SECURITY_RATE_LIMIT_HIT`   | `security.rate_limit_hit`   | Rate limiter triggered           |

---

## Sample log entry

```json
{
    "timestamp": "2024-01-15T10:30:45.123+00:00",
    "level": "warn",
    "message": "auth.login.failed",
    "service": "api",
    "log_type": "audit",
    "action": "auth.login.failed",
    "actor_user_id": "anonymous",
    "actor_role": "anonymous",
    "outcome": "failure",
    "ip": "203.0.113.42",
    "user_agent": "Mozilla/5.0 (X11; Linux x86_64)",
    "request_id": "c4f9e11a-3b2d-4a1e-89f6-000000000001",
    "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
    "metadata": { "email": "attacker@example.com" }
}
```

The `log_type: "audit"` label is set by `auditLogger.defaultMeta` — Loki stream queries and dashboards can filter with `{log_type="audit"}`.

---

## Instrumented call sites (Phase 6)

| File                                           | Events emitted                                      |
| ---------------------------------------------- | --------------------------------------------------- |
| `controllers/account/post-login.ts`            | `AUTH_LOGIN_SUCCEEDED`, `AUTH_LOGIN_FAILED`         |
| `controllers/account/post-signup.ts`           | `AUTH_SIGNUP_SUCCEEDED`, `AUTH_SIGNUP_FAILED`       |
| `controllers/account/post-reset-request.ts`    | `AUTH_PASSWORD_RESET_REQUESTED`                     |
| `controllers/account/post-reset-confirm.ts`    | `AUTH_PASSWORD_RESET_COMPLETED`                     |
| `controllers/account/post-logout-everywhere.ts`| `AUTH_LOGOUT_ALL_SUCCEEDED`                         |
| `controllers/account/get-refresh-token.ts`     | `AUTH_REFRESH_SUCCEEDED`, `AUTH_REFRESH_FAILED`     |
| `controllers/account/delete-expired-tokens.ts` | `AUTH_TOKEN_EXPIRED_CLEANUP`                        |
| `controllers/users/write-users.ts`             | `ADMIN_USER_CREATED`, `ADMIN_USER_UPDATED`          |
| `controllers/users/delete-users.ts`            | `ADMIN_USER_DELETED`                                |
| `controllers/products/write-products.ts`       | `ADMIN_PRODUCT_CREATED`, `ADMIN_PRODUCT_UPDATED`    |
| `controllers/products/delete-products.ts`      | `ADMIN_PRODUCT_DELETED`                             |
| `controllers/orders/post-orders.ts`            | `ADMIN_ORDER_CREATED`                               |
| `controllers/orders/put-orders.ts`             | `ADMIN_ORDER_UPDATED`                               |
| `controllers/orders/delete-orders.ts`          | `ADMIN_ORDER_DELETED`                               |
| `middlewares/authorizations.ts`                | `SECURITY_UNAUTHORIZED`, `SECURITY_FORBIDDEN`       |

---

## Output files and transports

| Destination | Contents                                       | Activation        |
| ----------- | ---------------------------------------------- | ----------------- |
| `audit.log` | All audit events regardless of level           | Always            |
| Console     | All audit events (pretty in dev, JSON in prod) | Always            |
| Loki        | All audit events under `log_type=audit` label  | Set `NODE_LOKI_HOST` |

---

## Sensitive data

Audit log entries pass through the **same redaction pipeline** as application logs. Fields like `password`, `token`, `authorization`, and `cookie` are automatically replaced with `[REDACTED]`.

See [Structured Logging → Sensitive field redaction](./structured-logging.md#sensitive-field-redaction) for the full field list.

---

## Adding new audit events

1. Add the action constant to `AuditAction` in `src/utils/audit.ts`.
2. Import `emitAuditEvent`, `AuditAction`, `extractRequestContext` at the call site.
3. Include all required fields (`actor_user_id`, `actor_role`, `action`, `outcome`).

```ts
// Example: custom domain event
import { emitAuditEvent, extractRequestContext, AuditAction } from '@utils/audit';

emitAuditEvent({
    action: AuditAction.ADMIN_USER_DELETED,
    actor_user_id: req.user!.id,
    actor_role: 'admin',
    outcome: 'success',
    target_type: 'user',
    target_id: userId,
    ...extractRequestContext(req),
    metadata: { hardDelete: true }
});
```

---

## Querying audit logs

### With Loki / Grafana

```logql
# All audit events
{log_type="audit"}

# Only failures
{log_type="audit"} | json | outcome = "failure"

# Forbidden access attempts
{log_type="audit"} | json | action = "security.forbidden"

# Admin actions by a specific user
{log_type="audit"} | json | actor_role = "admin" | actor_user_id = "user-id-here"
```

### With grep (local file)

```bash
# All failed login attempts
grep '"action":"auth.login.failed"' audit.log | jq .

# All 403s from the last hour
grep '"action":"security.forbidden"' audit.log | tail -50 | jq .
```

---

## Related docs

- [Structured Logging](./structured-logging.md) — main app logger, redaction, request access log
- [Loki Logging](./loki-logging.md) — shipping audit logs to Loki
- [Observability](./observability.md) — Prometheus metrics and trace context
