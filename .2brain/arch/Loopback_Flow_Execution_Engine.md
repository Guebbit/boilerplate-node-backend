---
tags:
  - 2brain
  - 2brain/arch
  - project/boilerplate-node-backend
type: architecture
component: Loopback_Flow_Execution_Engine
---

```mermaid
graph LR
    Loopback_HTTP_Execution_Core["Loopback HTTP Execution Core"]
    Order_Trail_Backdating_Engine["Order-Trail Backdating Engine"]
    Demo_Boot_App_Extension_Surface["Demo Boot & App-Extension Surface"]
    Loopback_HTTP_Execution_Core -- "Ages flow-produced orders after HTTP execution completes" --> Order_Trail_Backdating_Engine
    Loopback_HTTP_Execution_Core -- "Consumes Express app instance and locales repository write path" --> Demo_Boot_App_Extension_Surface
    Order_Trail_Backdating_Engine -- "calls" --> Loopback_HTTP_Execution_Core
    Demo_Boot_App_Extension_Surface -- "calls" --> Order_Trail_Backdating_Engine
```

## Details

The core engine room that makes the flow runner work. It provides three tightly-coupled capabilities: (1) the ephemeral loopback listener (withLoopbackServer) that binds the Express app to 127.0.0.1:0 for the duration of one seed, (2) the HTTP client (readAttempt, send) that issues fetch calls against that listener and unwraps the API's { data, errors } envelope, and (3) the backdate mechanism (mover, shiftStage, TRAILS) that rewrites the date columns on six unrelated collections (orders, payments, shipments, reservations, stock movements, audit logs) per-order using MongoDB aggregation-pipeline $dateSubtract. Supporting infrastructure includes the ephemeral MongoDB, product seeding with translations, seed-image generation, and the AppExtension hook in src/app.ts that exposes the Express app to the scenario layer.

### Loopback HTTP Execution Core
The engine room that makes the flow runner work. It owns the ephemeral loopback listener (withLoopbackServer) that binds the Express app to 127.0.0.1:0 for the duration of one seed, the HTTP client (readAttempt, send, signIn) that issues fetch calls against that listener and unwraps the API's { data, errors } envelope into a typed Attempt, and the product seeding pass (seedProductsCollection, writeSeedTranslations) that populates the shop through the app's own planTranslations/writeTranslations primitives. Supporting infrastructure in this group includes the ephemeral in-process MongoDB (ephemeral-mongod.ts), seed-image generation (generate-seed-images.ts), and the route/security/outbox install hooks the listener serves. This is the primary flow-representation component: it is where a request enters the app over real HTTP and where the seeded dataset is produced.

**Related Classes/Methods**:

- `scenarios.flows.client.readAttempt`:75-92
- `scenarios.products.writeSeedTranslations`:473-488

**Source Files:**

- `scenarios/flows/client.ts`
  - `scenarios.flows.client.readAttempt` (L75-L92) - Class
  - `scenarios.flows.client.readAttempt.then() callback.errorMessages.map() callback` (L83-L83) - Function
  - `scenarios.flows.client.readAttempt.then() callback` (L86-L91) - Function
- `scenarios/flows/loopback.ts`
  - `scenarios.flows.loopback.withLoopbackServer.<function>.server` (L30-L37) - Class
  - `scenarios.flows.loopback.withLoopbackServer.<function>.server.app.listen('127.0.0.1') callback` (L30-L37) - Function
  - `scenarios.flows.loopback.withLoopbackServer.<function>.server.app.listen('127.0.0.1') callback.close` (L35-L35) - Method
  - `scenarios.flows.loopback.withLoopbackServer.<function>.server.app.listen('127.0.0.1') callback.close.<function>` (L35-L35) - Function
  - `scenarios.flows.loopback.withLoopbackServer.<function>.server.app.listen('127.0.0.1') callback.close.<function>.server.close() callback` (L35-L35) - Function
- `scenarios/products.ts`
  - `scenarios.products.ProductCopy` (L51-L54) - Interface
  - `scenarios.products.writeSeedTranslations` (L473-L488) - Class
  - `scenarios.products.writeSeedTranslations.then() callback` (L479-L487) - Function
  - `scenarios.products.writeSeedTranslations.then() callback.then() callback` (L486-L486) - Function
- `scenarios/support/doubles/webhook-sink.ts`
  - `scenarios.support.doubles.webhook-sink.trustSinkCertificateAuthority` (L28-L37) - Class
  - `scenarios.support.doubles.webhook-sink.trustSinkCertificateAuthority.defaults.some() callback` (L33-L33) - Function
- `scenarios/support/ephemeral-mongod.ts`
  - `scenarios.support.ephemeral-mongod.startInProcessMongod.timeout` (L51-L63) - Class
  - `scenarios.support.ephemeral-mongod.startInProcessMongod.timeout.<function>` (L51-L63) - Function
  - `scenarios.support.ephemeral-mongod.startInProcessMongod.timeout.<function>.setTimeout() callback` (L53-L60) - Function
- `scenarios/tools/generate-seed-images.ts`
  - `scenarios.tools.generate-seed-images.ImageEntry` (L36-L39) - Interface
  - `scenarios.tools.generate-seed-images.main` (L149-L174) - Class
  - `scenarios.tools.generate-seed-images.written.map() callback` (L160-L160) - Function
  - `scenarios.tools.generate-seed-images.main.written.map() callback` (L164-L164) - Function
  - `scenarios.tools.generate-seed-images.catch() callback` (L177-L180) - Function
- `src/app/routes.ts`
  - `src.app.routes.installRoutes` (L24-L64) - Class
  - `src.app.routes.app.use() callback` (L36-L39) - Function
  - `src.app.routes.installRoutes.app.use() callback` (L61-L63) - Function
- `src/app/security.ts`
  - `src.app.security.installSecurity` (L97-L192) - Class
  - `src.app.security.installSecurity.app.use() callback` (L129-L132) - Function
- `src/kernel/outbox.ts`
  - `src.kernel.outbox.enqueueOutboxEvent` (L143-L153) - Class
  - `src.kernel.outbox.enqueueOutboxEvent.then() callback` (L153-L153) - Function
- `src/kernel/registry.ts`
  - `src.kernel.registry.resolvePersonalDataSections` (L656-L661) - Class
  - `src.kernel.registry.resolvePersonalDataSections.appModules.flatMap() callback` (L659-L660) - Function
- `src/modules/products/services/crud.ts`
  - `src.modules.products.services.crud.insertProduct` (L115-L142) - Class
  - `src.modules.products.services.crud.insertProduct.then() callback` (L135-L141) - Function
  - `src.modules.products.services.crud.insertProduct.then() callback.then() callback` (L141-L141) - Function
  - `src.modules.products.services.crud.create` (L185-L188) - Class
  - `src.modules.products.services.crud.create.withTransaction() callback` (L186-L186) - Function
  - `src.modules.products.services.crud.create.then() callback` (L186-L187) - Function
  - `src.modules.products.services.crud.ProductUpdateOutcome` (L191-L196) - Interface
  - `src.modules.products.services.crud.applyUpdate` (L230-L287) - Class
  - `src.modules.products.services.crud.applyUpdate.then() callback.then() callback` (L283-L283) - Function
  - `src.modules.products.services.crud.applyUpdate.then() callback` (L286-L286) - Function
  - `src.modules.products.services.crud.update` (L316-L320) - Class
  - `src.modules.products.services.crud.update.withTransaction() callback` (L320-L320) - Function
  - `src.modules.products.services.crud.updateByIdInTransaction` (L330-L346) - Class
  - `src.modules.products.services.crud.updateByIdInTransaction.then() callback` (L339-L345) - Function
- `src/modules/products/services/translated-write.ts`
  - `src.modules.products.services.translated-write.toUpsertTranslationsRequest` (L38-L55) - Class
  - `src.modules.products.services.translated-write.toUpsertTranslationsRequest.map() callback` (L42-L54) - Function
  - `src.modules.products.services.translated-write.writeCreate.product.withTransaction() callback` (L112-L131) - Function
  - `src.modules.products.services.translated-write.writeCreate.product` (L112-L132) - Class
  - `src.modules.products.services.translated-write.writeCreate.product.withTransaction() callback.then() callback` (L123-L130) - Function
  - `src.modules.products.services.translated-write.writeCreate.product.withTransaction() callback.then() callback.then() callback` (L130-L130) - Function
  - `src.modules.products.services.translated-write.writeUpdate.result.withTransaction() callback` (L175-L190) - Function
  - `src.modules.products.services.translated-write.writeUpdate.result` (L175-L191) - Class
  - `src.modules.products.services.translated-write.writeUpdate.result.withTransaction() callback.then() callback` (L180-L189) - Function
  - `src.modules.products.services.translated-write.writeUpdate.result.withTransaction() callback.then() callback.then() callback` (L188-L188) - Function
- `src/modules/products/services/validation.ts`
  - `src.modules.products.services.validation.sanitizeStringArray` (L7-L10) - Class
  - `src.modules.products.services.validation.sanitizeStringArray.values.map() callback` (L9-L9) - Function
- `src/modules/returns/services/cancel-remainder.ts`
  - `src.modules.returns.services.cancel-remainder.cancelUnderLock` (L121-L162) - Class
  - `src.modules.returns.services.cancel-remainder.cancelUnderLock.withTransaction() callback` (L127-L162) - Function
  - `src.modules.returns.services.cancel-remainder.cancelUnderLock.withTransaction() callback.cancelled.lines.map() callback` (L141-L141) - Function
  - `src.modules.returns.services.cancel-remainder.cancelRemainderUnanswered` (L336-L356) - Class
  - `src.modules.returns.services.cancel-remainder.cancelRemainderUnanswered.then() callback` (L351-L354) - Function
  - `src.modules.returns.services.cancel-remainder.cancelRemainderUnanswered.then() callback.then() callback` (L354-L354) - Function
- `src/modules/returns/services/options.ts`
  - `src.modules.returns.services.options.then() callback.then() callback.returnable` (L87-L87) - Class
- `src/modules/returns/services/receive.ts`
  - `src.modules.returns.services.receive.claimAndRestock.then() callback` (L174-L177) - Function

### Order-Trail Backdating Engine
The mechanism that ages a flow-produced order and everything the application wrote because of it. Because the flows run at boot, without this every order in the demo shop is dated the minute the container started — no analytics trend, no 'last 30 days' filter with anything outside it. This sub-component rewrites the date columns on six unrelated collections (orders, payments, shipments, reservations, stock movements, audit logs) per order using MongoDB aggregation-pipeline $dateSubtract, keeping the order, its payment, its shipment, its hold, its stock movements, and its audit rows mutually consistent about when any of it happened. It is a distinct architectural role from the HTTP execution core: it operates directly on the persistence layer (Mongoose models) rather than over HTTP, and it is the only component in the subsystem that mutates seeded history after the fact.

**Related Classes/Methods**:

- `scenarios.flows.backdate.mover`:36-53
- `scenarios.flows.backdate.shiftStage`:99-110
- `scenarios.flows.backdate.TRAILS`:65-89

**Source Files:**

- `scenarios/flows/backdate.ts`
  - `scenarios.flows.backdate.mover` (L36-L53) - Class
  - `scenarios.flows.backdate.mover.<function>` (L38-L53) - Function
  - `scenarios.flows.backdate.TRAILS` (L65-L89) - Class
  - `scenarios.flows.backdate.TRAILS.mover() callback` (L88-L88) - Function
  - `scenarios.flows.backdate.shiftStage` (L99-L110) - Class
  - `scenarios.flows.backdate.shiftStage.dates.map() callback` (L101-L109) - Function
- `src/app/config.ts`
  - `src.app.config.APP_CONFIG_SLICES` (L101-L136) - Class
  - `src.app.config.APP_CONFIG_SLICES.map() callback` (L136-L136) - Function
- `src/app/security-txt.ts`
  - `src.app.security-txt.SecurityTxtSettings` (L13-L22) - Interface
  - `src.app.security-txt.buildSecurityTxt` (L47-L73) - Class
  - `src.app.security-txt.buildSecurityTxt.filter() callback` (L70-L70) - Function
- `src/app/security.ts`
  - `src.app.security.RAW_BODY_PATHS.enabledModules.flatMap() callback` (L40-L41) - Function
  - `src.app.security.RAW_BODY_PATHS` (L40-L42) - Class
  - `src.app.security.RAW_BODY_PATHS.enabledModules.flatMap() callback.map() callback` (L41-L41) - Function
- `src/app/system-routes.ts`
  - `src.app.system-routes.router.get('/livez') callback` (L31-L33) - Function
  - `src.app.system-routes.router.get('/.well-known/security.txt') callback` (L50-L58) - Function
- `src/app/telemetry.ts`
  - `src.app.telemetry.installTelemetry` (L22-L44) - Class
  - `src.app.telemetry.installTelemetry.app.use() callback` (L26-L43) - Function
  - `src.app.telemetry.installTelemetry.app.use() callback.response.once('finish') callback` (L32-L41) - Function
- `src/kernel/outbox.ts`
  - `src.kernel.outbox.nudgeOutbox` (L337-L347) - Class
- `src/modules/inventory/services/allocate.ts`
  - `src.modules.inventory.services.allocate.Allocation` (L24-L29) - Interface
  - `src.modules.inventory.services.allocate.waiting` (L80-L82) - Class
  - `src.modules.inventory.services.allocate.allocateProduct.waiting.hold.items.filter() callback` (L81-L81) - Function
  - `src.modules.inventory.services.allocate.allocateProduct.waiting.reduce() callback` (L82-L82) - Function
- `src/modules/inventory/services/holds.ts`
  - `src.modules.inventory.services.holds.commitWithin.preorderProducts` (L103-L105) - Class
  - `src.modules.inventory.services.holds.commitWithin.preorderProducts.hold.items.filter() callback` (L104-L104) - Function
  - `src.modules.inventory.services.holds.commitWithin.preorderProducts.map() callback` (L105-L105) - Function
  - `src.modules.inventory.services.holds.commitForOrder` (L141-L151) - Class
  - `src.modules.inventory.services.holds.commitForOrder.withTransaction() callback` (L144-L144) - Function
  - `src.modules.inventory.services.holds.commitForOrder.then() callback` (L145-L149) - Function
  - `src.modules.inventory.services.holds.commitForOrder.then() callback.then() callback` (L148-L148) - Function
- `src/modules/inventory/services/levels.ts`
  - `src.modules.inventory.services.levels.listPreorders.products` (L115-L115) - Class
  - `src.modules.inventory.services.levels.listPreorders.products.items.map() callback` (L115-L115) - Function
  - `src.modules.inventory.services.levels.listPreorders.byId` (L116-L116) - Class
  - `src.modules.inventory.services.levels.listPreorders.byId.products.map() callback` (L116-L116) - Function
  - `src.modules.inventory.services.levels.listPreorders.items.items.map() callback` (L119-L127) - Function
- `src/modules/payments/services/settlement.ts`
  - `src.modules.payments.services.settlement.reportAttempt.declined` (L465-L466) - Class
  - `src.modules.payments.services.settlement.reportAttempt.declined.result.errors.some() callback` (L466-L466) - Function
- `src/modules/products/services/crud.ts`
  - `src.modules.products.services.crud.afterCommitStep` (L85-L91) - Class
  - `src.modules.products.services.crud.afterCommitStep.then() callback` (L88-L88) - Function
  - `src.modules.products.services.crud.afterCommitStep.catch() callback` (L89-L91) - Function
  - `src.modules.products.services.crud.finishCreate` (L151-L179) - Class
  - `src.modules.products.services.crud.finishCreate.then() callback` (L161-L177) - Function
  - `src.modules.products.services.crud.finishCreate.then() callback.afterCommitStep('audit') callback` (L162-L168) - Function
  - `src.modules.products.services.crud.finishCreate.then() callback.then() callback` (L170-L170) - Function
  - `src.modules.products.services.crud.finishCreate.then() callback.catch() callback` (L171-L177) - Function
  - `src.modules.products.services.crud.finishUpdate` (L295-L310) - Class
  - `src.modules.products.services.crud.finishUpdate.afterCommitStep('old image removal') callback` (L299-L300) - Function
  - `src.modules.products.services.crud.finishUpdate.then() callback` (L302-L302) - Function
  - `src.modules.products.services.crud.finishUpdate.catch() callback` (L303-L309) - Function
  - `src.modules.products.services.crud.finishUpdateById` (L356-L370) - Class
  - `src.modules.products.services.crud.finishUpdateById.afterCommitStep('audit') callback` (L361-L367) - Function
  - `src.modules.products.services.crud.finishUpdateById.then() callback` (L370-L370) - Function
  - `src.modules.products.services.crud.updateById` (L376-L384) - Class
  - `src.modules.products.services.crud.updateById.withTransaction() callback` (L381-L381) - Function
  - `src.modules.products.services.crud.updateById.then() callback` (L382-L383) - Function
- `src/modules/returns/domain/quantities.ts`
  - `src.modules.returns.domain.quantities.lines` (L83-L85) - Class
  - `src.modules.returns.domain.quantities.lines.map() callback` (L85-L85) - Function
- `src/modules/returns/domain/refund-amount.ts`
  - `src.modules.returns.domain.refund-amount.RefundInputs` (L24-L37) - Interface
  - `src.modules.returns.domain.refund-amount.CancellationInputs` (L96-L104) - Interface
- `src/modules/returns/domain/status-projection.ts`
  - `src.modules.returns.domain.status-projection.projectReturnStatus.holding` (L42-L47) - Class
  - `src.modules.returns.domain.status-projection.projectReturnStatus.holding.returns.filter() callback` (L43-L46) - Function
  - `src.modules.returns.domain.status-projection.projectReturnStatus.holding.some() callback` (L50-L50) - Function
- `src/modules/returns/services/cancel-remainder.ts`
  - `src.modules.returns.services.cancel-remainder.refund` (L172-L197) - Class
  - `src.modules.returns.services.cancel-remainder.refund.then() callback` (L188-L188) - Function
  - `src.modules.returns.services.cancel-remainder.refund.catch() callback` (L189-L196) - Function
  - `src.modules.returns.services.cancel-remainder.announceCancelled` (L208-L229) - Class
  - `src.modules.returns.services.cancel-remainder.announceCancelled.done.lines.map() callback` (L218-L218) - Function
  - `src.modules.returns.services.cancel-remainder.announceCancelled.then() callback` (L228-L228) - Function
- `src/modules/returns/services/create.ts`
  - `src.modules.returns.services.create.writeReturn.byProduct` (L215-L215) - Class
  - `src.modules.returns.services.create.writeReturn.byProduct.order.items.map() callback` (L215-L215) - Function
- `src/modules/returns/services/options.ts`
  - `src.modules.returns.services.options.optionLines.titles` (L50-L52) - Class
  - `src.modules.returns.services.options.optionLines.titles.order.items.map() callback` (L51-L51) - Function

### Demo Boot & App-Extension Surface
The entry-point and app-assembly surface that hands the production Express app to the scenario layer. It owns the demo profile entry (run-server.ts) that boots the real application against an in-memory MongoDB, seeds it from the shop scenario, and serves on NODE_PORT; the AppExtension hook in src/app.ts that exposes the built Express app (plus an afterBoot step) to the scenario layer without anything under src/ knowing it exists; and the locales repository write path (bumpRevision, createEntry, currentRevision, importEntries) that the product seeding pass depends on. This sub-component is the architectural bridge between the production app assembly and the scenario layer: it is where the AppExtension contract is defined and where the demo profile decides to serve traffic, distinct from the loopback execution core (which drives the app over HTTP) and the backdating engine (which rewrites history).

**Related Classes/Methods**:

- `src.app.AppExtension`:92-105
- `src.app.static-assets.installStatic`:19-52
- `src.kernel.module-config.moduleConfigSlices`:39-40
- `src.modules.locales.repository.importEntries`:227-275

**Source Files:**

- `scenarios/run-server.ts`
  - `scenarios.run-server.then() callback` (L163-L237) - Function
  - `scenarios.run-server.then() callback.then() callback.extension.afterBoot` (L230-L230) - Method
- `src/app.ts`
  - `src.app.AppExtension` (L92-L105) - Interface
- `src/app/static-assets.ts`
  - `src.app.static-assets.installStatic` (L19-L52) - Class
  - `src.app.static-assets.installStatic.setHeaders` (L44-L49) - Method
- `src/kernel/module-config.ts`
  - `src.kernel.module-config.moduleConfigSlices` (L39-L40) - Class
  - `src.kernel.module-config.moduleConfigSlices.appModules.flatMap() callback` (L40-L40) - Function
- `src/kernel/outbox.ts`
  - `src.kernel.outbox.announceWithin` (L393-L401) - Class
  - `src.kernel.outbox.announceWithin.then() callback` (L398-L401) - Function
  - `src.kernel.outbox.announceWithin.then() callback.then() callback` (L400-L400) - Function
  - `src.kernel.outbox.announceInTransaction` (L414-L421) - Class
  - `src.kernel.outbox.announceInTransaction.withTransaction() callback` (L418-L418) - Function
  - `src.kernel.outbox.announceInTransaction.then() callback` (L418-L421) - Function
- `src/modules/account/services/password.ts`
  - `src.modules.account.services.password.passwordAndEpochWrite` (L119-L126) - Class
  - `src.modules.account.services.password.passwordAndEpochWrite.<function>` (L121-L126) - Function
  - `src.modules.account.services.password.passwordAndEpochWrite.<function>.then() callback` (L124-L125) - Function
  - `src.modules.account.services.password.passwordAndEpochWrite.<function>.then() callback.then() callback` (L125-L125) - Function
  - `src.modules.account.services.password.writePassword` (L142-L160) - Class
  - `src.modules.account.services.password.writePassword.then() callback.announceInTransaction() callback` (L152-L153) - Function
  - `src.modules.account.services.password.writePassword.then() callback` (L157-L158) - Function
  - `src.modules.account.services.password.writePassword.then() callback.then() callback` (L158-L158) - Function
  - `src.modules.account.services.password.writePassword.catch() callback` (L160-L160) - Function
- `src/modules/account/services/revocation.ts`
  - `src.modules.account.services.revocation.moveEpoch` (L70-L79) - Class
  - `src.modules.account.services.revocation.moveEpoch.announceInTransaction() callback.then() callback` (L76-L76) - Function
  - `src.modules.account.services.revocation.moveEpoch.announceInTransaction() callback` (L77-L77) - Function
  - `src.modules.account.services.revocation.moveEpoch.then() callback` (L78-L78) - Function
- `src/modules/locales/repository.ts`
  - `src.modules.locales.repository.bumpRevision` (L150-L154) - Class
  - `src.modules.locales.repository.bumpRevision.then() callback` (L154-L154) - Function
  - `src.modules.locales.repository.valuesByKey` (L160-L166) - Class
  - `src.modules.locales.repository.valuesByKey.then() callback` (L166-L166) - Function
  - `src.modules.locales.repository.valuesByKey.then() callback.rows.map() callback` (L166-L166) - Function
  - `src.modules.locales.repository.currentRevision` (L172-L178) - Class
  - `src.modules.locales.repository.currentRevision.then() callback` (L178-L178) - Function
  - `src.modules.locales.repository.createEntry` (L181-L192) - Class
  - `src.modules.locales.repository.createEntry.then() callback.then() callback` (L192-L192) - Function
  - `src.modules.locales.repository.saveEntryValue` (L195-L207) - Class
  - `src.modules.locales.repository.saveEntryValue.then() callback` (L204-L205) - Function
  - `src.modules.locales.repository.saveEntryValue.then() callback.then() callback` (L205-L205) - Function
  - `src.modules.locales.repository.removeEntry` (L210-L211) - Class
  - `src.modules.locales.repository.removeEntry.then() callback` (L211-L211) - Function
  - `src.modules.locales.repository.importEntries` (L227-L275) - Class
  - `src.modules.locales.repository.importEntries.withTransaction() callback` (L241-L260) - Function
  - `src.modules.locales.repository.importEntries.withTransaction() callback.changedEntries.map() callback` (L246-L252) - Function
- `src/modules/orders/domain/lifecycle.ts`
  - `src.modules.orders.domain.lifecycle.statusesLeadingTo` (L203-L204) - Class
  - `src.modules.orders.domain.lifecycle.statusesLeadingTo.filter() callback` (L204-L204) - Function
- `src/modules/orders/services/cancel.ts`
  - `src.modules.orders.services.cancel.moveToCancelled` (L78-L107) - Class
  - `src.modules.orders.services.cancel.moveToCancelled.announceInTransaction() callback.order` (L89-L100) - Class
  - `src.modules.orders.services.cancel.moveToCancelled.announceInTransaction() callback.order.withTimeline() callback` (L99-L99) - Function
  - `src.modules.orders.services.cancel.moveToCancelled.announceInTransaction() callback` (L104-L104) - Function
  - `src.modules.orders.services.cancel.moveToCancelled.then() callback` (L105-L106) - Function
  - `src.modules.orders.services.cancel.moveToCancelled.then() callback.then() callback` (L106-L106) - Function
  - `src.modules.orders.services.cancel.cancelUnanswered` (L370-L381) - Class
  - `src.modules.orders.services.cancel.cancelUnanswered.then() callback` (L379-L380) - Function
  - `src.modules.orders.services.cancel.cancelUnanswered.then() callback.then() callback` (L380-L380) - Function
- `src/modules/orders/services/override.ts`
  - `src.modules.orders.services.override.applyOverride` (L56-L127) - Class
  - `src.modules.orders.services.override.applyOverride.write` (L88-L100) - Class
  - `src.modules.orders.services.override.applyOverride.write.withTimeline() callback` (L91-L99) - Function
  - `src.modules.orders.services.override.applyOverride.move.then() callback` (L114-L126) - Function
- `src/modules/orders/services/ship-stock.ts`
  - `src.modules.orders.services.ship-stock.announceMoveShippingStock` (L30-L43) - Class
  - `src.modules.orders.services.ship-stock.announceMoveShippingStock.announceInTransaction() callback` (L36-L39) - Function
  - `src.modules.orders.services.ship-stock.announceMoveShippingStock.announceInTransaction() callback.then() callback` (L37-L38) - Function
  - `src.modules.orders.services.ship-stock.announceMoveShippingStock.announceInTransaction() callback.then() callback.then() callback` (L38-L38) - Function
  - `src.modules.orders.services.ship-stock.announceMoveShippingStock.then() callback` (L41-L42) - Function
  - `src.modules.orders.services.ship-stock.announceMoveShippingStock.then() callback.then() callback` (L42-L42) - Function
- `src/modules/orders/services/status.ts`
  - `src.modules.orders.services.status.markSystemMove` (L65-L88) - Class
  - `src.modules.orders.services.status.markSystemMove.withTimeline() callback` (L84-L84) - Function
  - `src.modules.orders.services.status.markSystemMove.announceMove() callback` (L86-L86) - Function
  - `src.modules.orders.services.status.markPaid` (L113-L143) - Class
  - `src.modules.orders.services.status.markPaid.movePaid` (L120-L129) - Class
  - `src.modules.orders.services.status.movePaid.withTimeline() callback` (L121-L121) - Function
  - `src.modules.orders.services.status.markPaid.movePaid.withTimeline() callback` (L122-L128) - Function
  - `src.modules.orders.services.status.markPaid.announceMove() callback.then() callback` (L133-L134) - Function
  - `src.modules.orders.services.status.markPaid.announceMove() callback.then() callback.then() callback` (L134-L134) - Function
  - `src.modules.orders.services.status.markPaid.announceMove() callback` (L136-L136) - Function
  - `src.modules.orders.services.status.markPaid.then() callback` (L137-L141) - Function
  - `src.modules.orders.services.status.markPaid.then() callback.then() callback` (L140-L140) - Function
  - `src.modules.orders.services.status.markDelivered` (L207-L223) - Class
  - `src.modules.orders.services.status.withTimeline() callback` (L218-L218) - Function
  - `src.modules.orders.services.status.markDelivered.withTimeline() callback` (L219-L219) - Function
  - `src.modules.orders.services.status.markDelivered.announceMove() callback` (L221-L221) - Function
  - `src.modules.orders.services.status.markFulfilmentComplete` (L240-L273) - Class
  - `src.modules.orders.services.status.then() callback.withTimeline() callback` (L261-L262) - Function
  - `src.modules.orders.services.status.markFulfilmentComplete.then() callback.withTimeline() callback` (L263-L266) - Function
  - `src.modules.orders.services.status.markFulfilmentComplete.then() callback.announceWithin() callback` (L268-L271) - Function
  - `src.modules.orders.services.status.markFulfilmentComplete.then() callback.announceWithin() callback.events.map() callback` (L269-L270) - Function
- `src/modules/orders/services/timeline.ts`
  - `src.modules.orders.services.timeline.withTimeline` (L79-L89) - Class
  - `src.modules.orders.services.timeline.withTimeline.<function>` (L84-L89) - Function
  - `src.modules.orders.services.timeline.withTimeline.<function>.then() callback` (L85-L88) - Function
  - `src.modules.orders.services.timeline.withTimeline.<function>.then() callback.then() callback` (L87-L87) - Function
- `src/modules/returns/domain/quantities.ts`
  - `src.modules.returns.domain.quantities.ProductIdLike` (L14-L16) - Interface
  - `src.modules.returns.domain.quantities.ProductIdLike.toString` (L15-L15) - Method
- `src/modules/returns/domain/status-projection.ts`
  - `src.modules.returns.domain.status-projection.projectReturnStatus.everything` (L57-L59) - Class
  - `src.modules.returns.domain.status-projection.projectReturnStatus.everything.every() callback` (L58-L58) - Function
