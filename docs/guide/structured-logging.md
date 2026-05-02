# Structured Logging

> **TL;DR** — Every log entry is a JSON object with a consistent set of fields. Sensitive values are automatically redacted. The logger is Winston-based, production-ready, and easy to extend.

---

## Quick-start

```ts
import { logger } from '@utils/winston';

// Basic info log
logger.info('Server started', { port: 3000 });

// Error with context
logger.error('DB query failed', { error: err, collection: 'users' });

// All sensitive fields are automatically hidden
logger.info('Login attempt', { username: 'alice', password: 'hunter2' });
// → password field becomes "[REDACTED]" before it reaches any transport
```

---

## Why structured logging?

| Plain text log | Structured JSON log |
|---|---|
| `GET /products 200 32ms` | `{ "level": "info", "message": "GET /products 200 32ms", "status_code": 200, "duration_ms": 32 }` |
| Hard to filter / query | Easy to filter in Loki / Kibana / grep |
| Loses correlation context | Carries `request_id`, `trace_id` |

---

## Log shape

Every log entry produced by this app contains these fields:

```json
{
  "timestamp":  "2024-01-15T10:30:45.123+00:00",
  "level":      "info",
  "message":    "GET /products 200 32.5ms",
  "service":    "api",
  "request_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "trace_id":   "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id":    "1111111111111111",
  "method":     "GET",
  "route":      "/products",
  "status_code": 200,
  "duration_ms": 32.5,
  "user_id":    "660f1234abcd1234abcd1234",
  "ip":         "::1"
}
```

> `user_id` is only present when the request is authenticated.

---

## Flow diagram

```text
HTTP Request
     │
     ▼
request-id middleware      ← attaches req.requestId
     │
     ▼
trace-context middleware   ← attaches req.traceContext (traceId, spanId)
     │
     ▼
requestLogger middleware   ← waits for response.finish, then emits log
     │
     ├── level:  info (2xx) / warn (4xx) / error (5xx)
     ├── fields: method, route, status_code, duration_ms, user_id, ip
     └── transport: Console + error.log file
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `NODE_LOG_LEVEL` | `info` (prod) / `debug` (dev) | Winston log level |
| `NODE_SERVICE_NAME` | `api` | Service tag in every log entry |
| `NODE_ENV` | — | Controls pretty vs JSON console output |

---

## Log levels

From most severe to most verbose:

| Level | When to use |
|---|---|
| `error` | Unrecoverable failures, 5xx responses |
| `warn`  | Client errors, 4xx responses, degraded state |
| `info`  | Normal operation (server start, request completed) |
| `http`  | Per-request details if you need more granularity |
| `debug` | Internal state for local debugging |

---

## Sensitive field redaction

The following field names are **always redacted** before any transport writes the log entry:

```
password, passwordhash, confirm_password, new_password, old_password,
token, access_token, refresh_token,
authorization, cookie, jwt, set-cookie,
secret, api_key, apikey, private_key, client_secret,
credit_card, card_number, cvv, ssn
```

Matching is **case-insensitive** and applies **recursively** through nested objects and arrays.

### Example

```ts
logger.info('Signup', {
  body: { email: 'alice@example.com', password: 's3cr3t' }
});

// What actually gets logged:
// { "body": { "email": "alice@example.com", "password": "[REDACTED]" } }
```

> To add a new sensitive field, edit the `SENSITIVE_FIELDS` set in `src/utils/winston.ts`.

---

## Error serialization

Throwing an `Error` object into a log call is safe — it is automatically serialized to a plain object:

```ts
try {
  await db.find(query);
} catch (error) {
  logger.error('Query failed', { error });
  // Produces: { "error": { "name": "MongoError", "message": "...", "stack": "..." } }
  // In production, stack is omitted to avoid leaking internals.
}
```

The `serializeError` helper can also be used directly:

```ts
import { serializeError } from '@utils/winston';

const safe = serializeError(caughtValue);
// → always a plain object, never a circular reference
```

---

## Request access log

The `requestLogger` middleware (mounted in `app.ts`) emits one structured entry per completed HTTP request.

**Log level is derived from status code:**

```
2xx → info
4xx → warn
5xx → error
```

**Sample output (development, pretty format):**

```
2024-01-15T10:30:45.123+00:00 [info] GET /products 200 32.5ms
  { request_id: '...', trace_id: '...', status_code: 200, duration_ms: 32.5 }
```

**Sample output (production, JSON format):**

```json
{"timestamp":"2024-01-15T10:30:45.123+00:00","level":"info","message":"GET /products 200 32.5ms","service":"api","request_id":"...","trace_id":"...","method":"GET","route":"/products","status_code":200,"duration_ms":32.5,"user_id":"660f...","ip":"::1"}
```

---

## Output files

| File | Contents |
|---|---|
| Console | All levels (format depends on `NODE_ENV`) |
| `error.log` | Error-level entries only |

---

## Code map (`src/utils/winston.ts`)

```text
SENSITIVE_FIELDS          ← set of field names to redact
redactSensitiveFields()   ← recursive redaction walker
serializeError()          ← converts Error → plain object
redactFormat              ← Winston format plugin (applied before json())
resolveLogLevel()         ← reads NODE_LOG_LEVEL / NODE_ENV
baseFormat                ← timestamp + redact + json
prettyFormat              ← timestamp + redact + colorize + printf (dev only)
logger                    ← main application logger
auditLogger               ← security/audit event logger (see audit-logging.md)
```

---

## Related docs

- [Audit Logging](./audit-logging.md) — security and compliance events
- [Observability](./observability.md) — Prometheus metrics and trace context
