---
tags:
  - 2brain
  - 2brain/arch
  - project/boilerplate-node-backend
type: architecture
component: Ops_Maintenance_Account_Seeding
---

```mermaid
graph LR
    Ops_Maintenance_Scripts_Account_Seeding_Pipeline["Ops Maintenance Scripts & Account Seeding Pipeline"]
    Infrastructure_Adapter_Connection_State_Store_Layer["Infrastructure Adapter Connection & State Store Layer"]
    Cache_Operations_HTTP_Validation_Gateway["Cache Operations & HTTP Validation Gateway"]
    Infrastructure_Adapter_Connection_State_Store_Layer -- "calls" --> Ops_Maintenance_Scripts_Account_Seeding_Pipeline
    Cache_Operations_HTTP_Validation_Gateway -- "Delegates all cache CRUD transport to the Redis state store" --> Infrastructure_Adapter_Connection_State_Store_Layer
```

## Details

This sub-component owns the operational maintenance scripts and the account/access-model seeding logic that prepare the database before scenario flows run. It encompasses the reaping and sweeping scripts (inactive accounts, orders, payments, order/payment effects), the breached-password refresh pipeline, and the sharding plan used to partition mutation-test work. It also contains the scenarios.accounts seeding module that writes the access model (roles, grants, credentials) as the first wave of any scenario seed. The AppInstance reference and enabledModuleLocales symbol indicate this group also touches the app-assembly boundary where modules are enabled and locales are resolved during boot. This is the 'prepare the ground' layer: it ensures the database is in a known, safe state before the scenario runner drives any flows.

### Ops Maintenance Scripts & Account Seeding Pipeline
The core engine of the subsystem. It contains every scripts/ops/* entry point — reap-inactive-accounts, reap-orders, reap-payments, sweep-order-effects, sweep-payment-effects, and refresh-breached-passwords — each exposing a main / runScript callback that orchestrates a single maintenance pass. The sharding.ts module partitions mutation-test work into deterministic shards so parallel workers never collide. The scenarios.accounts seeding module is the first-wave writer: it materialises the access model (roles, grants, credentials) into the database before any commerce flow executes. The group also carries the AppInstance reference and enabledModuleLocales symbol, marking the seam where the ops pipeline reads the app-assembly boundary to discover which modules are enabled and which locales are resolved during boot.

**Related Classes/Methods**:

- `scripts.ops.sweep-order-effects.main`:40-46
- `scripts.ops.reap-orders.main`:30-33
- `scripts.ops.refresh-breached-passwords.downloadCorpus`:61-66

**Source Files:**

- `scenarios/accounts.ts`
  - `scenarios.accounts.then() callback` (L102-L109) - Function
- `scripts/mutation/sharding.ts`
  - `scripts.mutation.sharding.packIntoShards.totalLines` (L46-L46) - Class
  - `scripts.mutation.sharding.packIntoShards.totalLines.files.reduce() callback` (L46-L46) - Function
- `scripts/ops/reap-inactive-accounts.ts`
  - `scripts.ops.reap-inactive-accounts.runScript() callback` (L137-L137) - Function
- `scripts/ops/reap-orders.ts`
  - `scripts.ops.reap-orders.main` (L30-L33) - Class
  - `scripts.ops.reap-orders.then() callback` (L32-L32) - Function
  - `scripts.ops.reap-orders.main.then() callback` (L33-L33) - Function
- `scripts/ops/reap-payments.ts`
  - `scripts.ops.reap-payments.main` (L27-L30) - Class
  - `scripts.ops.reap-payments.then() callback` (L29-L29) - Function
  - `scripts.ops.reap-payments.main.then() callback` (L30-L30) - Function
- `scripts/ops/refresh-breached-passwords.ts`
  - `scripts.ops.refresh-breached-passwords.downloadCorpus` (L61-L66) - Class
  - `scripts.ops.refresh-breached-passwords.downloadCorpus.map() callback` (L65-L65) - Function
  - `scripts.ops.refresh-breached-passwords.main.survivors.lines.filter() callback` (L74-L74) - Function
  - `scripts.ops.refresh-breached-passwords.survivors` (L74-L74) - Class
  - `scripts.ops.refresh-breached-passwords.runScript() callback` (L88-L88) - Function
- `scripts/ops/sweep-order-effects.ts`
  - `scripts.ops.sweep-order-effects.main` (L40-L46) - Class
  - `scripts.ops.sweep-order-effects.then() callback` (L42-L44) - Function
  - `scripts.ops.sweep-order-effects.main.then() callback` (L46-L46) - Function
- `scripts/ops/sweep-payment-effects.ts`
  - `scripts.ops.sweep-payment-effects.main` (L31-L34) - Class
  - `scripts.ops.sweep-payment-effects.then() callback` (L33-L33) - Function
  - `scripts.ops.sweep-payment-effects.main.then() callback` (L34-L34) - Function
- `scripts/ops/sweep-reservations.ts`
  - `scripts.ops.sweep-reservations.main` (L28-L35) - Class
  - `scripts.ops.sweep-reservations.then() callback` (L30-L33) - Function
  - `scripts.ops.sweep-reservations.main.then() callback` (L35-L35) - Function
  - `scripts.ops.sweep-reservations.runScript('sweep:reservations') callback` (L37-L37) - Function
- `src/app.ts`
  - `src.app.AppInstance` (L59-L81) - Interface
  - `src.app.boot.then() callback` (L106-L106) - Function
  - `src.app.createApp.boot.then() callback` (L136-L136) - Function
  - `src.app.start.then() callback` (L150-L150) - Function
  - `src.app.createApp.start.then() callback` (L151-L173) - Function
  - `src.app.createApp.start.then() callback.then() callback` (L160-L172) - Function
  - `src.app.createApp.stop.finally() callback` (L180-L183) - Function
- `src/infrastructure/adapters/demo-outbox.ts`
  - `src.infrastructure.adapters.demo-outbox.DemoOutboxEmail` (L18-L38) - Interface
  - `src.infrastructure.adapters.demo-outbox.recordDemoEmail.lines.filter() callback` (L62-L62) - Function
  - `src.infrastructure.adapters.demo-outbox.recordDemoEmail.lines.map() callback` (L63-L63) - Function
  - `src.infrastructure.adapters.demo-outbox.recordDemoEmail.attachments.request.attachments.map() callback` (L65-L65) - Function
- `src/infrastructure/adapters/managed-connection.ts`
  - `src.infrastructure.adapters.managed-connection.UnavailabilityLatch` (L21-L27) - Interface
  - `src.infrastructure.adapters.managed-connection.unavailabilityLatch` (L37-L52) - Class
  - `src.infrastructure.adapters.managed-connection.unavailabilityLatch.report` (L41-L45) - Method
  - `src.infrastructure.adapters.managed-connection.unavailabilityLatch.clear` (L46-L50) - Method
  - `src.infrastructure.adapters.managed-connection.manageConnection.latch` (L183-L191) - Class
  - `src.infrastructure.adapters.managed-connection.manageConnection.latch.unavailabilityLatch() callback` (L183-L191) - Function
  - `src.infrastructure.adapters.managed-connection.manageConnection.NotConfigured` (L194-L194) - Class
  - `src.infrastructure.adapters.managed-connection.manageConnection.attempt.running` (L200-L218) - Class
  - `src.infrastructure.adapters.managed-connection.manageConnection.attempt.running.then() callback` (L201-L209) - Function
  - `src.infrastructure.adapters.managed-connection.manageConnection.attempt.running.catch() callback` (L210-L214) - Function
  - `src.infrastructure.adapters.managed-connection.manageConnection.attempt.running.finally() callback` (L215-L218) - Function
- `src/infrastructure/adapters/pdf.ts`
  - `src.infrastructure.adapters.pdf.then() callback.then() callback.then() callback` (L142-L154) - Function
- `src/infrastructure/adapters/queue.ts`
  - `src.infrastructure.adapters.queue.unavailabilityLog.unavailabilityLatch() callback` (L110-L112) - Function
  - `src.infrastructure.adapters.queue.unavailabilityLog` (L110-L113) - Class
  - `src.infrastructure.adapters.queue.setupChannel` (L145-L186) - Class
  - `src.infrastructure.adapters.queue.setupChannel.ch.on('error') callback` (L158-L161) - Function
  - `src.infrastructure.adapters.queue.setupChannel.ch.on('close') callback` (L162-L183) - Function
  - `src.infrastructure.adapters.queue.setupChannel.ch.on('close') callback.retry` (L179-L181) - Class
  - `src.infrastructure.adapters.queue.setupChannel.ch.on('close') callback.retry.setTimeout() callback` (L179-L181) - Function
  - `src.infrastructure.adapters.queue.ensureConnecting` (L210-L239) - Class
  - `src.infrastructure.adapters.queue.ensureConnecting.then() callback` (L221-L235) - Function
  - `src.infrastructure.adapters.queue.ensureConnecting.then() callback.model.on('connect') callback` (L226-L230) - Function
  - `src.infrastructure.adapters.queue.ensureConnecting.then() callback.model.on('disconnect') callback` (L231-L234) - Function
  - `src.infrastructure.adapters.queue.stopQueue` (L279-L302) - Class
  - `src.infrastructure.adapters.queue.stopQueue.then() callback` (L296-L299) - Function
  - `src.infrastructure.adapters.queue.stopQueue.catch() callback` (L300-L300) - Function
  - `src.infrastructure.adapters.queue.cancelConsumers` (L312-L317) - Class
  - `src.infrastructure.adapters.queue.cancelConsumers.tags.map() callback` (L316-L316) - Function
  - `src.infrastructure.adapters.queue.cancelConsumers.then() callback` (L316-L316) - Function
- `src/infrastructure/http/middlewares/idempotency-model.ts`
  - `src.infrastructure.http.middlewares.idempotency-model.IdempotencyRecordDocument` (L24-L33) - Interface
- `src/infrastructure/persistence/create-repository.ts`
  - `src.infrastructure.persistence.create-repository.FindAllOptions` (L52-L59) - Interface
  - `src.infrastructure.persistence.create-repository.SearchSpec` (L69-L95) - Interface
  - `src.infrastructure.persistence.create-repository.PaginatedResult` (L181-L184) - Interface
  - `src.infrastructure.persistence.create-repository.RepositoryOptions` (L187-L196) - Interface
  - `src.infrastructure.persistence.create-repository.deleteOne` (L365-L369) - Class
  - `src.infrastructure.persistence.create-repository.createRepository.deleteOne.then() callback` (L368-L368) - Function
  - `src.infrastructure.persistence.create-repository.search` (L380-L401) - Class
  - `src.infrastructure.persistence.create-repository.createRepository.search.then() callback` (L393-L399) - Function
  - `src.infrastructure.persistence.create-repository.createRepository.search.then() callback.then() callback` (L395-L398) - Function
- `src/infrastructure/persistence/search.ts`
  - `src.infrastructure.persistence.search.PaginationResult` (L20-L24) - Interface
  - `src.infrastructure.persistence.search.PaginatedMeta` (L27-L32) - Interface
- `src/infrastructure/runtime/cluster-policy.ts`
  - `src.infrastructure.runtime.cluster-policy.CrashPolicy` (L27-L36) - Interface
  - `src.infrastructure.runtime.cluster-policy.recentCrashes` (L51-L54) - Class
  - `src.infrastructure.runtime.cluster-policy.crashVerdict.recentCrashes.history.filter() callback` (L52-L52) - Function
- `src/infrastructure/runtime/database.ts`
  - `src.infrastructure.runtime.database.start.attemptConnect` (L93-L120) - Class
  - `src.infrastructure.runtime.database.attemptConnect.then() callback` (L98-L98) - Function
  - `src.infrastructure.runtime.database.start.attemptConnect.then() callback` (L99-L119) - Function
  - `src.infrastructure.runtime.database.start.attemptConnect.then() callback.then() callback` (L118-L118) - Function
  - `src.infrastructure.runtime.database.watchConnection` (L134-L141) - Class
  - `src.infrastructure.runtime.database.watchConnection.mongoose.connection.on('disconnected') callback` (L138-L138) - Function
  - `src.infrastructure.runtime.database.watchConnection.mongoose.connection.on('reconnected') callback` (L139-L139) - Function
  - `src.infrastructure.runtime.database.stopDatabase` (L150-L161) - Class
  - `src.infrastructure.runtime.database.stopDatabase.then() callback` (L153-L160) - Function
- `src/infrastructure/runtime/server-lifecycle.ts`
  - `src.infrastructure.runtime.server-lifecycle.closeServer` (L103-L120) - Class
  - `src.infrastructure.runtime.server-lifecycle.closeServer.<function>` (L104-L120) - Function
  - `src.infrastructure.runtime.server-lifecycle.closeServer.<function>.server.close() callback` (L111-L118) - Function
  - `src.infrastructure.runtime.server-lifecycle.shutdownInfra` (L129-L150) - Class
  - `src.infrastructure.runtime.server-lifecycle.shutdownInfra.then() callback` (L150-L150) - Function
- `src/infrastructure/runtime/settle.ts`
  - `src.infrastructure.runtime.settle.settleWithin` (L14-L30) - Class
  - `src.infrastructure.runtime.settle.settleWithin.then() callback` (L27-L27) - Function
  - `src.infrastructure.runtime.settle.settleWithin.finally() callback` (L27-L28) - Function
- `src/infrastructure/security/breached-passwords/index.ts`
  - `src.infrastructure.security.breached-passwords.index.bundledList` (L34-L38) - Class
  - `src.infrastructure.security.breached-passwords.index.bundledList.filter() callback` (L37-L37) - Function
- `src/modules.ts`
  - `src.modules.enabledModuleLocales` (L63-L66) - Class
  - `src.modules.enabledModuleLocales.enabledModules.map() callback` (L65-L65) - Function
  - `src.modules.enabledModuleLocales.filter() callback` (L66-L66) - Function
- `src/modules/account/session/config.ts`
  - `src.modules.account.session.config.RefreshTokenExpiryTime` (L16-L20) - Enum
- `src/modules/inventory/domain/transitions.ts`
  - `src.modules.inventory.domain.transitions.CounterDelta` (L22-L25) - Interface
- `src/modules/observability/services/dependency-health.ts`
  - `src.modules.observability.services.dependency-health.DependencyHealth` (L18-L22) - Interface
- `src/modules/orders/factories.ts`
  - `src.modules.orders.factories.makeOrder.items.map() callback` (L133-L137) - Function
- `src/modules/payments/services/effects.ts`
  - `src.modules.payments.services.effects.then() callback` (L35-L45) - Function
- `src/modules/webhooks/services/subscriptions.ts`
  - `src.modules.webhooks.services.subscriptions.SubscriptionWithMintedSecrets` (L33-L39) - Interface

### Infrastructure Adapter Connection & State Store Layer
The connection and state-management substrate that the ops scripts and seeding pipeline depend on. It provides the ManagedConnection abstraction (open / get / close lifecycle) used by every adapter that talks to an external store. Concrete adapters include the Redis client (closeRedisClient), the cache connection (cacheConnection, claimCacheKey), the AMQP queue (publishToDead for dead-letter routing), the mail spool (spoolAttachment), the rate-limit store, the upload adapter, and the Altcha anti-bot store. For the ops subsystem, this layer is the transport and state seam: reaping scripts acquire a managed connection, perform bulk mutations, and release; the breached-password pipeline publishes work items to the queue; the seeding module writes through the cache and rate-limit stores.

**Related Classes/Methods**:

- `src.infrastructure.adapters.managed-connection.ManagedConnection`:115-158
- `src.infrastructure.adapters.redis.closeRedisClient`:101-107
- `src.infrastructure.adapters.queue.publishToDead`:771-792
- `src.infrastructure.adapters.cache.cacheConnection`:53-78
- `src.infrastructure.adapters.mail-spool.spoolAttachment`:46-51

**Source Files:**

- `src/infrastructure/adapters/antibot-providers/altcha-store.ts`
  - `src.infrastructure.adapters.antibot-providers.altcha-store.altchaStore` (L57-L67) - Class
  - `src.infrastructure.adapters.antibot-providers.altcha-store.altchaStore.get` (L58-L64) - Method
  - `src.infrastructure.adapters.antibot-providers.altcha-store.altchaStore.get.then() callback` (L63-L63) - Function
  - `src.infrastructure.adapters.antibot-providers.altcha-store.altchaStore.set` (L66-L66) - Method
- `src/infrastructure/adapters/cache.ts`
  - `src.infrastructure.adapters.cache.cacheConnection` (L53-L78) - Class
  - `src.infrastructure.adapters.cache.cacheConnection.isReady` (L59-L59) - Method
  - `src.infrastructure.adapters.cache.cacheConnection.connect` (L60-L76) - Method
  - `src.infrastructure.adapters.cache.cacheConnection.connect.then() callback` (L75-L75) - Function
  - `src.infrastructure.adapters.cache.claimCacheKey` (L233-L249) - Class
  - `src.infrastructure.adapters.cache.claimCacheKey.then() callback` (L239-L244) - Function
  - `src.infrastructure.adapters.cache.claimCacheKey.then() callback.then() callback` (L243-L243) - Function
  - `src.infrastructure.adapters.cache.claimCacheKey.catch() callback` (L245-L249) - Function
  - `src.infrastructure.adapters.cache.then() callback.cacheTags.map() callback.then() callback` (L318-L318) - Function
  - `src.infrastructure.adapters.cache.ClearCacheResult` (L376-L387) - Interface
- `src/infrastructure/adapters/mail-spool.ts`
  - `src.infrastructure.adapters.mail-spool.spoolAttachment` (L46-L51) - Class
  - `src.infrastructure.adapters.mail-spool.spoolAttachment.then() callback` (L50-L50) - Function
- `src/infrastructure/adapters/managed-connection.ts`
  - `src.infrastructure.adapters.managed-connection.ManagedConnectionOptions` (L63-L112) - Interface
  - `src.infrastructure.adapters.managed-connection.ManagedConnection` (L115-L158) - Interface
  - `src.infrastructure.adapters.managed-connection.manageConnection` (L167-L282) - Class
  - `src.infrastructure.adapters.managed-connection.get` (L233-L240) - Class
  - `src.infrastructure.adapters.managed-connection.manageConnection.get.catch() callback` (L239-L239) - Function
  - `src.infrastructure.adapters.managed-connection.manageConnection.state` (L246-L253) - Method
  - `src.infrastructure.adapters.managed-connection.manageConnection.forget` (L255-L257) - Method
  - `src.infrastructure.adapters.managed-connection.manageConnection.stop` (L261-L280) - Method
  - `src.infrastructure.adapters.managed-connection.manageConnection.stop.catch() callback` (L273-L273) - Function
  - `src.infrastructure.adapters.managed-connection.manageConnection.stop.finally() callback` (L274-L278) - Function
- `src/infrastructure/adapters/queue.ts`
  - `src.infrastructure.adapters.queue.publishToDead` (L771-L792) - Class
  - `src.infrastructure.adapters.queue.publishToDead.ch.sendToQueue() callback` (L776-L790) - Function
- `src/infrastructure/adapters/redis.ts`
  - `src.infrastructure.adapters.redis.closeRedisClient` (L101-L107) - Class
  - `src.infrastructure.adapters.redis.closeRedisClient.then() callback` (L105-L105) - Function
- `src/infrastructure/http/middlewares/rate-limit-store.ts`
  - `src.infrastructure.http.middlewares.rate-limit-store.build` (L58-L66) - Class
  - `src.infrastructure.http.middlewares.rate-limit-store.build.redisClient.on('error') callback` (L63-L63) - Function
  - `src.infrastructure.http.middlewares.rate-limit-store.connectionFor` (L77-L125) - Class
  - `src.infrastructure.http.middlewares.rate-limit-store.connectionFor.connection` (L86-L114) - Class
  - `src.infrastructure.http.middlewares.rate-limit-store.connectionFor.connection.isEnabled` (L92-L92) - Method
  - `src.infrastructure.http.middlewares.rate-limit-store.connectionFor.connection.connect` (L93-L105) - Method
  - `src.infrastructure.http.middlewares.rate-limit-store.connection.connect.then() callback` (L98-L98) - Function
  - `src.infrastructure.http.middlewares.rate-limit-store.connectionFor.connection.connect.then() callback` (L99-L103) - Function
  - `src.infrastructure.http.middlewares.rate-limit-store.connectionFor.connection.isReady` (L106-L106) - Method
  - `src.infrastructure.http.middlewares.rate-limit-store.connectionFor.connection.close` (L107-L110) - Method
  - `src.infrastructure.http.middlewares.rate-limit-store.connectionFor.connection.onRecovered` (L111-L113) - Method
  - `src.infrastructure.http.middlewares.rate-limit-store.connectionFor.forget` (L118-L121) - Method
  - `src.infrastructure.http.middlewares.rate-limit-store.send` (L134-L150) - Class
  - `src.infrastructure.http.middlewares.rate-limit-store.send.then() callback` (L137-L148) - Function
  - `src.infrastructure.http.middlewares.rate-limit-store.send.then() callback.catch() callback` (L143-L148) - Function
  - `src.infrastructure.http.middlewares.rate-limit-store.lazyRedisStore` (L160-L210) - Class
  - `src.infrastructure.http.middlewares.rate-limit-store.lazyRedisStore.store` (L164-L199) - Class
  - `src.infrastructure.http.middlewares.rate-limit-store.lazyRedisStore.store.sendCommand` (L170-L170) - Method
  - `src.infrastructure.http.middlewares.rate-limit-store.lazyRedisStore.store.catch() callback` (L185-L194) - Function
  - `src.infrastructure.http.middlewares.rate-limit-store.lazyRedisStore.init` (L202-L204) - Method
  - `src.infrastructure.http.middlewares.rate-limit-store.lazyRedisStore.increment` (L205-L205) - Method
  - `src.infrastructure.http.middlewares.rate-limit-store.lazyRedisStore.decrement` (L206-L206) - Method
  - `src.infrastructure.http.middlewares.rate-limit-store.lazyRedisStore.resetKey` (L207-L207) - Method
  - `src.infrastructure.http.middlewares.rate-limit-store.lazyRedisStore.get` (L208-L208) - Method
- `src/infrastructure/http/middlewares/upload.ts`
  - `src.infrastructure.http.middlewares.upload.upload` (L433-L435) - Class
  - `src.infrastructure.http.middlewares.upload.upload.image` (L434-L434) - Method
- `src/infrastructure/http/schemas.ts`
  - `src.infrastructure.http.schemas.optionalBooleanSchema` (L108-L111) - Class
  - `src.infrastructure.http.schemas.optionalBooleanSchema.z.preprocess() callback` (L109-L109) - Function

### Cache Operations & HTTP Validation Gateway
The read/write and validation surface that the ops pipeline exercises against cached and HTTP-validated state. It owns the full cache CRUD vocabulary — startCache, getCacheValue, setCacheValue, claimCacheRefresh, invalidateCacheTags, indexUnderTag — which the seeding module uses to warm or invalidate locale and access-model caches after a write. The mailer adapter contributes missingSmtpCompanions validation so that seeding notifications fail fast when SMTP config is incomplete. The ssrf-guard protects any outbound fetch the ops scripts perform. registerValidationMessages wires Zod error messages into the HTTP layer so that any validation failure during seeding produces contract-conformant error payloads. Finally, publicLocaleCache in the locales module exposes the resolved locale set that enabledModuleLocales reads at boot, closing the loop between the app-assembly boundary and the cache layer.

**Related Classes/Methods**:

- `src.infrastructure.adapters.cache.claimCacheRefresh`:265-284
- `src.infrastructure.adapters.cache.invalidateCacheTags`:296-340
- `src.infrastructure.adapters.mailer.missingSmtpCompanions`:124-125
- `src.infrastructure.http.validation-messages.registerValidationMessages`:88-91
- `src.modules.locales.routes.publicLocaleCache`:55-61

**Source Files:**

- `src/infrastructure/adapters/cache.ts`
  - `src.infrastructure.adapters.cache.startCache` (L101-L101) - Class
  - `src.infrastructure.adapters.cache.startCache.then() callback` (L101-L101) - Function
  - `src.infrastructure.adapters.cache.getCacheValue` (L114-L133) - Class
  - `src.infrastructure.adapters.cache.getCacheValue.then() callback` (L117-L123) - Function
  - `src.infrastructure.adapters.cache.getCacheValue.then() callback.then() callback` (L122-L122) - Function
  - `src.infrastructure.adapters.cache.getCacheValue.catch() callback` (L124-L133) - Function
  - `src.infrastructure.adapters.cache.setCacheValue` (L144-L199) - Class
  - `src.infrastructure.adapters.cache.setCacheValue.then() callback` (L160-L189) - Function
  - `src.infrastructure.adapters.cache.setCacheValue.then() callback.then() callback.cacheTags.map() callback` (L176-L182) - Function
  - `src.infrastructure.adapters.cache.setCacheValue.then() callback.then() callback` (L187-L187) - Function
  - `src.infrastructure.adapters.cache.setCacheValue.catch() callback` (L190-L198) - Function
  - `src.infrastructure.adapters.cache.indexUnderTag` (L213-L222) - Class
  - `src.infrastructure.adapters.cache.indexUnderTag.then() callback` (L222-L222) - Function
  - `src.infrastructure.adapters.cache.claimCacheRefresh` (L265-L284) - Class
  - `src.infrastructure.adapters.cache.claimCacheRefresh.then() callback` (L268-L274) - Function
  - `src.infrastructure.adapters.cache.claimCacheRefresh.then() callback.then() callback` (L273-L273) - Function
  - `src.infrastructure.adapters.cache.claimCacheRefresh.catch() callback` (L275-L284) - Function
  - `src.infrastructure.adapters.cache.invalidateCacheTags` (L296-L340) - Class
  - `src.infrastructure.adapters.cache.invalidateCacheTags.then() callback` (L302-L329) - Function
  - `src.infrastructure.adapters.cache.invalidateCacheTags.then() callback.cacheTags.map() callback` (L309-L324) - Function
  - `src.infrastructure.adapters.cache.invalidateCacheTags.then() callback.cacheTags.map() callback.then() callback.then() callback` (L322-L322) - Function
  - `src.infrastructure.adapters.cache.invalidateCacheTags.then() callback.then() callback` (L325-L328) - Function
  - `src.infrastructure.adapters.cache.invalidateCacheTags.then() callback.then() callback.deleted.perTag.reduce() callback` (L326-L326) - Function
  - `src.infrastructure.adapters.cache.invalidateCacheTags.catch() callback` (L330-L339) - Function
  - `src.infrastructure.adapters.cache.invalidateCacheTagsLogged` (L352-L367) - Class
  - `src.infrastructure.adapters.cache.invalidateCacheTagsLogged.then() callback` (L353-L367) - Function
- `src/infrastructure/adapters/mailer.ts`
  - `src.infrastructure.adapters.mailer.missingSmtpCompanions` (L124-L125) - Class
  - `src.infrastructure.adapters.mailer.missingSmtpCompanions.SMTP_COMPANIONS.filter() callback` (L125-L125) - Function
- `src/infrastructure/adapters/ssrf-guard.ts`
  - `src.infrastructure.adapters.ssrf-guard.resolveAllAddresses.lookup.then() callback.addresses.results.flatMap() callback` (L141-L142) - Function
  - `src.infrastructure.adapters.ssrf-guard.resolveAllAddresses.lookup.then() callback.addresses` (L141-L143) - Class
- `src/infrastructure/http/middlewares/cache.ts`
  - `src.infrastructure.http.middlewares.cache.CacheOptions` (L166-L211) - Interface
  - `src.infrastructure.http.middlewares.cache.armCacheWrite` (L275-L303) - Class
  - `src.infrastructure.http.middlewares.cache.armCacheWrite.<function>` (L283-L302) - Function
  - `src.infrastructure.http.middlewares.cache.serveOrArm` (L378-L448) - Class
  - `src.infrastructure.http.middlewares.cache.serveOrArm.then() callback` (L403-L441) - Function
  - `src.infrastructure.http.middlewares.cache.serveOrArm.then() callback.then() callback` (L428-L440) - Function
  - `src.infrastructure.http.middlewares.cache.setCache` (L460-L485) - Class
  - `src.infrastructure.http.middlewares.cache.setCache.<function>` (L465-L484) - Function
  - `src.infrastructure.http.middlewares.cache.invalidateCache` (L514-L524) - Class
  - `src.infrastructure.http.middlewares.cache.invalidateCache.<function>` (L515-L524) - Function
  - `src.infrastructure.http.middlewares.cache.invalidateCache.<function>.response.on('finish') callback` (L516-L521) - Function
- `src/infrastructure/http/middlewares/upload.ts`
  - `src.infrastructure.http.middlewares.upload.withLocaleRestored` (L205-L214) - Class
  - `src.infrastructure.http.middlewares.upload.withLocaleRestored.<function>` (L207-L214) - Function
  - `src.infrastructure.http.middlewares.upload.withLocaleRestored.<function>.middleware() callback` (L208-L214) - Function
  - `src.infrastructure.http.middlewares.upload.withLocaleRestored.<function>.middleware() callback.runWithLocaleContext() callback` (L213-L213) - Function
- `src/infrastructure/http/validation-messages.ts`
  - `src.infrastructure.http.validation-messages.registerValidationMessages` (L88-L91) - Class
  - `src.infrastructure.http.validation-messages.registerValidationMessages.customError` (L90-L90) - Method
- `src/infrastructure/security/breached-passwords/index.ts`
  - `src.infrastructure.security.breached-passwords.index.checkHibpRange` (L60-L95) - Class
  - `src.infrastructure.security.breached-passwords.index.checkHibpRange.then() callback` (L79-L85) - Function
  - `src.infrastructure.security.breached-passwords.index.checkHibpRange.catch() callback` (L86-L94) - Function
- `src/modules/locales/routes.ts`
  - `src.modules.locales.routes.publicLocaleCache` (L55-L61) - Class
  - `src.modules.locales.routes.publicLocaleCache.scopeKey` (L59-L60) - Method
