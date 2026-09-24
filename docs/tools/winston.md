# Winston & Audit Logs

## Two log streams

| Stream        | Purpose                                                               | Format                                          |
| ------------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| `logger`      | normal application logs (request access logs, errors, warnings)       | JSON in production/test, pretty + colour in dev |
| `auditLogger` | security/admin events (login attempts, role checks, token cleanup, …) | always JSON                                     |

Both write to **stdout**, which Docker captures. There is no Loki transport bundled — adding one later is a few lines in `src/infrastructure/adapters/logger.ts`.

## What an access log looks like

One slim line per request, only the fields that actually help:

```json
{
    "level": "info",
    "message": "GET /products 200 12.4ms",
    "request_id": "1b2c3d…",
    "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
    "method": "GET",
    "route": "/products",
    "status_code": 200,
    "duration_ms": 12.4
}
```

The `trace_id` is the bridge to Grafana → Tempo: paste it in Explore to see the full request timeline, every DB query, every error attribute.

## What an error log looks like

One line per error, no stack trace bloat — the stack lives on the OTel span:

```json
{
    "level": "error",
    "message": "ValidationError: name is required",
    "request_id": "1b2c3d…",
    "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
    "status": 422
}
```

## Audit events

`emitAuditEvent` (in `src/infrastructure/observability/audit.ts`) is the only entry point for auditable actions. Each event has a stable `action` (`auth.login`, `admin.user.erased`, …), an `outcome` (`success` / `failure`), and a `level` derived from the outcome.

```json
{
    "level": "info",
    "log_type": "audit",
    "action": "auth.login",
    "actor_user_id": "user-123",
    "actor_role": "user",
    "actor_scope": "tenant",
    "outcome": "success",
    "ip": "1.2.3.4",
    "request_id": "…",
    "trace_id": "…"
}
```

The `action` vocabulary is a closed union, not free strings — an alert built on
`auth.login` cannot be defeated by a typo at a call site.

It is assembled rather than declared in one place. Each module owns its own actions in
`src/modules/<name>/audit.ts` as an `as const` object and augments core's `IAuditActionMap`, the
same way modules declare domain events; `infrastructure` keeps only the three `security.*` actions emitted by
the authorization middleware about requests that never reached a domain. So the union narrows when
you delete a module, and `infrastructure` never names one. `tests/cross-cutting/audit-actions.test.ts` is
what keeps two modules from claiming the same string, or inventing one that breaks the dotted
convention log backends filter on.

### Every action

`npm run docs:audit-actions`, checked by `npm run check:docs-audit-actions`. Every action this
build can emit, its owning module, and — where a call site names one — the `target_type` it
audits. `—` means no call site attaches a target; `(varies)` means the action is fired against more
than one, from a generic helper that takes the target as a runtime parameter.

<!-- audit-actions:start -->

| Module           | Action                                      | Value                                       | Target type            |
| ---------------- | ------------------------------------------- | ------------------------------------------- | ---------------------- |
| `access`         | `ROLE_ASSIGNED`                             | `access.role.assigned`                      | —                      |
| `access`         | `ROLE_REVOKED`                              | `access.role.revoked`                       | —                      |
| `account`        | `AUTH_2FA_BACKUP_CODES_REGENERATED`         | `auth.two_factor.backup_codes_regenerated`  | —                      |
| `account`        | `AUTH_2FA_CHALLENGE_FAILED`                 | `auth.two_factor.challenge_failed`          | —                      |
| `account`        | `AUTH_2FA_CODE_SENT`                        | `auth.two_factor.code_sent`                 | —                      |
| `account`        | `AUTH_2FA_DISABLED`                         | `auth.two_factor.disabled`                  | —                      |
| `account`        | `AUTH_2FA_ENROLLED`                         | `auth.two_factor.enrolled`                  | —                      |
| `account`        | `AUTH_ACCOUNT_DELETE_COMPLETED`             | `auth.account_delete.completed`             | —                      |
| `account`        | `AUTH_ACCOUNT_DELETE_REQUESTED`             | `auth.account_delete.requested`             | —                      |
| `account`        | `AUTH_DATA_EXPORTED`                        | `auth.data_export.completed`                | —                      |
| `account`        | `AUTH_EMAIL_CHANGE_COMPLETED`               | `auth.email_change.completed`               | —                      |
| `account`        | `AUTH_EMAIL_CHANGE_REQUESTED`               | `auth.email_change.requested`               | —                      |
| `account`        | `AUTH_EMAIL_VERIFY_COMPLETED`               | `auth.email_verify.completed`               | —                      |
| `account`        | `AUTH_EMAIL_VERIFY_REQUESTED`               | `auth.email_verify.requested`               | —                      |
| `account`        | `AUTH_LOGGED_OUT`                           | `auth.logout`                               | —                      |
| `account`        | `AUTH_LOGGED_OUT_EVERYWHERE`                | `auth.logout_all`                           | —                      |
| `account`        | `AUTH_LOGIN`                                | `auth.login`                                | —                      |
| `account`        | `AUTH_OAUTH_FAILED`                         | `auth.oauth.failed`                         | —                      |
| `account`        | `AUTH_OAUTH_LINKED`                         | `auth.oauth.linked`                         | —                      |
| `account`        | `AUTH_PASSWORD_CHANGED`                     | `auth.password.changed`                     | —                      |
| `account`        | `AUTH_PASSWORD_RESET_COMPLETED`             | `auth.password_reset.completed`             | —                      |
| `account`        | `AUTH_PASSWORD_RESET_REQUESTED`             | `auth.password_reset.requested`             | —                      |
| `account`        | `AUTH_PROFILE_UPDATED`                      | `auth.profile.updated`                      | —                      |
| `account`        | `AUTH_REAUTHENTICATED`                      | `auth.reauth`                               | —                      |
| `account`        | `AUTH_REFRESH_TOKEN_REUSE_DETECTED`         | `auth.refresh_token.reuse_detected`         | —                      |
| `account`        | `AUTH_SESSION_REVOKED`                      | `auth.session.revoked`                      | —                      |
| `account`        | `AUTH_SIGNED_UP`                            | `auth.signup`                               | —                      |
| `account`        | `AUTH_TOKEN_EXPIRED_CLEANUP`                | `auth.token.expired_cleanup`                | —                      |
| `account`        | `AUTH_TOKEN_REFRESHED`                      | `auth.token.refreshed`                      | —                      |
| `api-keys`       | `ADMIN_API_KEY_MINTED`                      | `admin.api_key.minted`                      | `api_key`              |
| `api-keys`       | `ADMIN_API_KEY_REVOKED`                     | `admin.api_key.revoked`                     | `api_key`              |
| `cart`           | `USER_CART_ITEM_REMOVED`                    | `user.cart.item_removed`                    | `product`              |
| `cart`           | `USER_CART_REORDERED`                       | `user.cart.reordered`                       | —                      |
| `delivery`       | `ADMIN_ORDER_DELIVERED`                     | `admin.order.delivered`                     | —                      |
| `delivery`       | `ADMIN_ORDER_SHIPPED`                       | `admin.order.shipped`                       | —                      |
| `feedback`       | `ADMIN_FEEDBACK_DELETED`                    | `admin.feedback.deleted`                    | `feedback`             |
| `feedback`       | `ADMIN_FEEDBACK_STATUS_UPDATED`             | `admin.feedback.status_updated`             | `feedback`             |
| `feedback`       | `ADMIN_FEEDBACK_VIEWED`                     | `admin.feedback.viewed`                     | —                      |
| `infrastructure` | `SECURITY_FORBIDDEN`                        | `security.forbidden`                        | —                      |
| `infrastructure` | `SECURITY_RATE_LIMIT_HIT`                   | `security.rate_limit_hit`                   | —                      |
| `infrastructure` | `SECURITY_REAUTH_REQUIRED`                  | `security.reauth_required`                  | —                      |
| `infrastructure` | `SECURITY_UNAUTHORIZED`                     | `security.unauthorized`                     | —                      |
| `inventory`      | `ADMIN_COMMIT_ORPHANED`                     | `admin.commit.orphaned`                     | `order`                |
| `inventory`      | `ADMIN_RESERVATIONS_SWEPT`                  | `admin.reservations.swept`                  | `reservation`          |
| `inventory`      | `ADMIN_STOCK_ADJUSTED`                      | `admin.stock.adjusted`                      | —                      |
| `inventory`      | `ADMIN_STOCK_RECEIVED`                      | `admin.stock.received`                      | —                      |
| `locales`        | `ADMIN_LOCALE_CREATED`                      | `admin.locale.created`                      | `locale`               |
| `locales`        | `ADMIN_LOCALE_DELETED`                      | `admin.locale.deleted`                      | `locale`               |
| `locales`        | `ADMIN_LOCALE_ENTRY_CREATED`                | `admin.locale_entry.created`                | `locale_entry`         |
| `locales`        | `ADMIN_LOCALE_ENTRY_DELETED`                | `admin.locale_entry.deleted`                | `locale_entry`         |
| `locales`        | `ADMIN_LOCALE_ENTRY_IMPORTED`               | `admin.locale_entry.imported`               | `locale`               |
| `locales`        | `ADMIN_LOCALE_ENTRY_UPDATED`                | `admin.locale_entry.updated`                | `locale_entry`         |
| `locales`        | `ADMIN_LOCALE_UPDATED`                      | `admin.locale.updated`                      | `locale`               |
| `locales`        | `ADMIN_TRANSLATION_UPDATED`                 | `admin.translation.updated`                 | —                      |
| `orders`         | `ORDER_CANCELLED`                           | `order.cancelled`                           | `order`                |
| `orders`         | `ORDER_CREATED`                             | `order.created`                             | `order`                |
| `orders`         | `ORDER_DELETED`                             | `order.deleted`                             | `order`                |
| `orders`         | `ORDER_STATUS_OVERRIDDEN`                   | `order.status_overridden`                   | `order`                |
| `orders`         | `ORDER_UPDATED`                             | `order.updated`                             | `order`                |
| `payments`       | `ADMIN_PAYMENT_REFUNDED`                    | `admin.payment.refunded`                    | `order`                |
| `payments`       | `PAYMENT_CONFIRMED`                         | `payment.confirmed`                         | —                      |
| `payments`       | `PAYMENT_FAILED`                            | `payment.failed`                            | —                      |
| `payments`       | `PAYMENT_RECORDED_OFFLINE`                  | `payment.recorded_offline`                  | `order`                |
| `products`       | `ADMIN_PRODUCT_CREATED`                     | `admin.product.created`                     | `product`              |
| `products`       | `ADMIN_PRODUCT_DELETED`                     | `admin.product.deleted`                     | `product`              |
| `products`       | `ADMIN_PRODUCT_UPDATED`                     | `admin.product.updated`                     | `product`              |
| `users`          | `ADMIN_USER_2FA_DISABLED`                   | `admin.user.two_factor_disabled`            | `user`                 |
| `users`          | `ADMIN_USER_BANNED`                         | `admin.user.banned`                         | —                      |
| `users`          | `ADMIN_USER_CREATED`                        | `admin.user.created`                        | `user`                 |
| `users`          | `ADMIN_USER_ERASED`                         | `admin.user.erased`                         | `user`                 |
| `users`          | `ADMIN_USER_SOFT_DELETED`                   | `admin.user.soft_deleted`                   | `user`                 |
| `users`          | `ADMIN_USER_UNBANNED`                       | `admin.user.unbanned`                       | —                      |
| `users`          | `ADMIN_USER_UPDATED`                        | `admin.user.updated`                        | —                      |
| `webhooks`       | `ADMIN_WEBHOOK_DELIVERY_REPLAYED`           | `admin.webhook_delivery.replayed`           | `webhook_delivery`     |
| `webhooks`       | `ADMIN_WEBHOOK_SUBSCRIPTION_CREATED`        | `admin.webhook_subscription.created`        | `webhook_subscription` |
| `webhooks`       | `ADMIN_WEBHOOK_SUBSCRIPTION_DELETED`        | `admin.webhook_subscription.deleted`        | `webhook_subscription` |
| `webhooks`       | `ADMIN_WEBHOOK_SUBSCRIPTION_UPDATED`        | `admin.webhook_subscription.updated`        | `webhook_subscription` |
| `webhooks`       | `SYSTEM_WEBHOOK_SUBSCRIPTION_AUTO_DISABLED` | `system.webhook_subscription.auto_disabled` | `webhook_subscription` |

<!-- audit-actions:end -->

### Where an audit entry ends up

Two destinations, from the single `emitAuditEvent` call:

| Destination            | Role                                                              | Fails how                                                     |
| ---------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------- |
| `auditLogger` → stdout | the compliance record — append-only, shipped to [Loki](./loki.md) | a broken logger is a real problem                             |
| Mongo `auditlogs`      | the queryable copy behind `GET /observability/audit`              | silently, into a warning — never fails the triggering request |

The Mongo write goes through an `IAuditSink` port that `app.ts` registers after the database
connects. `src/infrastructure/**` may not import `@modules/*`, so the dependency is inverted rather
than smuggled — and the 53 `emitAuditEvent` call sites know about neither destination.

Before this, the endpoint read a 200-entry in-process ring buffer. It could not answer
"what has this user done": 200 entries **in total** across every actor, a different slice in each
cluster worker, and empty after a restart.

### Retention

| Env var                     | Effect                                                                     |
| --------------------------- | -------------------------------------------------------------------------- |
| `NODE_AUDIT_RETENTION_DAYS` | how long the Mongo copy survives before its TTL index removes it (def. 90) |

Only the queryable copy expires — log retention is [Loki](./loki.md)'s business.

::: warning Changing the retention window
Mongo will not alter an existing TTL index's `expireAfterSeconds` in place. After changing
`NODE_AUDIT_RETENTION_DAYS`, a restart **fails the boot** — `autoIndex` asks for the new window and
Mongo refuses the conflicting options. `npm run db:sync` drops the index and rebuilds it, which is
why `db:bootstrap` syncs before the server starts.
:::

## Configuration

| Env var                    | Effect                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `NODE_LOG_LEVEL`           | logger level (`error`, `warn`, `info`, `debug`, …). Defaults to `info` in production, `debug` elsewhere. |
| `NODE_SERVICE_NAME`        | tag on every log entry. Useful when several services ship logs to the same aggregator.                   |
| `NODE_LOG_PERSONAL_FIELDS` | `hash` (default), `redact`, or `plain` — see [Personal data](#personal-data) below.                      |

## Redaction

`redactSensitiveFields` replaces values of well-known sensitive keys (`password`, `token`, `cookie`, `authorization`, …) with `[REDACTED]` before logging. It runs on every log entry and on every audit event.

## Personal data

A second, separate list — `PERSONAL_FIELDS` (`email`, `ip`, `phone`, `street`, `zip`, `fullName`) — covers fields that are personal data without being credentials. Data minimisation applies to logs the same as it applies to collections, and these flow into Winston, and from there into [Loki](./loki.md), same as everything else.

Kept apart from `SENSITIVE_FIELDS` on purpose: a credential is always replaced outright, never kept in any form. A personal field defaults to **hashed** instead (`NODE_LOG_PERSONAL_FIELDS=hash`, sha256, truncated to 12 hex characters, `sha256:`-prefixed) — the same input always produces the same digest, so a trace stays followable ("did this user's requests all fail the same way") without the log line being readable on its own. `redact` drops it entirely, like a credential; `plain` leaves it untouched, for local development where the log never leaves the machine.

The private setting (`hash`) is the default deliberately: a boilerplate's default config is the one most deployments never revisit.

## Works with

- **[OpenTelemetry](./opentelemetry.md)** — the OTel SDK automatically injects the active `trace_id` into Winston's logging context on every request. You write nothing; every log line just has it. → full explanation: [How logs and traces correlate](./opentelemetry.md#how-logs-and-traces-correlate)
- **[Loki](./loki.md)** — Winston writes JSON to stdout; Promtail tails those lines and ships them to Loki. The `trace_id` on each line is what enables jumping from a log entry straight to a Tempo trace. → [Trace ↔ log correlation](./loki.md#trace-log-correlation)

## External references

- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) — guidance for what audit/security logs should capture
- [winston-loki transport](https://github.com/JaniAnttonen/winston-loki) — drop-in if you want to push logs directly to [Loki](./loki.md) instead of via Promtail

## Related pages

- [Events & Logging](./events-and-logging.md) — how these two streams relate to analytics, metrics and queue jobs
- [OpenTelemetry](./opentelemetry.md)
- [Tempo](./tempo.md)
- [Grafana](./grafana.md)
