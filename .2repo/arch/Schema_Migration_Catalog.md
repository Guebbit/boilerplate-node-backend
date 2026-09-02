---
tags:
  - 2repo
  - 2repo/arch
  - project/boilerplate-node-backend
type: architecture
component: Schema_Migration_Catalog
---

```mermaid
graph LR
    Image_Pipeline_Binary_Storage_Adapter["Image Pipeline & Binary Storage Adapter"]
    Seed_Image_Generation_Search_Pagination["Seed Image Generation & Search Pagination"]
    Migration_Catalog_Demo_Data_Assembly["Migration Catalog & Demo Data Assembly"]
    Seed_Image_Generation_Search_Pagination -- "Reuses production image pipeline for byte-identical seed output" --> Image_Pipeline_Binary_Storage_Adapter
    Seed_Image_Generation_Search_Pagination -- "Produces image manifests consumed by demo seeder fixtures" --> Migration_Catalog_Demo_Data_Assembly
    Migration_Catalog_Demo_Data_Assembly -- "Demo dataset references image artifacts served from pipeline-managed public path" --> Image_Pipeline_Binary_Storage_Adapter
```

## Details

The ordered, timestamped, reversible migration files that own MongoDB schema evolution — index creation/pruning, column renames and backfills, soft-delete flags, and locale-collection shaping. Each migration exposes up/down and is written to be idempotent and lossless (e.g. $rename guarded by $exists). This is the SCHEMA half of the subsystem, deliberately separated from the DATA half owned by the seeder. It also carries the reproducible seed-image generation that feeds the demo catalogue.

### Image Pipeline & Binary Storage Adapter
The infrastructure port/adapter that owns the full lifecycle of binary image content: quarantining staged uploads outside the public root, identifying format by magic bytes (never trusting Content-Type), digesting and thumbnailing through a single shared pipeline, promoting to the public path, and reaping stale quarantine files. Also provides the filesystem primitives (deleteFile, moveFile) and the mailer adapter that the pipeline and maintenance scripts depend on. This is the swappable adapter boundary — 'move uploads to a bucket' is a change to one file, not five.

**Related Classes/Methods**:

- `src.infrastructure.adapters.image-store.ImageStore`:24-92
- `src.infrastructure.adapters.image-store.filesystemImageStore`:160-218
- `src.infrastructure.adapters.image-signatures.identifyImage`:89-94
- `src.infrastructure.adapters.image.worker.digestQuarantinedImage`:83-101
- `src.infrastructure.adapters.storage.quarantineUploadedImages`:281-331

**Source Files:**

- `scripts/reap-quarantine.ts`
  - `scripts.reap-quarantine.runScript() callback` (L61-L61) - Function
- `scripts/regenerate-artifacts.ts`
  - `scripts.regenerate-artifacts.Step` (L31-L36) - Interface
- `src/globals.d.ts`
  - `src.globals.d.'express-serve-static-core'.Request` (L12-L39) - Interface
- `src/infrastructure/adapters/filesystem.ts`
  - `src.infrastructure.adapters.filesystem.deleteFile` (L47-L56) - Class
  - `src.infrastructure.adapters.filesystem.deleteFile.toolkitDeleteFile() callback` (L49-L55) - Function
- `src/infrastructure/adapters/image-signatures.ts`
  - `src.infrastructure.adapters.image-signatures.ImageFormat` (L19-L30) - Interface
  - `src.infrastructure.adapters.image-signatures.identifyImage` (L89-L94) - Class
  - `src.infrastructure.adapters.image-signatures.identifyImage.SUPPORTED_IMAGE_FORMATS.find() callback` (L91-L93) - Function
  - `src.infrastructure.adapters.image-signatures.identifyImage.SUPPORTED_IMAGE_FORMATS.find() callback.format.bytes.every() callback` (L93-L93) - Function
- `src/infrastructure/adapters/image-store.ts`
  - `src.infrastructure.adapters.image-store.ImageStore` (L24-L92) - Interface
  - `src.infrastructure.adapters.image-store.ImageStore.quarantine` (L34-L34) - Method
  - `src.infrastructure.adapters.image-store.ImageStore.readQuarantined` (L43-L43) - Method
  - `src.infrastructure.adapters.image-store.ImageStore.removeQuarantined` (L54-L54) - Method
  - `src.infrastructure.adapters.image-store.ImageStore.promote` (L67-L67) - Method
  - `src.infrastructure.adapters.image-store.ImageStore.putDerivative` (L79-L79) - Method
  - `src.infrastructure.adapters.image-store.ImageStore.remove` (L91-L91) - Method
  - `src.infrastructure.adapters.image-store.filesystemImageStore` (L160-L218) - Class
  - `src.infrastructure.adapters.image-store.filesystemImageStore.quarantine` (L161-L169) - Method
  - `src.infrastructure.adapters.image-store.filesystemImageStore.readQuarantined` (L171-L171) - Method
  - `src.infrastructure.adapters.image-store.filesystemImageStore.removeQuarantined` (L173-L173) - Method
  - `src.infrastructure.adapters.image-store.filesystemImageStore.promote` (L175-L184) - Method
  - `src.infrastructure.adapters.image-store.filesystemImageStore.putDerivative` (L186-L193) - Method
  - `src.infrastructure.adapters.image-store.filesystemImageStore.remove` (L195-L217) - Method
  - `src.infrastructure.adapters.image-store.filesystemImageStore.remove.then() callback` (L215-L215) - Function
- `src/infrastructure/adapters/image.worker.ts`
  - `src.infrastructure.adapters.image.worker.DigestedImageUrls` (L35-L40) - Interface
  - `src.infrastructure.adapters.image.worker.digestQuarantinedImage` (L83-L101) - Class
  - `src.infrastructure.adapters.image.worker.digestQuarantinedImage.then() callback` (L84-L101) - Function
  - `src.infrastructure.adapters.image.worker.then() callback.then() callback` (L90-L94) - Function
  - `src.infrastructure.adapters.image.worker.digestQuarantinedImage.then() callback.then() callback` (L96-L99) - Function
  - `src.infrastructure.adapters.image.worker.digestQuarantinedImage.then() callback.then() callback.then() callback` (L99-L99) - Function
  - `src.infrastructure.adapters.image.worker.settleWriteback` (L115-L134) - Class
  - `src.infrastructure.adapters.image.worker.settleWriteback.then() callback` (L122-L134) - Function
  - `src.infrastructure.adapters.image.worker.settleWriteback.then() callback.then() callback` (L133-L133) - Function
  - `src.infrastructure.adapters.image.worker.handleImageDigestJob` (L143-L173) - Class
  - `src.infrastructure.adapters.image.worker.handleImageDigestJob.then() callback` (L161-L162) - Function
  - `src.infrastructure.adapters.image.worker.handleImageDigestJob.then() callback.then() callback` (L162-L162) - Function
  - `src.infrastructure.adapters.image.worker.handleImageDigestJob.catch() callback` (L164-L172) - Function
  - `src.infrastructure.adapters.image.worker.handleImageDigestJob.catch() callback.then() callback` (L171-L171) - Function
  - `src.infrastructure.adapters.image.worker.enqueueImageDigest.runInline` (L189-L194) - Class
  - `src.infrastructure.adapters.image.worker.enqueueImageDigest.runInline.then() callback` (L190-L193) - Function
- `src/infrastructure/adapters/mailer.ts`
  - `src.infrastructure.adapters.mailer.withSpan('email.send') callback.then() callback` (L180-L189) - Function
  - `src.infrastructure.adapters.mailer.EmailContent` (L229-L241) - Interface
  - `src.infrastructure.adapters.mailer.then() callback` (L265-L265) - Function
- `src/infrastructure/adapters/storage.ts`
  - `src.infrastructure.adapters.storage.withLocaleRestored` (L196-L205) - Class
  - `src.infrastructure.adapters.storage.withLocaleRestored.<function>` (L198-L205) - Function
  - `src.infrastructure.adapters.storage.withLocaleRestored.<function>.middleware() callback` (L199-L205) - Function
  - `src.infrastructure.adapters.storage.withLocaleRestored.<function>.middleware() callback.runWithLocaleContext() callback` (L204-L204) - Function
  - `src.infrastructure.adapters.storage.validateUploadedImages` (L220-L267) - Class
  - `src.infrastructure.adapters.storage.validateUploadedImages.paths.map() callback` (L234-L234) - Function
  - `src.infrastructure.adapters.storage.validateUploadedImages.then() callback` (L235-L265) - Function
  - `src.infrastructure.adapters.storage.validateUploadedImages.then() callback.then() callback` (L256-L263) - Function
  - `src.infrastructure.adapters.storage.validateUploadedImages.catch() callback` (L266-L266) - Function
  - `src.infrastructure.adapters.storage.quarantineUploadedImages` (L281-L331) - Class
  - `src.infrastructure.adapters.storage.quarantineUploadedImages.staged.map() callback` (L291-L291) - Function
  - `src.infrastructure.adapters.storage.quarantineUploadedImages.then() callback` (L292-L329) - Function
  - `src.infrastructure.adapters.storage.quarantineUploadedImages.then() callback.staged.map() callback` (L298-L298) - Function
  - `src.infrastructure.adapters.storage.quarantineUploadedImages.then() callback.results.filter() callback` (L302-L302) - Function
  - `src.infrastructure.adapters.storage.quarantineUploadedImages.then() callback.map() callback` (L303-L303) - Function
  - `src.infrastructure.adapters.storage.then() callback.then() callback` (L304-L304) - Function
  - `src.infrastructure.adapters.storage.quarantineUploadedImages.then() callback.then() callback` (L319-L323) - Function
  - `src.infrastructure.adapters.storage.then() callback.then() callback.digested.map() callback` (L320-L320) - Function
  - `src.infrastructure.adapters.storage.quarantineUploadedImages.then() callback.then() callback.digested.map() callback` (L321-L321) - Function
  - `src.infrastructure.adapters.storage.quarantineUploadedImages.then() callback.catch() callback` (L324-L327) - Function
  - `src.infrastructure.adapters.storage.quarantineUploadedImages.then() callback.catch() callback.keys.map() callback` (L325-L325) - Function
  - `src.infrastructure.adapters.storage.quarantineUploadedImages.then() callback.catch() callback.then() callback` (L325-L326) - Function
- `src/infrastructure/http/errors.ts`
  - `src.infrastructure.http.errors.ExtendedError` (L25-L67) - Class
  - `src.infrastructure.http.errors.ExtendedError.constructor` (L44-L66) - Constructor
- `src/infrastructure/http/uploads.ts`
  - `src.infrastructure.http.uploads.getFormFiles` (L29-L48) - Function
- `src/infrastructure/runtime/otel-sdk.ts`
  - `src.infrastructure.runtime.otel-sdk.buildProcessors.headers.map() callback` (L68-L73) - Function
- `src/modules/account/analytics.ts`
  - `src.modules.account.analytics.'@infrastructure/observability/analytics'.AnalyticsEventMap` (L24-L26) - Interface
- `src/modules/account/audit.ts`
  - `src.modules.account.audit.'@infrastructure/observability/audit'.AuditActionMap` (L51-L53) - Interface
- `src/modules/audit-logs/model.ts`
  - `src.modules.audit-logs.model.AuditLogDocument` (L34-L36) - Interface
- `src/modules/cart/analytics.ts`
  - `src.modules.cart.analytics.'@infrastructure/observability/analytics'.AnalyticsEventMap` (L34-L36) - Interface
- `src/modules/cart/audit.ts`
  - `src.modules.cart.audit.'@infrastructure/observability/audit'.AuditActionMap` (L21-L23) - Interface
- `src/modules/cart/model.ts`
  - `src.modules.cart.model.CartDocument` (L34-L50) - Interface
- `src/modules/delivery/audit.ts`
  - `src.modules.delivery.audit.'@infrastructure/observability/audit'.AuditActionMap` (L17-L19) - Interface
- `src/modules/feedback/audit.ts`
  - `src.modules.feedback.audit.'@infrastructure/observability/audit'.AuditActionMap` (L18-L20) - Interface
- `src/modules/feedback/model.ts`
  - `src.modules.feedback.model.FeedbackRequestDocument` (L29-L34) - Interface
- `src/modules/inventory/audit.ts`
  - `src.modules.inventory.audit.'@infrastructure/observability/audit'.AuditActionMap` (L20-L22) - Interface
- `src/modules/inventory/events.ts`
  - `src.modules.inventory.events.'@kernel/events'.DomainEventMap` (L14-L21) - Interface
- `src/modules/locales/audit.ts`
  - `src.modules.locales.audit.'@infrastructure/observability/audit'.AuditActionMap` (L27-L29) - Interface
- `src/modules/locales/module.ts`
  - `src.modules.locales.module.registerLocaleOverrideProvider() callback` (L31-L31) - Function
- `src/modules/orders/analytics.ts`
  - `src.modules.orders.analytics.'@infrastructure/observability/analytics'.AnalyticsEventMap` (L26-L28) - Interface
- `src/modules/orders/audit.ts`
  - `src.modules.orders.audit.'@infrastructure/observability/audit'.AuditActionMap` (L25-L27) - Interface
- `src/modules/orders/events.ts`
  - `src.modules.orders.events.'@kernel/events'.DomainEventMap` (L13-L28) - Interface
- `src/modules/orders/service.ts`
  - `src.modules.orders.service.detachUserId` (L425-L433) - Class
  - `src.modules.orders.service.detachUserId.then() callback` (L429-L432) - Function
- `src/modules/payments/analytics.ts`
  - `src.modules.payments.analytics.'@infrastructure/observability/analytics'.AnalyticsEventMap` (L18-L20) - Interface
- `src/modules/payments/audit.ts`
  - `src.modules.payments.audit.'@infrastructure/observability/audit'.AuditActionMap` (L16-L18) - Interface
- `src/modules/products/analytics.ts`
  - `src.modules.products.analytics.'@infrastructure/observability/analytics'.AnalyticsEventMap` (L18-L20) - Interface
- `src/modules/products/audit.ts`
  - `src.modules.products.audit.'@infrastructure/observability/audit'.AuditActionMap` (L17-L19) - Interface
- `src/modules/products/events.ts`
  - `src.modules.products.events.'@kernel/events'.DomainEventMap` (L10-L19) - Interface
- `src/modules/products/service.ts`
  - `src.modules.products.service.sanitizeStringArray` (L47-L50) - Class
  - `src.modules.products.service.sanitizeStringArray.values.map() callback` (L49-L49) - Function
  - `src.modules.products.service.create` (L163-L186) - Class
  - `src.modules.products.service.create.then() callback` (L176-L186) - Function
  - `src.modules.products.service.update` (L195-L238) - Class
  - `src.modules.products.service.update.then() callback` (L232-L237) - Function
  - `src.modules.products.service.update.then() callback.then() callback` (L234-L235) - Function
- `src/modules/users/analytics.ts`
  - `src.modules.users.analytics.'@infrastructure/observability/analytics'.AnalyticsEventMap` (L21-L23) - Interface
- `src/modules/users/audit.ts`
  - `src.modules.users.audit.'@infrastructure/observability/audit'.AuditActionMap` (L27-L29) - Interface
- `src/modules/users/events.ts`
  - `src.modules.users.events.'@kernel/events'.DomainEventMap` (L10-L23) - Interface
- `src/modules/wishlist/analytics.ts`
  - `src.modules.wishlist.analytics.'@infrastructure/observability/analytics'.AnalyticsEventMap` (L19-L21) - Interface
- `src/types/auth-context.ts`
  - `src.types.auth-context.AuthContext` (L10-L29) - Interface

### Seed Image Generation & Search Pagination
The reproducible seed-image generation script that downloads a real photo per catalogue role from Lorem Picsum, runs it through the same digestImage/thumbnailImage pipeline a real upload goes through, and writes byte-identical output to public/images/seed/ — never a hand-placed file, never a hot-linked URL. Also provides the shared pagination/search helpers (normalizePagination, toSearchPattern) that every list/search endpoint uses, and the graceful-shutdown orchestration that sequences adapter teardown in a fixed order with a deadline.

**Related Classes/Methods**:

- `src.infrastructure.runtime.server-lifecycle.registerSignalHandlers`:86-129

**Source Files:**

- `k6/browse.js`
  - `k6.browse.default` (L51-L72) - Function
  - `k6.browse.default.group('catalogue') callback` (L52-L66) - Function
  - `k6.browse.default.group('catalogue') callback.'list answers 200'` (L55-L55) - Method
  - `k6.browse.default.group('catalogue') callback.'list carries items'` (L56-L56) - Method
  - `k6.browse.default.group('catalogue') callback.'detail answers 200'` (L64-L64) - Method
  - `k6.browse.default.group('facets') callback` (L68-L71) - Function
  - `k6.browse.default.group('facets') callback.'facets answer 200'` (L70-L70) - Method
- `scripts/generate-seed-images.ts`
  - `scripts.generate-seed-images.ImageEntry` (L32-L35) - Interface
  - `scripts.generate-seed-images.catch() callback` (L145-L148) - Function
- `src/infrastructure/persistence/search.ts`
  - `src.infrastructure.persistence.search.PaginationResult` (L20-L24) - Interface
  - `src.infrastructure.persistence.search.PaginatedMeta` (L27-L32) - Interface
- `src/infrastructure/runtime/server-lifecycle.ts`
  - `src.infrastructure.runtime.server-lifecycle.registerSignalHandlers` (L86-L129) - Class
  - `src.infrastructure.runtime.server-lifecycle.registerSignalHandlers.onProcessSignal` (L91-L123) - Class
  - `src.infrastructure.runtime.server-lifecycle.registerSignalHandlers.onProcessSignal.forcedExitTimer` (L97-L100) - Class
  - `src.infrastructure.runtime.server-lifecycle.registerSignalHandlers.onProcessSignal.forcedExitTimer.setTimeout() callback` (L97-L100) - Function
  - `src.infrastructure.runtime.server-lifecycle.onProcessSignal.then() callback` (L108-L108) - Function
  - `src.infrastructure.runtime.server-lifecycle.registerSignalHandlers.onProcessSignal.then() callback` (L109-L114) - Function
  - `src.infrastructure.runtime.server-lifecycle.registerSignalHandlers.onProcessSignal.catch() callback` (L115-L122) - Function
  - `src.infrastructure.runtime.server-lifecycle.registerSignalHandlers.process.on('SIGTERM') callback` (L126-L126) - Function
  - `src.infrastructure.runtime.server-lifecycle.registerSignalHandlers.process.on('SIGINT') callback` (L128-L128) - Function

### Migration Catalog & Demo Data Assembly
The ordered, timestamped, reversible migration files (16 files from 20240101000000 to 20260901230000) that own MongoDB schema evolution: index creation/pruning, column renames (stock → onHand), backfills guarded by $exists, soft-delete flags, locale-collection shaping, and orphaned-reference detachment. Each migration is idempotent and lossless by construction. The demo data seeder (db/demo/index.ts) is the RUNNER that walks enabledModules and upserts fixtures; the deterministic assembler (db/demo/assemble.ts) reads every module's rows back through real serializers, validates referential integrity, and renders the byte-stable demo-data.json that is hash-compared against the paired frontend.

**Related Classes/Methods**:

- `db.demo.index.seed.perModule`:62-64

**Source Files:**

- `db/demo/assemble.ts`
  - `db.demo.assemble.reconcileShapes.orphaned` (L148-L148) - Class
  - `db.demo.assemble.reconcileShapes.orphaned.filter() callback` (L148-L148) - Function
  - `db.demo.assemble.reconcileShapes.problems` (L150-L158) - Class
  - `db.demo.assemble.reconcileShapes.problems.unlabelled.map() callback` (L152-L153) - Function
  - `db.demo.assemble.reconcileShapes.problems.orphaned.map() callback` (L156-L156) - Function
- `db/demo/index.ts`
  - `db.demo.index.seed.perModule` (L62-L64) - Class
  - `db.demo.index.seed.perModule.enabledModules.map() callback` (L63-L63) - Function
- `db/migrations/20240101000000-initial-indexes.js`
  - `db.migrations.20240101000000-initial-indexes.<unknown>` (L27-L81) - Class
  - `db.migrations.20240101000000-initial-indexes.<unknown>.up` (L28-L59) - Method
  - `db.migrations.20240101000000-initial-indexes.<unknown>.down` (L61-L80) - Method
- `db/migrations/20260806140000-image-url-separators.js`
  - `db.migrations.20260806140000-image-url-separators.<unknown>` (L84-L129) - Class
  - `db.migrations.20260806140000-image-url-separators.<unknown>.up` (L85-L116) - Method
  - `db.migrations.20260806140000-image-url-separators.<unknown>.down` (L118-L128) - Method
- `db/migrations/20260808200000-users-email-unique.js`
  - `db.migrations.20260808200000-users-email-unique.<unknown>` (L47-L98) - Class
  - `db.migrations.20260808200000-users-email-unique.<unknown>.up` (L48-L79) - Method
  - `db.migrations.20260808200000-users-email-unique.<unknown>.down` (L81-L97) - Method
- `db/migrations/20260813091000-product-stock-column.js`
  - `db.migrations.20260813091000-product-stock-column.<unknown>` (L14-L28) - Class
  - `db.migrations.20260813091000-product-stock-column.<unknown>.up` (L15-L19) - Method
  - `db.migrations.20260813091000-product-stock-column.<unknown>.down` (L21-L27) - Method
- `db/migrations/20260817120000-inventory-counters.js`
  - `db.migrations.20260817120000-inventory-counters.<unknown>` (L30-L89) - Class
  - `db.migrations.20260817120000-inventory-counters.<unknown>.up` (L31-L73) - Method
  - `db.migrations.20260817120000-inventory-counters.<unknown>.up.catch() callback` (L70-L72) - Function
  - `db.migrations.20260817120000-inventory-counters.<unknown>.down` (L75-L88) - Method
- `db/migrations/20260818160000-locale-base-language.js`
  - `db.migrations.20260818160000-locale-base-language.<unknown>` (L21-L45) - Class
  - `db.migrations.20260818160000-locale-base-language.<unknown>.up` (L22-L35) - Method
  - `db.migrations.20260818160000-locale-base-language.<unknown>.down` (L37-L44) - Method
- `db/migrations/20260901120000-hash-user-tokens.js`
  - `db.migrations.20260901120000-hash-user-tokens.<unknown>.up.tokens.user.tokens.map() callback` (L38-L39) - Function
  - `db.migrations.20260901120000-hash-user-tokens.<unknown>.up.tokens` (L38-L40) - Class
- `db/migrations/20260901230000-orders-detach-orphaned-userid.js`
  - `db.migrations.20260901230000-orders-detach-orphaned-userid.<unknown>` (L20-L47) - Class
  - `db.migrations.20260901230000-orders-detach-orphaned-userid.<unknown>.up` (L21-L32) - Method
  - `db.migrations.20260901230000-orders-detach-orphaned-userid.<unknown>.down` (L34-L46) - Method
