# The data layer

Databases, caches and queues. The application's guards are irrelevant if the store answers someone
who never went through the application — and historically that is exactly how the large breaches
happened: not a clever exploit, a MongoDB bound to `0.0.0.0` with no password.

Three questions, in order of how badly getting them wrong ends:

1. Can anything reach the store that is not this app?
2. Does a query carry the caller's scope, or is the scope checked afterwards?
3. Does the cache remember whose answer it was?

## Reaching the store

| Attack                          | How it works                                                | This boilerplate                                                                                                                                                                                                                                |
| ------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exposed database                | MongoDB/Redis/Elasticsearch bound to `0.0.0.0` without auth | Neither Mongo, Redis nor RabbitMQ publishes a port in the production compose file; they are reachable on the compose network and nowhere else — `docker-compose.production.yml`                                                                 |
| Exposed message broker          | AMQP/MQTT management interfaces without auth                | Same answer — no published port.                                                                                                                                                                                                                |
| Default / weak DB credentials   | vendor defaults, shared passwords                           | `MONGO_ROOT_PASSWORD`, `MONGO_APP_PASSWORD`, `RABBITMQ_PASSWORD` and `REDIS_PASSWORD` all use compose's `:?` form, so the stack REFUSES TO START rather than falling back to a default — `docker-compose.production.yml`                        |
| Weak cache / broker credentials | the cache left open because "it is only a cache"            | Redis carries `--requirepass`, the same value `NODE_REDIS_URL` embeds — it also backs the rate-limit store, so an unauthenticated reader could otherwise reset budgets or read another user's cached response — `docker-compose.production.yml` |
| Over-privileged DB account      | one superuser for all services                              | The app authenticates as a `readWrite` user scoped to its own database, created by `docker/mongo-init.js` — the root account `MONGO_INITDB_ROOT_*` creates is never used at runtime                                                             |
| Backup exposure                 | old data in public buckets or snapshots with wide ACLs      | The deployment's. `.dockerignore` at least keeps dumps and coverage out of the image.                                                                                                                                                           |
| Unencrypted at rest             | a disk image or backup is readable as-is                    | Disk-level is the host's; field-level, see [Secrets at rest](crypto-and-secrets.md#secrets-at-rest).                                                                                                                                            |

## The query

| Attack                          | How it works                                                  | This boilerplate                                                                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Missing tenant / owner scope    | the filter is built from client input rather than the session | The owner clause rides IN the read, compiled from the caller's own rules — a caller with no id produces a filter that matches NOTHING, never one that is absent — `kernel/access/query.ts#accessibleFilter` |
| Operator injection              | `$gt`, `$ne`, `$where` reaching a filter object               | Same answer as [NoSQL injection](injection.md#into-a-database-query).                                                                                                                                       |
| Unbounded / unindexed queries   | one request scans the collection                              | `findAll` applies a 1000-row backstop when no limit is named, and both `page` and `pageSize` are capped at the contract layer — `create-repository.ts`, `infrastructure/http/schemas.ts`                    |
| Orphaned / residual data        | soft-deleted rows still readable; missing cascades            | Soft-deleted rows are filtered by the repository's own `visibleScope`, not by each caller remembering to — `infrastructure/persistence/create-repository.ts`                                                |
| Replication-lag inconsistencies | authorization decided on a replica that has not caught up     | Reads use the default primary read preference, so an authorization decision never lands on a lagging secondary.                                                                                             |
| ObjectId / UUID v1 leakage      | ids reveal timestamps or hosts, and are used as secrets       | Ids are identifiers, never secrets: every read that takes one is scoped, so knowing an id grants nothing — `kernel/access/query.ts`                                                                         |

**Why `accessibleFilter` compiles rather than appends.** An appended scope is a step someone can
forget; a compiled one is the only way to build the filter at all. The difference shows up in the
failure mode: forgetting to append gives you every row, while a caller with no rules gives you a
filter that matches nothing. Failing closed is a property of the shape, not of the reviewer.

## The cache

| Attack                              | How it works                                           | This boilerplate                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cache poisoning (application cache) | the key is missing the user, tenant or locale          | The key carries the caller (`getCacheScope`) and the locale as well as the route, and only the route's DECLARED `keyParameters` — see [HTTP and caches](http-and-caches.md#caches) |
| Stale authorization in cache        | a revoked role or token still served from a warm entry | `invalidateCache` clears by tag on every write, and `getCacheScope` means a revoked caller reads their own bucket rather than a shared one — `cache.ts#invalidateCache`            |

## The broker

| Attack                  | How it works                                        | This boilerplate                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Queue / event poisoning | consumers trust the message shape; deserialization  | Every consumed message is validated against the contract's OWN generated schema before a handler sees it, and `.strict()`, so a field the contract never declared is refused rather than passed through — `infrastructure/adapters/queue.ts`, `src/types/asyncapi.generated.ts`                                                                                                    |
| Event replay            | a consumer re-runs its side effects on a redelivery | A mismatch DEAD-LETTERS rather than requeues, since a payload that does not match will not start matching on a retry. For a legitimate redelivery, the side effects themselves are keyed — a reservation on its reservation id, a provider callback on its own reference — so replaying one is a no-op rather than a second effect. See [Idempotency](../../tools/idempotency.md). |

## Secrets stored with the data

| Attack              | How it works                            | This boilerplate                                                                                                                                                                                       |
| ------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Secrets in database | third-party tokens in plaintext columns | Refresh, reset, delete-confirmation and backup-code tokens are stored as sha256 digests; a TOTP device secret is AES-256-GCM under a versioned key — `users/model.ts#hashToken`, `account/two-factor/` |

## Related

- [Injection](injection.md#into-a-database-query) — what reaches the query planner
- [Authorization](authorization.md#object-level-whose-row-is-it) — the same filter, from the caller's side
- [Crypto and secrets](crypto-and-secrets.md) — why a digest here and a cipher there
- [Infrastructure](infrastructure.md) — the compose file every row above cites
