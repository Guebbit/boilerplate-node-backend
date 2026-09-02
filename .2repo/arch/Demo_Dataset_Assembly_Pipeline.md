---
tags:
  - 2repo
  - 2repo/arch
  - project/boilerplate-node-backend
type: architecture
component: Demo_Dataset_Assembly_Pipeline
---

```mermaid
graph LR
    Optional_Dependency_Connection_Cache_Queue_Adapters["Optional Dependency Connection & Cache/Queue Adapters"]
    Demo_Dataset_Assembly_Core_App_Bootstrap["Demo Dataset Assembly Core & App Bootstrap"]
    Demo_Dataset_Serialization_Export["Demo Dataset Serialization & Export"]
    Optional_Dependency_Connection_Cache_Queue_Adapters -- "Post-seed cache invalidation clears cached responses after dataset commit" --> Demo_Dataset_Assembly_Core_App_Bootstrap
    Demo_Dataset_Assembly_Core_App_Bootstrap -- "Serialized rows carry derived image fields into the committed dataset" --> Demo_Dataset_Serialization_Export
```

## Details

The DATA half of the subsystem — the demo seeder runner and the single shared assembler that turns whatever is in the database into the published, byte-stable demo-data.json. db/demo/index.ts is the domain-agnostic runner (connection, production gate, walk over enabledModules, cache invalidation); db/demo/assemble.ts reads rows back through the real serializers, flattens to plain JSON, sorts keys for determinism, and validates that every <something>Id reference resolves to a published record. This is the seed → serialize → export core that both the export script and the migration demo-data test import, guaranteeing one definition of the dataset.

### Optional Dependency Connection & Cache/Queue Adapters
The fail-open connection lifecycle and the concrete Redis/RabbitMQ/rate-limit adapters built on it. managed-connection.ts states the six-piece lifecycle once (memoised handle, shared in-flight connect, warn-once, get/getOrThrow, state, stop); cache.ts, queue.ts, and rate-limit-store.ts each supply only their own connect/isReady/close. This is the substrate the seeder's post-seed cache invalidation (clearCache) and the app's rate limiting depend on, and it is what lets seeding succeed against a stack whose Redis is not up.

**Related Classes/Methods**:

- `src.infrastructure.adapters.managed-connection.ManagedConnection`:68-111
- `src.infrastructure.adapters.managed-connection.manageConnection`:119-249
- `src.infrastructure.adapters.cache.cacheConnection`:51-103
- `src.infrastructure.adapters.queue.queueConnection`:85-146

**Source Files:**

- `src/infrastructure/adapters/cache.ts`
  - `src.infrastructure.adapters.cache.cacheConnection` (L51-L103) - Class
  - `src.infrastructure.adapters.cache.cacheConnection.isReady` (L57-L57) - Method
  - `src.infrastructure.adapters.cache.cacheConnection.connect` (L58-L85) - Method
  - `src.infrastructure.adapters.cache.cacheConnection.connect.then() callback` (L84-L84) - Function
  - `src.infrastructure.adapters.cache.cacheConnection.close` (L86-L102) - Method
  - `src.infrastructure.adapters.cache.close.then() callback` (L96-L96) - Function
  - `src.infrastructure.adapters.cache.cacheConnection.close.then() callback` (L99-L99) - Function
  - `src.infrastructure.adapters.cache.then() callback.cacheTags.map() callback.then() callback` (L247-L247) - Function
  - `src.infrastructure.adapters.cache.ClearCacheResult` (L276-L287) - Interface
- `src/infrastructure/adapters/managed-connection.ts`
  - `src.infrastructure.adapters.managed-connection.ManagedConnectionOptions` (L17-L65) - Interface
  - `src.infrastructure.adapters.managed-connection.ManagedConnection` (L68-L111) - Interface
  - `src.infrastructure.adapters.managed-connection.manageConnection` (L119-L249) - Class
  - `src.infrastructure.adapters.managed-connection.manageConnection.NotConfigured` (L159-L159) - Class
  - `src.infrastructure.adapters.managed-connection.manageConnection.attempt.running` (L167-L184) - Class
  - `src.infrastructure.adapters.managed-connection.manageConnection.attempt.running.then() callback` (L168-L175) - Function
  - `src.infrastructure.adapters.managed-connection.manageConnection.attempt.running.catch() callback` (L176-L180) - Function
  - `src.infrastructure.adapters.managed-connection.manageConnection.attempt.running.finally() callback` (L181-L184) - Function
  - `src.infrastructure.adapters.managed-connection.get` (L199-L207) - Class
  - `src.infrastructure.adapters.managed-connection.manageConnection.get.catch() callback` (L206-L206) - Function
  - `src.infrastructure.adapters.managed-connection.manageConnection.state` (L213-L220) - Method
  - `src.infrastructure.adapters.managed-connection.manageConnection.forget` (L222-L224) - Method
  - `src.infrastructure.adapters.managed-connection.manageConnection.stop` (L228-L247) - Method
  - `src.infrastructure.adapters.managed-connection.manageConnection.stop.catch() callback` (L240-L240) - Function
  - `src.infrastructure.adapters.managed-connection.manageConnection.stop.finally() callback` (L241-L245) - Function
- `src/infrastructure/adapters/queue.ts`
  - `src.infrastructure.adapters.queue.queueConnection` (L85-L146) - Class
  - `src.infrastructure.adapters.queue.queueConnection.isReady` (L94-L94) - Method
  - `src.infrastructure.adapters.queue.queueConnection.connect` (L95-L128) - Method
  - `src.infrastructure.adapters.queue.connect.then() callback` (L106-L116) - Function
  - `src.infrastructure.adapters.queue.connect.then() callback.superviseHandle() callback` (L109-L112) - Function
  - `src.infrastructure.adapters.queue.queueConnection.connect.then() callback` (L117-L126) - Function
  - `src.infrastructure.adapters.queue.queueConnection.connect.then() callback.superviseHandle() callback` (L122-L124) - Function
  - `src.infrastructure.adapters.queue.queueConnection.close` (L129-L145) - Method
  - `src.infrastructure.adapters.queue.queueConnection.close.finally() callback` (L141-L143) - Function
  - `src.infrastructure.adapters.queue.then() callback` (L238-L238) - Function
  - `src.infrastructure.adapters.queue.PublishOptions` (L259-L270) - Interface
  - `src.infrastructure.adapters.queue.ConsumeOptions` (L319-L328) - Interface
  - `src.infrastructure.adapters.queue.then() callback.then() callback` (L427-L427) - Function
- `src/infrastructure/http/middlewares/rate-limit-store.ts`
  - `src.infrastructure.http.middlewares.rate-limit-store.build` (L52-L70) - Class
  - `src.infrastructure.http.middlewares.rate-limit-store.build.redisClient.on('error') callback` (L67-L67) - Function
  - `src.infrastructure.http.middlewares.rate-limit-store.connectionFor` (L80-L132) - Class
  - `src.infrastructure.http.middlewares.rate-limit-store.connectionFor.connection` (L89-L121) - Class
  - `src.infrastructure.http.middlewares.rate-limit-store.connectionFor.connection.isEnabled` (L95-L95) - Method
  - `src.infrastructure.http.middlewares.rate-limit-store.connectionFor.connection.connect` (L96-L108) - Method
  - `src.infrastructure.http.middlewares.rate-limit-store.connection.connect.then() callback` (L101-L101) - Function
  - `src.infrastructure.http.middlewares.rate-limit-store.connectionFor.connection.connect.then() callback` (L102-L106) - Function
  - `src.infrastructure.http.middlewares.rate-limit-store.connectionFor.connection.isReady` (L109-L109) - Method
  - `src.infrastructure.http.middlewares.rate-limit-store.connectionFor.connection.close` (L110-L118) - Method
  - `src.infrastructure.http.middlewares.rate-limit-store.connection.close.then() callback` (L114-L114) - Function
  - `src.infrastructure.http.middlewares.rate-limit-store.connectionFor.connection.close.then() callback` (L115-L115) - Function
  - `src.infrastructure.http.middlewares.rate-limit-store.connectionFor.connection.onRecovered` (L119-L120) - Method
  - `src.infrastructure.http.middlewares.rate-limit-store.connectionFor.forget` (L125-L128) - Method
  - `src.infrastructure.http.middlewares.rate-limit-store.send` (L141-L157) - Class
  - `src.infrastructure.http.middlewares.rate-limit-store.send.then() callback` (L144-L155) - Function
  - `src.infrastructure.http.middlewares.rate-limit-store.send.then() callback.catch() callback` (L150-L155) - Function
  - `src.infrastructure.http.middlewares.rate-limit-store.lazyRedisStore` (L167-L208) - Class
  - `src.infrastructure.http.middlewares.rate-limit-store.lazyRedisStore.store` (L171-L197) - Class
  - `src.infrastructure.http.middlewares.rate-limit-store.lazyRedisStore.store.sendCommand` (L177-L177) - Method
  - `src.infrastructure.http.middlewares.rate-limit-store.lazyRedisStore.store.catch() callback` (L187-L193) - Function
  - `src.infrastructure.http.middlewares.rate-limit-store.lazyRedisStore.init` (L200-L202) - Method
  - `src.infrastructure.http.middlewares.rate-limit-store.lazyRedisStore.increment` (L203-L203) - Method
  - `src.infrastructure.http.middlewares.rate-limit-store.lazyRedisStore.decrement` (L204-L204) - Method
  - `src.infrastructure.http.middlewares.rate-limit-store.lazyRedisStore.resetKey` (L205-L205) - Method
  - `src.infrastructure.http.middlewares.rate-limit-store.lazyRedisStore.get` (L206-L206) - Method

### Demo Dataset Assembly Core & App Bootstrap
The validation and wiring half of the assembler plus the app entry that hosts it. reconcileShapes enforces (in both directions) that _meta.shapes names exactly the published collections, refusing to commit an unlabelled or orphaned state; the app bootstrap (app.ts) and the schema migrations that shape the seeded rows (user active column, locale collections) define the data the assembler reads. This is the one definition of the dataset gate that both the export script and the migration demo-data test rely on.

**Related Classes/Methods**:

- `src.infrastructure.adapters.cache.getCacheValue`:139-156

**Source Files:**

- `db/demo/assemble.ts`
  - `db.demo.assemble.reconcileShapes.unlabelled` (L147-L147) - Class
  - `db.demo.assemble.reconcileShapes.unlabelled.filter() callback` (L147-L147) - Function
- `db/migrations/20260808120000-user-active-column.js`
  - `db.migrations.20260808120000-user-active-column.<unknown>` (L16-L30) - Class
  - `db.migrations.20260808120000-user-active-column.<unknown>.up` (L17-L21) - Method
  - `db.migrations.20260808120000-user-active-column.<unknown>.down` (L23-L29) - Method
- `db/migrations/20260817140000-locale-collections.js`
  - `db.migrations.20260817140000-locale-collections.<unknown>` (L31-L67) - Class
  - `db.migrations.20260817140000-locale-collections.<unknown>.up` (L32-L43) - Method
  - `db.migrations.20260817140000-locale-collections.<unknown>.down` (L45-L66) - Method
- `src/app.ts`
  - `src.app.startServer.then() callback.<function>.server` (L113-L117) - Class
  - `src.app.startServer.then() callback.<function>.server.app.listen() callback` (L113-L117) - Function
- `src/infrastructure/adapters/cache.ts`
  - `src.infrastructure.adapters.cache.getCacheValue` (L139-L156) - Class
  - `src.infrastructure.adapters.cache.getCacheValue.then() callback` (L142-L148) - Function
  - `src.infrastructure.adapters.cache.getCacheValue.then() callback.then() callback` (L147-L147) - Function
  - `src.infrastructure.adapters.cache.getCacheValue.catch() callback` (L149-L156) - Function
  - `src.infrastructure.adapters.cache.setCacheValue` (L167-L213) - Class
  - `src.infrastructure.adapters.cache.setCacheValue.then() callback` (L183-L205) - Function
  - `src.infrastructure.adapters.cache.setCacheValue.then() callback.then() callback.cacheTags.map() callback` (L199-L199) - Function
  - `src.infrastructure.adapters.cache.setCacheValue.then() callback.then() callback` (L203-L203) - Function
  - `src.infrastructure.adapters.cache.setCacheValue.catch() callback` (L206-L212) - Function
- `src/infrastructure/http/middlewares/cache.ts`
  - `src.infrastructure.http.middlewares.cache.CachedResponse` (L20-L23) - Interface
  - `src.infrastructure.http.middlewares.cache.CacheOptions` (L124-L154) - Interface
  - `src.infrastructure.http.middlewares.cache.armCacheWrite` (L221-L240) - Class
  - `src.infrastructure.http.middlewares.cache.armCacheWrite.<function>` (L228-L239) - Function
  - `src.infrastructure.http.middlewares.cache.setCache` (L250-L342) - Class
  - `src.infrastructure.http.middlewares.cache.setCache.<function>` (L255-L341) - Function
  - `src.infrastructure.http.middlewares.cache.setCache.<function>.then() callback` (L325-L340) - Function
- `src/infrastructure/http/middlewares/rate-limit.ts`
  - `src.infrastructure.http.middlewares.rate-limit.mfaChallengeLimiter` (L222-L243) - Class
  - `src.infrastructure.http.middlewares.rate-limit.mfaChallengeLimiter.keyGenerator` (L233-L242) - Method

### Demo Dataset Serialization & Export
The seed to serialize to export core. assembleDemoDataset gathers each enabled module's seedExport sections, merges and key-sorts them for byte-stability, and renders the published string; the supporting migrations (user locale, orders soft-delete, locale-entry tenant) and the image-signature adapter (extensionForImage) define the row shapes and derived image fields that get serialized into the dataset. This is the deterministic output path that produces the committed demo-data.json.

**Related Classes/Methods**:

- `src.infrastructure.adapters.image-signatures.extensionForImage`:135-136

**Source Files:**

- `db/demo/assemble.ts`
  - `db.demo.assemble.assembleDemoDataset.sections` (L168-L170) - Class
  - `db.demo.assemble.assembleDemoDataset.sections.enabledModules.map() callback` (L169-L169) - Function
- `db/migrations/20260806120000-user-locale.js`
  - `db.migrations.20260806120000-user-locale.<unknown>` (L19-L34) - Class
  - `db.migrations.20260806120000-user-locale.<unknown>.up` (L20-L24) - Method
  - `db.migrations.20260806120000-user-locale.<unknown>.down` (L26-L33) - Method
- `db/migrations/20260808200000-users-email-unique.js`
  - `db.migrations.20260808200000-users-email-unique.<unknown>.up.report` (L52-L54) - Class
  - `db.migrations.20260808200000-users-email-unique.<unknown>.up.report.duplicates.map() callback` (L53-L53) - Function
- `db/migrations/20260810120000-orders-soft-delete.js`
  - `db.migrations.20260810120000-orders-soft-delete.<unknown>` (L16-L42) - Class
  - `db.migrations.20260810120000-orders-soft-delete.<unknown>.up` (L17-L21) - Method
  - `db.migrations.20260810120000-orders-soft-delete.<unknown>.down` (L23-L41) - Method
- `db/migrations/20260822120000-locale-entry-tenant.js`
  - `db.migrations.20260822120000-locale-entry-tenant.<unknown>` (L23-L82) - Class
  - `db.migrations.20260822120000-locale-entry-tenant.<unknown>.up` (L24-L56) - Method
  - `db.migrations.20260822120000-locale-entry-tenant.<unknown>.down` (L58-L81) - Method
- `src/infrastructure/adapters/cache.ts`
  - `src.infrastructure.adapters.cache.invalidateCacheTags` (L225-L267) - Class
  - `src.infrastructure.adapters.cache.invalidateCacheTags.then() callback` (L231-L258) - Function
  - `src.infrastructure.adapters.cache.invalidateCacheTags.then() callback.cacheTags.map() callback` (L238-L253) - Function
  - `src.infrastructure.adapters.cache.invalidateCacheTags.then() callback.cacheTags.map() callback.then() callback.then() callback` (L251-L251) - Function
  - `src.infrastructure.adapters.cache.invalidateCacheTags.then() callback.then() callback` (L254-L257) - Function
  - `src.infrastructure.adapters.cache.invalidateCacheTags.then() callback.then() callback.deleted.perTag.reduce() callback` (L255-L255) - Function
  - `src.infrastructure.adapters.cache.invalidateCacheTags.catch() callback` (L259-L266) - Function
- `src/infrastructure/adapters/image-signatures.ts`
  - `src.infrastructure.adapters.image-signatures.extensionForImage` (L135-L136) - Class
  - `src.infrastructure.adapters.image-signatures.extensionForImage.SUPPORTED_IMAGE_FORMATS.find() callback` (L136-L136) - Function
- `src/infrastructure/http/middlewares/cache.ts`
  - `src.infrastructure.http.middlewares.cache.invalidateCache` (L367-L389) - Class
  - `src.infrastructure.http.middlewares.cache.invalidateCache.<function>` (L368-L389) - Function
  - `src.infrastructure.http.middlewares.cache.invalidateCache.<function>.response.on('finish') callback` (L369-L386) - Function
  - `src.infrastructure.http.middlewares.cache.invalidateCache.<function>.response.on('finish') callback.then() callback` (L373-L385) - Function
