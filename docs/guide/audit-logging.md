# Audit Logging

> **TL;DR** — Security and admin events are logged to a dedicated `auditLogger` (separate from the main app logger) so they can be routed to a different sink, queried independently, and retained longer.

---

## Quick-start

```ts
import { auditLogger } from '@utils/winston';

// Log a failed login attempt
auditLogger.warn('auth.login.failed', {
  action: 'auth.login.failed',
  actor: 'anonymous',
  ip: req.ip,
  request_id: req.requestId,
  reason: 'invalid_credentials'
});

// Log an admin action
auditLogger.info('admin.product.deleted', {
  action: 'admin.product.deleted',
  actor: req.user?.id,
  request_id: req.requestId,
  resource_type: 'product',
  resource_id: productId
});
```

---

## What is an audit log?

Audit logs answer **"who did what, when, and with what outcome?"**  
They differ from application logs:

| Application log | Audit log |
|---|---|
| Debugging / performance | Compliance / security |
| High volume, short retention | Lower volume, longer retention |
| Any error or event | Only security-relevant actions |
| Can be noisy | Should be precise and structured |

---

## When to use `auditLogger`

Use `auditLogger` (not `logger`) for:

- Auth events: login success/fail, logout, refresh, password reset
- Admin actions: create/update/delete users, products, orders
- Access control: 401/403 responses to protected resources
- Token lifecycle: cleanup, revocation
- Unexpected process failures: unhandled rejections, uncaught exceptions

---

## Required fields

Every audit event **must** include:

| Field | Description |
|---|---|
| `action` | What happened — use dot-notation e.g. `auth.login.failed` |
| `actor` | Who triggered it — `user_id` string or `'anonymous'` |
| `request_id` | Correlation ID from `req.requestId` |
| `ip` | Client IP from `req.ip` |

Optional but recommended:

| Field | Description |
|---|---|
| `resource_type` | What was affected — `'user'`, `'product'`, `'order'` |
| `resource_id` | The ID of the affected resource |
| `outcome` | `'success'` or `'failure'` |
| `reason` | Human-readable reason for failures |
| `trace_id` | From `req.traceContext?.traceId` for cross-service correlation |

---

## Audit event taxonomy

### Auth events

```
auth.login.succeeded        — successful login
auth.login.failed           — wrong credentials
auth.signup.succeeded       — new user created
auth.password_reset.requested
auth.password_reset.completed
auth.refresh.succeeded      — new access token issued
auth.logout_all.succeeded   — all tokens revoked for a user
auth.token.expired_cleanup  — background job ran
```

### Admin events

```
admin.user.created
admin.user.updated
admin.user.deleted
admin.product.created
admin.product.updated
admin.product.deleted
```

### Security events

```
security.unauthorized       — 401 returned to client
security.forbidden          — 403 returned to client
security.rate_limit_hit     — IP/user hit rate limit
process.unhandledRejection  — unexpected promise rejection
process.uncaughtException   — unexpected synchronous throw
```

---

## Example log entry

```json
{
  "timestamp": "2024-01-15T10:30:45.123+00:00",
  "level": "warn",
  "message": "auth.login.failed",
  "service": "api",
  "log_type": "audit",
  "action": "auth.login.failed",
  "actor": "anonymous",
  "ip": "203.0.113.42",
  "request_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "reason": "invalid_credentials"
}
```

The `log_type: "audit"` field is automatically added by `auditLogger.defaultMeta` so log aggregators can filter audit events by stream label without needing custom queries.

---

## Flow diagram

```text
Auth / Admin action
       │
       ▼
  Service layer
       │
       ├─── normal logs ──► logger (app log stream)
       │
       └─── audit events ─► auditLogger
                                 │
                    ┌────────────┼────────────┐
                    ▼            ▼            ▼
               audit.log     Console      (future: Loki stream / SIEM)
```

---

## Output files

| File | Contents |
|---|---|
| `audit.log` | All audit events regardless of level |
| Console | All audit events (pretty in dev, JSON in production) |

---

## Adding new audit events

1. Choose an action name from the taxonomy above (or add a new one following `domain.resource.verb` naming).
2. Import `auditLogger` where the action happens (service layer is preferred).
3. Include the required fields.

```ts
// In src/services/users.ts — admin deletes a user
import { auditLogger } from '@utils/winston';

auditLogger.info('admin.user.deleted', {
  action: 'admin.user.deleted',
  actor: requestingUser.id,
  resource_type: 'user',
  resource_id: targetUserId,
  request_id: requestId,
  ip
});
```

---

## Sensitive data

Audit log entries go through the **same redaction pipeline** as application logs.  
Fields like `password`, `token`, `authorization`, and `cookie` are automatically replaced with `[REDACTED]`.

See [Structured Logging → Sensitive field redaction](./structured-logging.md#sensitive-field-redaction) for the full field list.

---

## Future: shipping to a SIEM or separate Loki stream

The `auditLogger` is already isolated. To ship events to a different backend:

1. Add a new Winston transport to `auditLogger` in `src/utils/winston.ts`.
2. Use `log_type: 'audit'` as the Loki stream label.

```ts
// Example: additional file transport for audit entries
new winston.transports.File({ filename: 'audit.log' })

// Example (future): HTTP transport to a SIEM
new winston.transports.Http({ host: 'siem.internal', port: 9000 })
```

---

## Related docs

- [Structured Logging](./structured-logging.md) — main app logger, redaction, request access log
- [Observability](./observability.md) — Prometheus metrics and trace context
