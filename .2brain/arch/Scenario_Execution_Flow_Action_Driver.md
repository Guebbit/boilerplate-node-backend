---
tags:
  - 2brain
  - 2brain/arch
  - project/boilerplate-node-backend
type: architecture
component: Scenario_Execution_Flow_Action_Driver
---

```mermaid
graph LR
    Request_Path_Infrastructure_Challenge_Upload_Adapters["Request-Path Infrastructure & Challenge/Upload Adapters"]
    Shop_Module_Fixture_Wave_Orchestration["Shop-Module Fixture & Wave Orchestration"]
    Scenario_Apply_Runner_Flow_Action_Driver["Scenario Apply Runner & Flow-Action Driver"]
    Shop_Module_Fixture_Wave_Orchestration -- "Seeds localized content through the kernel translation primitives" --> Request_Path_Infrastructure_Challenge_Upload_Adapters
    Shop_Module_Fixture_Wave_Orchestration -- "Supplies per-module history-edit callbacks that the flow driver executes over real HTTP" --> Scenario_Apply_Runner_Flow_Action_Driver
    Scenario_Apply_Runner_Flow_Action_Driver -- "Exercises the upload/image, id-path and translation adapters through the real request path" --> Request_Path_Infrastructure_Challenge_Upload_Adapters
```

## Details

The runtime engine that applies a scenario to the live shop. It resolves scenario arguments, drives locale-entry edits through the locale fixture pipeline, manages shop-module entries and their history edits, orchestrates wave entries (staged rollout of scenario steps), and dispatches the concrete flow actions that mutate shop state — submitCard, shipOrder, recordOfflinePayment, hardDeleteProduct. It also carries the rate-limit budget generation and Altcha challenge wiring that the scenario runner needs to exercise the full request path. This is the verb layer: it turns a declarative scenario definition into a sequence of API-level mutations.

### Request-Path Infrastructure & Challenge/Upload Adapters
The production infrastructure the scenario runner deliberately drives so the seed exercises the full request path rather than a shortcut. This group bundles the HTTP/adapter surface the flow actions traverse: the Altcha human-challenge wiring, the image-store and image-signature adapters with ACCEPTED_UPLOAD_MIMETYPES and ImageWritebackFields, the PDF renderer with RenderTimeoutError, the SSRF guard with SafeOutboundTarget, the HTTP controller and id/schema plumbing with collectIdPaths/CarriedId/SchemaNode, plus the object-guard and kernel translation primitives that the seeded data and its translations flow through.

**Related Classes/Methods**:

- `src.infrastructure.adapters.image-signatures.ACCEPTED_UPLOAD_MIMETYPES`:71-73
- `src.infrastructure.http.ids.collectIdPaths`:179-196
- `src.kernel.translation.applyTranslations`:324-343

**Source Files:**

- `src/infrastructure/adapters/antibot-providers/altcha.ts`
  - `src.infrastructure.adapters.antibot-providers.altcha.then() callback` (L115-L120) - Function
- `src/infrastructure/adapters/image-signatures.ts`
  - `src.infrastructure.adapters.image-signatures.ACCEPTED_UPLOAD_MIMETYPES` (L71-L73) - Class
  - `src.infrastructure.adapters.image-signatures.ACCEPTED_UPLOAD_MIMETYPES.SUPPORTED_IMAGE_FORMATS.flatMap() callback` (L72-L72) - Function
- `src/infrastructure/adapters/image-store.ts`
  - `src.infrastructure.adapters.image-store.ImageWritebackFields` (L275-L279) - Interface
- `src/infrastructure/adapters/orphaned-images.ts`
  - `src.infrastructure.adapters.orphaned-images.referencedFilenames.rows` (L39-L46) - Class
  - `src.infrastructure.adapters.orphaned-images.referencedFilenames.rows.collections.map() callback` (L40-L44) - Function
  - `src.infrastructure.adapters.orphaned-images.OrphanSweep` (L57-L62) - Interface
- `src/infrastructure/adapters/pdf.ts`
  - `src.infrastructure.adapters.pdf.RenderTimeoutError` (L68-L73) - Class
  - `src.infrastructure.adapters.pdf.RenderTimeoutError.constructor` (L69-L72) - Constructor
  - `src.infrastructure.adapters.pdf.withDeadline.deadline` (L183-L190) - Class
  - `src.infrastructure.adapters.pdf.withDeadline.deadline.<function>` (L183-L190) - Function
  - `src.infrastructure.adapters.pdf.withDeadline.deadline.<function>.setTimeout() callback` (L184-L189) - Function
  - `src.infrastructure.adapters.pdf.withDeadline.deadline.<function>.setTimeout() callback.catch() callback` (L187-L187) - Function
- `src/infrastructure/adapters/ssrf-guard.ts`
  - `src.infrastructure.adapters.ssrf-guard.SafeOutboundTarget` (L49-L62) - Interface
  - `src.infrastructure.adapters.ssrf-guard.resolveAllAddresses.lookup.then() callback.addresses.results.flatMap() callback` (L167-L168) - Function
  - `src.infrastructure.adapters.ssrf-guard.resolveAllAddresses.lookup.then() callback.addresses` (L167-L169) - Class
- `src/infrastructure/http/controller.ts`
  - `src.infrastructure.http.controller.parseBody.flagged` (L135-L135) - Class
  - `src.infrastructure.http.controller.parseBody.flagged.refusals.map() callback` (L135-L135) - Function
- `src/infrastructure/http/ids.ts`
  - `src.infrastructure.http.ids.SchemaNode` (L122-L137) - Interface
  - `src.infrastructure.http.ids.isIdString` (L166-L171) - Class
  - `src.infrastructure.http.ids.isIdString.some() callback` (L168-L170) - Function
  - `src.infrastructure.http.ids.collectIdPaths` (L179-L196) - Class
  - `src.infrastructure.http.ids.flatMap() callback` (L184-L185) - Function
  - `src.infrastructure.http.ids.collectIdPaths.flatMap() callback` (L194-L194) - Function
  - `src.infrastructure.http.ids.CarriedId` (L216-L219) - Interface
- `src/infrastructure/http/request.ts`
  - `src.infrastructure.http.request.parseFormCsvList` (L74-L82) - Class
  - `src.infrastructure.http.request.parseFormCsvList.entries.every() callback` (L76-L76) - Function
- `src/infrastructure/http/schemas.ts`
  - `src.infrastructure.http.schemas.optionalBooleanSchema` (L121-L124) - Class
  - `src.infrastructure.http.schemas.optionalBooleanSchema.z.preprocess() callback` (L122-L122) - Function
- `src/infrastructure/i18n/catalog.ts`
  - `src.infrastructure.i18n.catalog.localeCandidatesFor` (L40-L43) - Class
  - `src.infrastructure.i18n.catalog.localeCandidatesFor.filter() callback` (L42-L42) - Function
- `src/infrastructure/object-guards.ts`
  - `src.infrastructure.object-guards.stripUndefined` (L29-L32) - Class
  - `src.infrastructure.object-guards.stripUndefined.filter() callback` (L32-L32) - Function
- `src/infrastructure/persistence/factories.ts`
  - `src.infrastructure.persistence.factories.FactoryIdentity` (L16-L23) - Interface
- `src/infrastructure/persistence/versioning.ts`
  - `src.infrastructure.persistence.versioning.Precondition` (L27-L32) - Interface
  - `src.infrastructure.persistence.versioning.DeleteOutcome` (L197-L200) - Interface
  - `src.infrastructure.persistence.versioning.then() callback` (L216-L216) - Function
- `src/kernel/translation.ts`
  - `src.kernel.translation.Translatable` (L305-L307) - Interface
  - `src.kernel.translation.applyTranslations` (L324-L343) - Class
  - `src.kernel.translation.applyTranslations.items.map() callback` (L339-L342) - Function
- `src/modules/account/repository.ts`
  - `src.modules.account.repository.touchSession` (L222-L237) - Class
  - `src.modules.account.repository.touchSession.then() callback` (L237-L237) - Function
  - `src.modules.account.repository.sessionFamilyActivity.then() callback.stamps.rows.flatMap() callback` (L352-L353) - Function
  - `src.modules.account.repository.sessionFamilyActivity.then() callback.stamps` (L352-L354) - Class
  - `src.modules.account.repository.NewVerificationToken` (L458-L465) - Interface
- `src/modules/addresses/factories.ts`
  - `src.modules.addresses.factories.AddressBookOverrides` (L14-L19) - Interface
- `src/modules/addresses/model.ts`
  - `src.modules.addresses.model.AddressItem` (L14-L29) - Interface
  - `src.modules.addresses.model.AddressBookDocument` (L32-L37) - Interface
- `src/modules/addresses/presenter.ts`
  - `src.modules.addresses.presenter.AddressesView` (L12-L14) - Interface
  - `src.modules.addresses.presenter.presentAddressOf.item` (L40-L40) - Class
  - `src.modules.addresses.presenter.presentAddressOf.item.book.items.find() callback` (L40-L40) - Function
- `src/modules/addresses/repository.ts`
  - `src.modules.addresses.repository.addressBookRepository.updateEntry.entry` (L207-L207) - Class
  - `src.modules.addresses.repository.addressBookRepository.updateEntry.entry.book.items.find() callback` (L207-L207) - Function
  - `src.modules.addresses.repository.addressBookRepository.setDefault.entry` (L240-L240) - Class
  - `src.modules.addresses.repository.addressBookRepository.setDefault.entry.book.items.find() callback` (L240-L240) - Function
  - `src.modules.addresses.repository.addressBookRepository.removeEntry.entry` (L256-L256) - Class
  - `src.modules.addresses.repository.addressBookRepository.removeEntry.entry.book.items.find() callback` (L256-L256) - Function
- `src/modules/api-keys/model.ts`
  - `src.modules.api-keys.model.ApiKeyDocument` (L15-L27) - Interface
  - `src.modules.api-keys.model.apiKeySchema.permissions.validate.validator` (L64-L64) - Method
- `src/modules/api-keys/repository.ts`
  - `src.modules.api-keys.repository.revokeMany` (L93-L97) - Class
  - `src.modules.api-keys.repository.revokeMany.then() callback` (L97-L97) - Function
- `src/modules/cart/model.ts`
  - `src.modules.cart.model.CartDocument` (L35-L58) - Interface
- `src/modules/delivery/jobs.ts`
  - `src.modules.delivery.jobs.run.then() callback` (L32-L34) - Function
- `src/modules/delivery/model.ts`
  - `src.modules.delivery.model.ShipmentLineDocument` (L32-L36) - Interface
  - `src.modules.delivery.model.ShipmentDocument` (L78-L93) - Interface
- `src/modules/feedback/model.ts`
  - `src.modules.feedback.model.FeedbackRequestDocument` (L29-L34) - Interface
- `src/modules/inventory/model.ts`
  - `src.modules.inventory.model.StockMovementDocument` (L31-L36) - Interface
  - `src.modules.inventory.model.StockLevelDocument` (L115-L139) - Interface
  - `src.modules.inventory.model.ReservationItem` (L208-L213) - Interface
  - `src.modules.inventory.model.ReservationDocument` (L230-L242) - Interface
- `src/modules/inventory/repository.ts`
  - `src.modules.inventory.repository.PreorderLevelRow` (L112-L122) - Interface
- `src/modules/locales/model.ts`
  - `src.modules.locales.model.LocaleDocument` (L45-L48) - Interface
  - `src.modules.locales.model.LocaleEntryDocument` (L51-L55) - Interface
  - `src.modules.locales.model.TranslationDocument` (L58-L62) - Interface
  - `src.modules.locales.model.translationSchema.fields.default` (L258-L258) - Method
- `src/modules/notifications/model.ts`
  - `src.modules.notifications.model.NotificationParametersByCode` (L37-L43) - Interface
  - `src.modules.notifications.model.NotificationCommon` (L54-L59) - Interface
- `src/modules/notifications/repository.ts`
  - `src.modules.notifications.repository.notificationRepository.trimToNewest.ids` (L119-L119) - Class
  - `src.modules.notifications.repository.notificationRepository.trimToNewest.ids.excess.map() callback` (L119-L119) - Function
- `src/modules/orders/domain/rules.ts`
  - `src.modules.orders.domain.rules.OrderLineCandidate` (L8-L11) - Interface
  - `src.modules.orders.domain.rules.checkOrderLines` (L25-L30) - Class
  - `src.modules.orders.domain.rules.checkOrderLines.lines.some() callback` (L27-L27) - Function
  - `src.modules.orders.domain.rules.ShippableLineCandidate` (L33-L35) - Interface
- `src/modules/orders/domain/shop-time.ts`
  - `src.modules.orders.domain.shop-time.yearInZone.year` (L19-L21) - Class
  - `src.modules.orders.domain.shop-time.yearInZone.year.find() callback` (L21-L21) - Function
- `src/modules/orders/domain/status-traits.ts`
  - `src.modules.orders.domain.status-traits.OrderStatusTraits` (L26-L34) - Interface
- `src/modules/orders/domain/tax.ts`
  - `src.modules.orders.domain.tax.orderTaxBreakdown.rates` (L237-L237) - Class
  - `src.modules.orders.domain.tax.orderTaxBreakdown.rates.items.map() callback` (L237-L237) - Function
- `src/modules/orders/domain/timeline.ts`
  - `src.modules.orders.domain.timeline.TimelineEntryInput` (L68-L79) - Interface
- `src/modules/orders/domain/withdrawal.ts`
  - `src.modules.orders.domain.withdrawal.DispatchCandidate` (L20-L24) - Interface
- `src/modules/orders/emails.ts`
  - `src.modules.orders.emails.withdrawalCase` (L88-L92) - Class
- `src/modules/orders/repository.ts`
  - `src.modules.orders.repository.setProjection.changes` (L365-L369) - Class
  - `src.modules.orders.repository.setProjection.changes.filter() callback` (L367-L367) - Function
  - `src.modules.orders.repository.setProjection.changes.map() callback` (L368-L368) - Function
  - `src.modules.orders.repository.incrementOrderNumberCounter` (L681-L691) - Class
  - `src.modules.orders.repository.incrementOrderNumberCounter.then() callback` (L691-L691) - Function
- `src/modules/orders/services/cancel.ts`
  - `src.modules.orders.services.cancel.announceInTransaction() callback.order.withTimeline() callback` (L90-L98) - Function
  - `src.modules.orders.services.cancel.clearRefundOwed` (L308-L309) - Class
  - `src.modules.orders.services.cancel.clearRefundOwed.then() callback` (L309-L309) - Function
- `src/modules/orders/services/crud.ts`
  - `src.modules.orders.services.crud.create.details.lines.outcome.shortfalls.map() callback` (L173-L174) - Function
- `src/modules/orders/services/current.ts`
  - `src.modules.orders.services.current.OrderLineShape` (L17-L20) - Interface
  - `src.modules.orders.services.current.resolveCurrentImages.then() callback.byId` (L54-L54) - Class
  - `src.modules.orders.services.current.resolveCurrentImages.then() callback.byId.products.map() callback` (L54-L54) - Function
- `src/modules/orders/services/export.ts`
  - `src.modules.orders.services.export.OrderExport` (L53-L58) - Interface
- `src/modules/orders/services/fulfillment.ts`
  - `src.modules.orders.services.fulfillment.ForcedFulfilment` (L47-L56) - Interface
- `src/modules/orders/services/override.ts`
  - `src.modules.orders.services.override.write.withTimeline() callback` (L89-L90) - Function
- `src/modules/orders/services/place.ts`
  - `src.modules.orders.services.place.placeOrder.verdict` (L122-L124) - Class
  - `src.modules.orders.services.place.placeOrder.verdict.input.lines.map() callback` (L123-L123) - Function
  - `src.modules.orders.services.place.placeOrder.orderItems` (L127-L132) - Class
  - `src.modules.orders.services.place.placeOrder.orderItems.input.lines.map() callback` (L131-L131) - Function
  - `src.modules.orders.services.place.placeOrder.outcome` (L148-L157) - Class
  - `src.modules.orders.services.place.placeOrder.outcome.input.lines.map() callback` (L151-L155) - Function
  - `src.modules.orders.services.place.order` (L203-L223) - Class
  - `src.modules.orders.services.place.order.announceInTransaction() callback` (L204-L221) - Function
  - `src.modules.orders.services.place.order.announceInTransaction() callback.then() callback` (L208-L211) - Function
  - `src.modules.orders.services.place.order.announceInTransaction() callback.then() callback.then() callback` (L210-L210) - Function
- `src/modules/orders/services/read.ts`
  - `src.modules.orders.services.read.OrderBrief` (L86-L94) - Interface
  - `src.modules.orders.services.read.findOwedRefunds` (L213-L223) - Class
  - `src.modules.orders.services.read.findOwedRefunds.then() callback` (L219-L222) - Function
  - `src.modules.orders.services.read.findOwedRefunds.then() callback.orders.filter() callback` (L221-L221) - Function
  - `src.modules.orders.services.read.findOwedRefunds.then() callback.map() callback` (L222-L222) - Function
- `src/modules/orders/services/scope.ts`
  - `src.modules.orders.services.scope.withoutCancelOnceShipped.transitions.actions.transitions.filter() callback` (L232-L232) - Function
- `src/modules/orders/services/snapshot.ts`
  - `src.modules.orders.services.snapshot.resolveSnapshotProducts` (L37-L52) - Class
  - `src.modules.orders.services.snapshot.resolveSnapshotProducts.runWithLocale() callback` (L41-L51) - Function
  - `src.modules.orders.services.snapshot.resolveSnapshotProducts.runWithLocale() callback.products.map() callback` (L44-L44) - Function
  - `src.modules.orders.services.snapshot.resolveSnapshotProducts.runWithLocale() callback.then() callback` (L46-L50) - Function
  - `src.modules.orders.services.snapshot.resolveSnapshotProducts.runWithLocale() callback.then() callback.products.map() callback` (L47-L50) - Function
  - `src.modules.orders.services.snapshot.freezeOrderLines` (L65-L99) - Class
  - `src.modules.orders.services.snapshot.freezeOrderLines.then() callback` (L70-L98) - Function
  - `src.modules.orders.services.snapshot.freezeOrderLines.then() callback.resolvedProducts.map() callback` (L71-L98) - Function
- `src/modules/orders/services/stats.ts`
  - `src.modules.orders.services.stats.PaidBucket` (L39-L44) - Interface
  - `src.modules.orders.services.stats.ProductTotal` (L76-L82) - Interface
  - `src.modules.orders.services.stats.CategoryTotal` (L121-L126) - Interface
  - `src.modules.orders.services.stats.ProductSeriesRead` (L162-L165) - Interface
  - `src.modules.orders.services.stats.customerCounts` (L199-L226) - Class
  - `src.modules.orders.services.stats.customerCounts.then() callback` (L223-L226) - Function
  - `src.modules.orders.services.stats.cancellationCohort` (L233-L251) - Class
  - `src.modules.orders.services.stats.cancellationCohort.then() callback` (L248-L251) - Function
  - `src.modules.orders.services.stats.AwaitingTransfers` (L254-L259) - Interface
  - `src.modules.orders.services.stats.PipelineRead` (L262-L265) - Interface
- `src/modules/products/model.ts`
  - `src.modules.products.model.ProductRecord` (L31-L51) - Interface
  - `src.modules.products.model.ProductDocument` (L67-L77) - Interface
  - `src.modules.products.model.checkProductTranslationFields` (L107-L118) - Class
  - `src.modules.products.model.checkProductTranslationFields.parsed.error.issues.map() callback` (L113-L117) - Function
- `src/modules/products/services/lookups.ts`
  - `src.modules.products.services.lookups.titlesOf` (L124-L129) - Class
  - `src.modules.products.services.lookups.titlesOf.then() callback` (L125-L128) - Function
  - `src.modules.products.services.lookups.titlesById` (L137-L138) - Class
  - `src.modules.products.services.lookups.titlesById.then() callback` (L138-L138) - Function
- `src/modules/products/services/read.ts`
  - `src.modules.products.services.read.getById` (L39-L53) - Class
  - `src.modules.products.services.read.getById.then() callback` (L46-L52) - Function
  - `src.modules.products.services.read.getById.then() callback.then() callback` (L50-L50) - Function
  - `src.modules.products.services.read.getByIdForCaller` (L63-L70) - Class
  - `src.modules.products.services.read.getByIdForCaller.then() callback` (L68-L69) - Function
  - `src.modules.products.services.read.getAdmin` (L82-L92) - Class
  - `src.modules.products.services.read.getAdmin.then() callback` (L83-L92) - Function
  - `src.modules.products.services.read.getAdmin.then() callback.then() callback` (L86-L90) - Function
- `src/modules/products/services/search.ts`
  - `src.modules.products.services.search.search` (L35-L57) - Class
  - `src.modules.products.services.search.search.resultPromise.then() callback` (L54-L55) - Function
  - `src.modules.products.services.search.search.resultPromise.then() callback.then() callback` (L55-L55) - Function
  - `src.modules.products.services.search.searchForCaller` (L101-L112) - Class
  - `src.modules.products.services.search.searchForCaller.then() callback` (L106-L112) - Function
  - `src.modules.products.services.search.searchForCaller.then() callback.items.result.items.map() callback` (L110-L110) - Function
- `src/modules/products/services/translated-write.ts`
  - `src.modules.products.services.translated-write.clearOmittedLocales` (L209-L224) - Class
  - `src.modules.products.services.translated-write.clearOmittedLocales.then() callback` (L213-L224) - Function
  - `src.modules.products.services.translated-write.clearOmittedLocales.then() callback.translations.map() callback` (L216-L219) - Function
- `src/modules/returns/emails.ts`
  - `src.modules.returns.emails.ReturnNoticeInput` (L26-L42) - Interface
- `src/modules/returns/model.ts`
  - `src.modules.returns.model.ReturnLine` (L21-L30) - Interface
  - `src.modules.returns.model.ReturnDocument` (L33-L73) - Interface
  - `src.modules.returns.model.ReturnOrderLockDocument` (L160-L163) - Interface
- `src/modules/users/model.ts`
  - `src.modules.users.model.UserRecord` (L25-L152) - Interface
  - `src.modules.users.model.UserDocument` (L241-L251) - Interface
- `src/modules/users/presenter.ts`
  - `src.modules.users.presenter.presentUsersWithCurrentRoles.ids` (L124-L124) - Class
  - `src.modules.users.presenter.presentUsersWithCurrentRoles.ids.rows.map() callback` (L124-L124) - Function
- `src/modules/users/two-factor-write.ts`
  - `src.modules.users.two-factor-write.TwoFactorWrite` (L49-L64) - Interface
  - `src.modules.users.two-factor-write.changed` (L203-L205) - Class
- `src/modules/wishlist/factories.ts`
  - `src.modules.wishlist.factories.WishlistOverrides` (L14-L22) - Interface
- `src/modules/wishlist/model.ts`
  - `src.modules.wishlist.model.WishlistItem` (L22-L24) - Interface
  - `src.modules.wishlist.model.WishlistDocument` (L32-L37) - Interface

### Shop-Module Fixture & Wave Orchestration
The declarative fixture layer that defines what the scenario seeds and in what order. shop-modules.ts is the per-module fixture table (ShopModuleEntry with seed, after, baseline, driveHistoryEdit) and reshapes it into wave entries via asWaveEntries, historyEdits, and baselineShopModules. waves.ts provides the generic dependency-wave scheduler (waveOrder, runInWaves) that runs independent fixtures concurrently within a wave and sequentially across waves, tolerating dangling after names. locales.ts builds the locale-entry fixtures and the driveLocaleEntryEdit history step; products-filler.ts supplies filler image role keys; permissions.ts/translation.ts carry the kernel permission and translation primitives the fixtures depend on.

**Related Classes/Methods**:

- `scenarios.shop-modules.ShopModuleEntry`:22-44
- `scenarios.shop-modules.historyEdits`:90-97
- `scenarios.locales.localeEntryFixtures`:209-217
- `scenarios.products-filler.FILLER_IMAGE_ROLE_KEYS`:21-24

**Source Files:**

- `scenarios/locales.ts`
  - `scenarios.locales.localeEntryFixtures.LOCALE_ENTRIES.map() callback` (L209-L216) - Function
  - `scenarios.locales.localeEntryFixtures` (L209-L217) - Class
- `scenarios/products-filler.ts`
  - `scenarios.products-filler.FILLER_IMAGE_ROLE_KEYS` (L21-L24) - Class
  - `scenarios.products-filler.FILLER_IMAGE_ROLE_KEYS.Array.from() callback` (L23-L23) - Function
- `scenarios/shop-modules.ts`
  - `scenarios.shop-modules.ShopModuleEntry` (L22-L44) - Interface
  - `scenarios.shop-modules.historyEdits` (L90-L97) - Class
  - `scenarios.shop-modules.historyEdits.flatMap() callback` (L94-L95) - Function
- `scenarios/waves.ts`
  - `scenarios.waves.WaveEntry` (L11-L15) - Interface
  - `scenarios.waves.waveOrder.ready.filter() callback` (L33-L34) - Function
  - `scenarios.waves.waveOrder.ready` (L33-L35) - Class
  - `scenarios.waves.waveOrder.ready.filter() callback.every() callback` (L34-L34) - Function
- `src/kernel/permissions.ts`
  - `src.kernel.permissions.PermissionKey` (L74-L117) - Interface
  - `src.kernel.permissions.PresetRole` (L134-L156) - Interface
  - `src.kernel.permissions.PERMISSION_SUBJECTS` (L259-L261) - Class
  - `src.kernel.permissions.PERMISSION_SUBJECTS.PERMISSION_KEYS.map() callback` (L260-L260) - Function
  - `src.kernel.permissions.signupDefaultRole` (L274-L285) - Class
  - `src.kernel.permissions.signupDefaultRole.<function>` (L274-L285) - Function
  - `src.kernel.permissions.signupDefaultRole.<function>.matches` (L275-L275) - Class
  - `src.kernel.permissions.signupDefaultRole.<function>.matches.PRESET_ROLES.filter() callback` (L275-L275) - Function
  - `src.kernel.permissions.byKey` (L307-L307) - Class
  - `src.kernel.permissions.byKey.PERMISSION_KEYS.map() callback` (L307-L307) - Function
  - `src.kernel.permissions.byRoleName` (L317-L319) - Class
  - `src.kernel.permissions.byRoleName.map() callback` (L318-L318) - Function
  - `src.kernel.permissions.declaredKeysOfScope` (L573-L580) - Class
  - `src.kernel.permissions.declaredKeysOfScope.AUTHORIZATION_SCOPES.map() callback` (L574-L579) - Function
  - `src.kernel.permissions.declaredKeysOfScope.AUTHORIZATION_SCOPES.map() callback.PERMISSION_KEYS.filter() callback` (L576-L576) - Function
  - `src.kernel.permissions.declaredKeysOfScope.AUTHORIZATION_SCOPES.map() callback.map() callback` (L577-L577) - Function
- `src/kernel/translation.ts`
  - `src.kernel.translation.applyTranslations.resolved` (L331-L335) - Class
  - `src.kernel.translation.applyTranslations.resolved.items.map() callback` (L333-L333) - Function

### Scenario Apply Runner & Flow-Action Driver
The heart of the subsystem — the verb layer that resolves the scenario argument, boots the app in-process, and drives the concrete flow actions that mutate shop state. apply.ts is the runner (gates, connection, one call into buildScenario, --reset/--describe-to handling, and the scripted rate-limit budget install). flows/actions.ts holds the API-level mutation verbs — submitCard, recordOfflinePayment, shipOrder, hardDeleteProduct, plus checkout, openPayment, syncPayment, startProcessing, deliverOrder, cancelOrder, requestReturn — each a thin, contract-faithful call through the real middleware stack. generate-rate-limit-budgets.ts produces the rate-limit budget the runner needs to exercise the full request path without 429s.

**Related Classes/Methods**:

- `scenarios.apply.scenarioArgument`
- `scenarios.flows.actions.submitCard`:142-157
- `scenarios.flows.actions.recordOfflinePayment`:189-194
- `scenarios.flows.actions.shipOrder`:239-247
- `scenarios.flows.actions.hardDeleteProduct`:391-392

**Source Files:**

- `scenarios/apply.ts`
  - `scenarios.apply.scenarioArgument` (L100-L100) - Class
  - `scenarios.apply.scenarioArgument.find() callback` (L100-L100) - Function
- `scenarios/flows/actions.ts`
  - `scenarios.flows.actions.submitCard` (L142-L157) - Class
  - `scenarios.flows.actions.submitCard.then() callback` (L149-L157) - Function
  - `scenarios.flows.actions.recordOfflinePayment` (L189-L194) - Class
  - `scenarios.flows.actions.recordOfflinePayment.then() callback` (L194-L194) - Function
  - `scenarios.flows.actions.shipOrder` (L239-L247) - Class
  - `scenarios.flows.actions.shipOrder.then() callback` (L240-L246) - Function
  - `scenarios.flows.actions.holdOrder` (L278-L286) - Class
  - `scenarios.flows.actions.holdOrder.then() callback` (L279-L285) - Function
  - `scenarios.flows.actions.holdOrder.then() callback.then() callback` (L285-L285) - Function
  - `scenarios.flows.actions.hardDeleteProduct` (L391-L392) - Class
  - `scenarios.flows.actions.hardDeleteProduct.then() callback` (L392-L392) - Function
- `scripts/audit/code-shape/scripts/shallow-candidates.ts`
  - `scripts.audit.code-shape.scripts.shallow-candidates.NamedFunction` (L101-L106) - Interface
  - `scripts.audit.code-shape.scripts.shallow-candidates.findShallowCandidates.passThroughs.functions.filter() callback` (L483-L483) - Function
  - `scripts.audit.code-shape.scripts.shallow-candidates.findShallowCandidates.lazyFiles.files.filter() callback` (L489-L492) - Function
- `scripts/docs/generate-rate-limit-budgets.ts`
  - `scripts.docs.generate-rate-limit-budgets.rows` (L33-L38) - Class
  - `scripts.docs.generate-rate-limit-budgets.rows.enabledModules.flatMap() callback` (L34-L35) - Function
  - `scripts.docs.generate-rate-limit-budgets.rows.enabledModules.flatMap() callback.map() callback` (L35-L35) - Function
  - `scripts.docs.generate-rate-limit-budgets.rows.INFRASTRUCTURE_RATE_LIMITS.map() callback` (L37-L37) - Function
- `scripts/docs/jobs-render.ts`
  - `scripts.docs.jobs-render.withJobScripts` (L104-L115) - Class
  - `scripts.docs.jobs-render.withJobScripts.kept` (L107-L107) - Class
  - `scripts.docs.jobs-render.withJobScripts.kept.lines.filter() callback` (L107-L107) - Function
  - `scripts.docs.jobs-render.withJobScripts.jobs.map() callback` (L112-L112) - Function
- `scripts/scaffold/demo-remove-alert-rules.ts`
  - `scripts.scaffold.demo-remove-alert-rules.stripRules.nonEmpty` (L109-L111) - Class
  - `scripts.scaffold.demo-remove-alert-rules.stripRules.nonEmpty.kept.filter() callback` (L110-L110) - Function
- `scripts/scaffold/demo-remove-registry.ts`
  - `scripts.scaffold.demo-remove-registry.removeModuleFolders` (L25-L29) - Class
  - `scripts.scaffold.demo-remove-registry.removeModuleFolders.names.map() callback` (L26-L29) - Function
- `scripts/scaffold/demo-remove-scenarios.ts`
  - `scripts.scaffold.demo-remove-scenarios.replaceOnce` (L24-L31) - Class
  - `scripts.scaffold.demo-remove-scenarios.replaceOnce.content.replace() callback` (L30-L30) - Function
- `scripts/scaffold/demo-remove-tests.ts`
  - `scripts.scaffold.demo-remove-tests.requiredModules` (L59-L62) - Class
  - `scripts.scaffold.demo-remove-tests.requiredModules.flatMap() callback` (L60-L61) - Function
  - `scripts.scaffold.demo-remove-tests.requiredModules.flatMap() callback.map() callback` (L61-L61) - Function
  - `scripts.scaffold.demo-remove-tests.removeResidueTests` (L109-L142) - Class
  - `scripts.scaffold.demo-remove-tests.removeResidueTests.requiresGone` (L129-L129) - Class
  - `scripts.scaffold.demo-remove-tests.removeResidueTests.requiresGone.some() callback` (L129-L129) - Function
  - `scripts.scaffold.demo-remove-tests.removeResidueTests.deleted.map() callback` (L138-L141) - Function
- `scripts/scaffold/demo-remove-validation-labels.ts`
  - `scripts.scaffold.demo-remove-validation-labels.stripValidationLabels` (L143-L169) - Class
  - `scripts.scaffold.demo-remove-validation-labels.stripValidationLabels.filter() callback` (L150-L150) - Function
  - `scripts.scaffold.demo-remove-validation-labels.stripValidationLabels.flatMap() callback` (L151-L168) - Function
- `src/kernel/access/query.ts`
  - `src.kernel.access.query.coerce` (L43-L50) - Class
  - `src.kernel.access.query.coerce.userId` (L49-L49) - Method
- `src/kernel/registry.ts`
  - `src.kernel.registry.ImageTarget` (L31-L49) - Interface
  - `src.kernel.registry.TranslatableTarget` (L93-L159) - Interface
  - `src.kernel.registry.TranslationFieldIssue` (L162-L167) - Interface
  - `src.kernel.registry.PublicEventProjection` (L175-L181) - Interface
  - `src.kernel.registry.PersonalDataSubject` (L236-L246) - Interface
  - `src.kernel.registry.resolvePersonalDataErasers` (L673-L680) - Class
  - `src.kernel.registry.resolvePersonalDataErasers.appModules.flatMap() callback` (L676-L679) - Function
  - `src.kernel.registry.resolvePersonalDataErasers.appModules.flatMap() callback.appModule.personalData.flatMap() callback` (L679-L679) - Function
  - `src.kernel.registry.resolvePersonalDataMinimisers` (L689-L698) - Class
  - `src.kernel.registry.resolvePersonalDataMinimisers.appModules.flatMap() callback` (L692-L697) - Function
  - `src.kernel.registry.resolvePersonalDataMinimisers.appModules.flatMap() callback.appModule.personalData.flatMap() callback` (L695-L696) - Function
  - `src.kernel.registry.resolveJobs` (L705-L706) - Class
  - `src.kernel.registry.resolveJobs.appModules.flatMap() callback` (L706-L706) - Function
  - `src.kernel.registry.resolveRateLimits` (L718-L719) - Class
  - `src.kernel.registry.resolveRateLimits.appModules.flatMap() callback` (L719-L719) - Function
- `src/kernel/translation.ts`
  - `src.kernel.translation.planTranslations.otherLocale` (L244-L244) - Class
  - `src.kernel.translation.planTranslations.otherLocale.find() callback` (L244-L244) - Function
