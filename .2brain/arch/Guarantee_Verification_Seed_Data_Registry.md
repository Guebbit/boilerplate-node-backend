---
tags:
  - 2brain
  - 2brain/arch
  - project/boilerplate-node-backend
type: architecture
component: Guarantee_Verification_Seed_Data_Registry
---

```mermaid
graph LR
    Persistence_Repository_Factory_Revision_Search_Primitives["Persistence Repository Factory & Revision/Search Primitives"]
    Guarantee_Verification_Seed_Data_Registry["Guarantee Verification & Seed-Data Registry"]
    Scenario_Flow_Actions_Infrastructure_Adapters["Scenario Flow Actions & Infrastructure Adapters"]
    Guarantee_Verification_Seed_Data_Registry -- "verifies the seed rows materialized by the persistence substrate" --> Persistence_Repository_Factory_Revision_Search_Primitives
    Scenario_Flow_Actions_Infrastructure_Adapters -- "persists flow effects through the repository substrate" --> Persistence_Repository_Factory_Revision_Search_Primitives
    Scenario_Flow_Actions_Infrastructure_Adapters -- "reads seed-data registries to drive the scripted shop history" --> Guarantee_Verification_Seed_Data_Registry
```

## Details

The verification pillar of the subsystem. assertScenarioGuarantees and findUnmetGuarantees implement the contract check: for every shop module that declares a scenario guarantee, the checker walks the subjects the scenario actually offers and reports any guarantee that is not met. The same group carries the seed-data registry that the guarantees reference — OPENING_STOCK, PRODUCT_COPY_BY_ID, DIGITAL_GUIDES, SEED_CUSTOMER_EMAILS — so the checker has a single source of truth for what the scenario promises. describeTo provides the human-readable description of a scenario's guarantee surface, used in test output and documentation. This is the noun + assertion layer: it defines what the scenario must guarantee and checks that it does.

### Persistence Repository Factory & Revision/Search Primitives
The generic persistence kernel that the scenario layer (and the app) build repositories on. create-repository.ts is a factory that turns a Mongoose model into a typed repository with save, deleteOne, search, and pagination. revision-plugin.ts stamps updatedAt and increments a revision counter on update, and search.ts normalizes search results into PaginationResult/PaginatedMeta. This is the read/write persistence substrate beneath the scenario seed rows — the mechanism by which seeded products, customers, and orders are actually written and later queried.

**Related Classes/Methods**:

- `src.infrastructure.persistence.revision-plugin.revisionPlugin`:107-120
- `src.infrastructure.persistence.search.PaginationResult`:20-24

**Source Files:**

- `src/infrastructure/persistence/changes.ts`
  - `src.infrastructure.persistence.changes.setAndUnset.$set` (L34-L34) - Class
  - `src.infrastructure.persistence.changes.setAndUnset.$set.entries.filter() callback` (L34-L34) - Function
  - `src.infrastructure.persistence.changes.setAndUnset.$unset` (L35-L37) - Class
  - `src.infrastructure.persistence.changes.setAndUnset.$unset.entries.filter() callback` (L36-L36) - Function
  - `src.infrastructure.persistence.changes.setAndUnset.$unset.map() callback` (L36-L36) - Function
- `src/infrastructure/persistence/create-repository.ts`
  - `src.infrastructure.persistence.create-repository.FindAllOptions` (L55-L64) - Interface
  - `src.infrastructure.persistence.create-repository.SearchSpec` (L74-L105) - Interface
  - `src.infrastructure.persistence.create-repository.PaginatedResult` (L191-L194) - Interface
  - `src.infrastructure.persistence.create-repository.RepositoryOptions` (L197-L206) - Interface
  - `src.infrastructure.persistence.create-repository.createRepository.normalize.transformed.items.map() callback` (L331-L332) - Function
  - `src.infrastructure.persistence.create-repository.createRepository.normalize.transformed` (L331-L333) - Class
  - `src.infrastructure.persistence.create-repository.save` (L387-L390) - Class
  - `src.infrastructure.persistence.create-repository.createRepository.save.fencedSave() callback` (L390-L390) - Function
  - `src.infrastructure.persistence.create-repository.deleteOne` (L403-L408) - Class
  - `src.infrastructure.persistence.create-repository.createRepository.deleteOne.checkedDelete() callback` (L407-L407) - Function
  - `src.infrastructure.persistence.create-repository.search` (L419-L445) - Class
  - `src.infrastructure.persistence.create-repository.createRepository.search.then() callback` (L434-L443) - Function
  - `src.infrastructure.persistence.create-repository.createRepository.search.then() callback.then() callback` (L440-L443) - Function
- `src/infrastructure/persistence/revision-plugin.ts`
  - `src.infrastructure.persistence.revision-plugin.stampsUpdatedAt` (L65-L70) - Class
  - `src.infrastructure.persistence.revision-plugin.stampsUpdatedAt.setters.map() callback` (L66-L67) - Function
  - `src.infrastructure.persistence.revision-plugin.stampsUpdatedAt.setters` (L66-L68) - Class
  - `src.infrastructure.persistence.revision-plugin.stampsUpdatedAt.setters.some() callback` (L69-L69) - Function
  - `src.infrastructure.persistence.revision-plugin.incrementOnUpdate` (L81-L97) - Function
  - `src.infrastructure.persistence.revision-plugin.revisionPlugin` (L107-L120) - Class
  - `src.infrastructure.persistence.revision-plugin.revisionPlugin.flagEdit` (L112-L116) - Function
- `src/infrastructure/persistence/search.ts`
  - `src.infrastructure.persistence.search.PaginationResult` (L20-L24) - Interface
  - `src.infrastructure.persistence.search.PaginatedMeta` (L27-L32) - Interface
  - `src.infrastructure.persistence.search.addTextFilter` (L150-L160) - Class
  - `src.infrastructure.persistence.search.addTextFilter.fields.map() callback` (L157-L159) - Function
  - `src.infrastructure.persistence.search.splitSortParameter.parts.flatMap() callback` (L209-L210) - Function
  - `src.infrastructure.persistence.search.splitSortParameter.parts` (L209-L211) - Class
  - `src.infrastructure.persistence.search.splitSortParameter.tokens` (L212-L212) - Class
  - `src.infrastructure.persistence.search.splitSortParameter.tokens.parts.map() callback` (L212-L212) - Function
  - `src.infrastructure.persistence.search.splitSortParameter.present` (L213-L213) - Class
  - `src.infrastructure.persistence.search.splitSortParameter.present.tokens.filter() callback` (L213-L213) - Function
- `src/infrastructure/persistence/serialize.ts`
  - `src.infrastructure.persistence.serialize.SerializeOptions` (L18-L32) - Interface
  - `src.infrastructure.persistence.serialize.SerializableSchema` (L41-L43) - Interface
  - `src.infrastructure.persistence.serialize.applySerialization` (L52-L95) - Class
  - `src.infrastructure.persistence.serialize.transform` (L57-L76) - Class
  - `src.infrastructure.persistence.serialize.applySerialization.transform.toString` (L61-L61) - Method
  - `src.infrastructure.persistence.serialize.applySerialization.transform` (L85-L91) - Method
- `src/modules/audit-logs/model.ts`
  - `src.modules.audit-logs.model.AuditLogDocument` (L40-L42) - Interface
  - `src.modules.audit-logs.model.applyAuditLogTransform` (L175-L182) - Class
  - `src.modules.audit-logs.model.applyAuditLogTransform.after` (L178-L181) - Method
- `src/modules/audit-logs/repository.ts`
  - `src.modules.audit-logs.repository.AuditLogSearchFilters` (L23-L32) - Interface
  - `src.modules.audit-logs.repository.OwnEntriesCursor` (L75-L78) - Interface
  - `src.modules.audit-logs.repository.OwnEntriesPage` (L81-L85) - Interface
  - `src.modules.audit-logs.repository.cursorAfter.atEdge` (L99-L99) - Class
  - `src.modules.audit-logs.repository.cursorAfter.atEdge.rows.filter() callback` (L99-L99) - Function
  - `src.modules.audit-logs.repository.cursorAfter.seen.atEdge.map() callback` (L101-L101) - Function
  - `src.modules.audit-logs.repository.ownEntriesPage` (L115-L134) - Class
  - `src.modules.audit-logs.repository.ownEntriesPage.then() callback` (L129-L134) - Function
- `src/modules/example/model.ts`
  - `src.modules.example.model.ExampleDocument` (L25-L38) - Interface
  - `src.modules.example.model.applyExampleTransform` (L77-L82) - Class
  - `src.modules.example.model.applyExampleTransform.after` (L79-L81) - Method
- `src/modules/orders/model.ts`
  - `src.modules.orders.model.OrderDocumentItem` (L69-L87) - Interface
  - `src.modules.orders.model.OrderDocument` (L112-L228) - Interface
  - `src.modules.orders.model.OrderStatusOverride` (L234-L250) - Interface
  - `src.modules.orders.model.applyOrderTransform` (L682-L704) - Class
  - `src.modules.orders.model.applyOrderTransform.after` (L692-L703) - Method
  - `src.modules.orders.model.OrderNumberCounterDocument` (L717-L719) - Interface
- `src/modules/payments/model.ts`
  - `src.modules.payments.model.RefundRecord` (L21-L47) - Interface
  - `src.modules.payments.model.PaymentDocument` (L52-L111) - Interface
  - `src.modules.payments.model.applyPaymentTransform` (L257-L268) - Class
  - `src.modules.payments.model.applyPaymentTransform.after` (L259-L267) - Method
  - `src.modules.payments.model.applyPaymentTransform.after.serialized.refunds.map() callback` (L264-L265) - Function
  - `src.modules.payments.model.PaymentWebhookEventDocument` (L286-L291) - Interface
  - `src.modules.payments.model.paymentWebhookEventSchema.receivedAt.default` (L308-L308) - Method
- `src/modules/webhooks/metrics.ts`
  - `src.modules.webhooks.metrics._webhookDeliveriesOverdue` (L49-L61) - Class
  - `src.modules.webhooks.metrics._webhookDeliveriesOverdue.collect` (L53-L60) - Method
- `src/modules/webhooks/model.ts`
  - `src.modules.webhooks.model.WebhookSecretRingEntry` (L24-L28) - Interface
  - `src.modules.webhooks.model.WebhookSubscriptionDocument` (L31-L57) - Interface
  - `src.modules.webhooks.model.webhookSubscriptionSchema.eventTypes.validate.validator` (L91-L91) - Method
  - `src.modules.webhooks.model.applyWebhookSubscriptionTransform` (L148-L155) - Class
  - `src.modules.webhooks.model.applyWebhookSubscriptionTransform.after` (L150-L154) - Method
  - `src.modules.webhooks.model.applyWebhookSubscriptionTransform.after.map() callback` (L152-L152) - Function
  - `src.modules.webhooks.model.WebhookDeliveryDocument` (L178-L203) - Interface
- `src/modules/webhooks/repository.ts`
  - `src.modules.webhooks.repository.outcomeUpdate.present` (L253-L253) - Class
  - `src.modules.webhooks.repository.outcomeUpdate.present.entries.filter() callback` (L253-L253) - Function
  - `src.modules.webhooks.repository.outcomeUpdate.absent` (L254-L254) - Class
  - `src.modules.webhooks.repository.outcomeUpdate.absent.entries.filter() callback` (L254-L254) - Function

### Guarantee Verification & Seed-Data Registry
The verification pillar of the subsystem. assertScenarioGuarantees and findUnmetGuarantees implement the contract check: for every enabled shop module that declares a scenario guarantee, the checker walks the subjects the scenario actually offers and reports any guarantee that is not met (and any subject no module declares) — a bidirectional equality check between declared promises and offered rows. The same group carries the seed-data registries the guarantees reference — OPENING_STOCK, PRODUCT_COPY_BY_ID, DIGITAL_GUIDES, SEED_CUSTOMER_EMAILS — so the checker has a single source of truth for what the scenario promises. describeTo provides the human-readable description of a scenario's guarantee surface, used in test output and documentation.

**Related Classes/Methods**:

- `scenarios.check.assertScenarioGuarantees`:73-83
- `scenarios.check.findUnmetGuarantees`:44-63
- `scenarios.products.OPENING_STOCK`:372-385
- `scenarios.products.PRODUCT_COPY_BY_ID`:402-409
- `scenarios.apply.describeTo`:110-112

**Source Files:**

- `scenarios/apply.ts`
  - `scenarios.apply.describeTo` (L110-L112) - Class
  - `scenarios.apply.describeTo.process.argv.find() callback` (L111-L111) - Function
- `scenarios/check.ts`
  - `scenarios.check.findUnmetGuarantees` (L44-L63) - Class
  - `scenarios.check.findUnmetGuarantees.problems` (L53-L55) - Class
  - `scenarios.check.findUnmetGuarantees.problems.filter() callback` (L54-L54) - Function
  - `scenarios.check.findUnmetGuarantees.problems.map() callback` (L55-L55) - Function
  - `scenarios.check.findUnmetGuarantees.filter() callback` (L60-L60) - Function
  - `scenarios.check.findUnmetGuarantees.map() callback` (L61-L61) - Function
  - `scenarios.check.assertScenarioGuarantees` (L73-L83) - Class
  - `scenarios.check.assertScenarioGuarantees.problems.map() callback` (L81-L81) - Function
- `scenarios/flows/actions.ts`
  - `scenarios.flows.actions.receiveStock` (L52-L55) - Class
  - `scenarios.flows.actions.receiveStock.then() callback` (L55-L55) - Function
  - `scenarios.flows.actions.startProcessing` (L203-L204) - Class
  - `scenarios.flows.actions.startProcessing.then() callback` (L204-L204) - Function
  - `scenarios.flows.actions.requestReturn` (L243-L251) - Class
  - `scenarios.flows.actions.requestReturn.then() callback` (L251-L251) - Function
- `scenarios/products-filler.ts`
  - `scenarios.products-filler.DIGITAL_GUIDES` (L268-L292) - Class
  - `scenarios.products-filler.DIGITAL_GUIDES.map() callback` (L271-L292) - Function
- `scenarios/products.ts`
  - `scenarios.products.OPENING_STOCK` (L372-L385) - Class
  - `scenarios.products.OPENING_STOCK.FILLER_PRODUCTS.map() callback` (L383-L383) - Function
  - `scenarios.products.PRODUCT_COPY_BY_ID` (L402-L409) - Class
  - `scenarios.products.PRODUCT_COPY_BY_ID.map() callback` (L404-L404) - Function
  - `scenarios.products.PRODUCT_COPY_BY_ID.FILLER_PRODUCTS.map() callback` (L407-L407) - Function
- `scenarios/users.ts`
  - `scenarios.users.SEED_CUSTOMER_EMAILS` (L242-L246) - Class
  - `scenarios.users.SEED_CUSTOMER_EMAILS.CUSTOMER_NAMES.map() callback` (L243-L243) - Function
- `src/cluster.ts`
  - `src.cluster.supervise.scheduleRespawn.timer` (L72-L75) - Class
  - `src.cluster.supervise.scheduleRespawn.timer.setTimeout() callback` (L72-L75) - Function
- `src/modules/api-keys/repository.ts`
  - `src.modules.api-keys.repository.deleteByUserId` (L63-L69) - Class
  - `src.modules.api-keys.repository.deleteByUserId.then() callback` (L67-L69) - Function
- `src/modules/cart/repository.ts`
  - `src.modules.cart.repository.LineWrite` (L27-L30) - Interface
  - `src.modules.cart.repository.upsertLine.then() callback.then() callback.currentQuantity.existing.items.find() callback` (L151-L152) - Function
  - `src.modules.cart.repository.upsertLine.then() callback.then() callback.currentQuantity` (L151-L153) - Class
- `src/modules/orders/domain/tax.ts`
  - `src.modules.orders.domain.tax.TaxableLineItem` (L24-L28) - Interface
  - `src.modules.orders.domain.tax.LineTaxBreakdown` (L38-L42) - Interface
  - `src.modules.orders.domain.tax.TaxRateSummary` (L49-L55) - Interface
  - `src.modules.orders.domain.tax.OrderTaxBreakdown` (L58-L90) - Interface
  - `src.modules.orders.domain.tax.OrderTaxInput` (L93-L104) - Interface
  - `src.modules.orders.domain.tax.RateGroup` (L128-L134) - Interface
  - `src.modules.orders.domain.tax.allocateLineTax.taxes` (L185-L185) - Class
  - `src.modules.orders.domain.tax.allocateLineTax.taxes.grossByLine.map() callback` (L185-L185) - Function
  - `src.modules.orders.domain.tax.allocateLineTax.indexes` (L187-L187) - Class
  - `src.modules.orders.domain.tax.allocateLineTax.indexes.rates.flatMap() callback` (L187-L187) - Function
  - `src.modules.orders.domain.tax.lineTaxFromRateTotals.rates` (L210-L210) - Class
  - `src.modules.orders.domain.tax.lineTaxFromRateTotals.rates.items.map() callback` (L210-L210) - Function
  - `src.modules.orders.domain.tax.lines` (L256-L260) - Class
  - `src.modules.orders.domain.tax.orderTaxBreakdown.lines.items.map() callback` (L256-L260) - Function
  - `src.modules.orders.domain.tax.orderTaxBreakdown.sortedGroups` (L262-L262) - Class
  - `src.modules.orders.domain.tax.orderTaxBreakdown.sortedGroups.toSorted() callback` (L262-L262) - Function
  - `src.modules.orders.domain.tax.orderTaxBreakdown.taxSummary.sortedGroups.map() callback` (L274-L275) - Function
  - `src.modules.orders.domain.tax.taxSummary` (L274-L276) - Class
  - `src.modules.orders.domain.tax.shippingByRate` (L278-L282) - Class
  - `src.modules.orders.domain.tax.orderTaxBreakdown.shippingByRate.sortedGroups.map() callback` (L279-L280) - Function
  - `src.modules.orders.domain.tax.orderTaxBreakdown.shippingByRate.filter() callback` (L282-L282) - Function
  - `src.modules.orders.domain.tax.shippingNetTotal.sumOf() callback` (L285-L285) - Function
  - `src.modules.orders.domain.tax.orderTaxBreakdown.netTotal.sumOf() callback` (L290-L290) - Function
  - `src.modules.orders.domain.tax.orderTaxBreakdown.taxTotal.sumOf() callback` (L297-L297) - Function
  - `src.modules.orders.domain.tax.orderTaxBreakdown.shippingTaxAmount.sumOf() callback` (L302-L302) - Function
- `src/modules/orders/repository.ts`
  - `src.modules.orders.repository.scrubDueForAnonymization` (L498-L508) - Class
  - `src.modules.orders.repository.scrubDueForAnonymization.then() callback` (L508-L508) - Function

### Scenario Flow Actions & Infrastructure Adapters
The scripted flow layer that exercises the seeded dataset against a live app, plus the infrastructure adapters it depends on. shop-history.ts composes the ordered, promise-chained actions that give the demo its history — banOneCustomer, requireBankTransfer, signOutEveryone — and actions.ts supplies the atomic verbs (receiveStock, requestReturn) that put stock on the shelf and drive returns. These flows are what make the guarantees in Group 2 hold. The group also bundles the adapters the flows and app lean on: pdf.ts (renderOnce, printIn, withDeadline), queue.ts, ids.ts (carriedAt, malformedIdIssues), locale.ts, content-type.ts, and filesystem.ts. Together this is the verb layer — the actions and adapters that turn the seeded nouns into a coherent, verifiable shop history.

**Related Classes/Methods**:

- `scenarios.flows.shop-history.requireBankTransfer`:342-348
- `src.infrastructure.adapters.pdf.renderOnce`:164-168
- `src.infrastructure.http.ids.carriedAt`:225-238

**Source Files:**

- `scenarios/flows/shop-history.ts`
  - `scenarios.flows.shop-history.banOneCustomer` (L293-L296) - Class
  - `scenarios.flows.shop-history.banOneCustomer.then() callback` (L296-L296) - Function
  - `scenarios.flows.shop-history.signOutEveryone` (L307-L310) - Class
  - `scenarios.flows.shop-history.signOutEveryone.callers.map() callback` (L308-L308) - Function
  - `scenarios.flows.shop-history.signOutEveryone.then() callback` (L309-L309) - Function
  - `scenarios.flows.shop-history.requireBankTransfer` (L342-L348) - Class
  - `scenarios.flows.shop-history.requireBankTransfer.then() callback` (L343-L348) - Function
  - `scenarios.flows.shop-history.requireBankTransfer.then() callback.methods.some() callback` (L344-L344) - Function
- `src/infrastructure/adapters/filesystem.ts`
  - `src.infrastructure.adapters.filesystem.pruneUnreferenced.then() callback.orphaned` (L180-L180) - Class
  - `src.infrastructure.adapters.filesystem.pruneUnreferenced.then() callback.orphaned.entries.filter() callback` (L180-L180) - Function
  - `src.infrastructure.adapters.filesystem.pruneUnreferenced.then() callback.orphaned.map() callback` (L183-L195) - Function
  - `src.infrastructure.adapters.filesystem.pruneUnreferenced.then() callback.orphaned.map() callback.then() callback` (L193-L193) - Function
- `src/infrastructure/adapters/logger.ts`
  - `src.infrastructure.adapters.logger.SENSITIVE_KEYS` (L123-L123) - Class
  - `src.infrastructure.adapters.logger.SENSITIVE_KEYS.map() callback` (L123-L123) - Function
- `src/infrastructure/adapters/pdf.ts`
  - `src.infrastructure.adapters.pdf.renderHtmlToPdf.render` (L134-L134) - Class
  - `src.infrastructure.adapters.pdf.renderHtmlToPdf.render.withRenderSlot() callback` (L134-L134) - Function
  - `src.infrastructure.adapters.pdf.renderOnce` (L164-L168) - Class
  - `src.infrastructure.adapters.pdf.renderOnce.then() callback` (L168-L168) - Function
  - `src.infrastructure.adapters.pdf.withDeadline` (L180-L202) - Class
  - `src.infrastructure.adapters.pdf.withDeadline.finally() callback` (L197-L200) - Function
  - `src.infrastructure.adapters.pdf.printIn` (L227-L264) - Class
  - `src.infrastructure.adapters.pdf.printIn.then() callback` (L232-L262) - Function
  - `src.infrastructure.adapters.pdf.printIn.then() callback.then() callback` (L262-L262) - Function
- `src/infrastructure/adapters/queue.ts`
  - `src.infrastructure.adapters.queue.publishToQueue.then() callback.<function>.timer` (L656-L660) - Class
  - `src.infrastructure.adapters.queue.publishToQueue.then() callback.<function>.timer.setTimeout() callback` (L656-L660) - Function
- `src/infrastructure/http/ids.ts`
  - `src.infrastructure.http.ids.carriedAt` (L225-L238) - Class
  - `src.infrastructure.http.ids.carriedAt.value.flatMap() callback` (L231-L232) - Function
  - `src.infrastructure.http.ids.malformedIdIssues` (L251-L262) - Class
  - `src.infrastructure.http.ids.malformedIdIssues.flatMap() callback` (L257-L257) - Function
  - `src.infrastructure.http.ids.malformedIdIssues.filter() callback` (L259-L260) - Function
  - `src.infrastructure.http.ids.malformedIdIssues.map() callback` (L262-L262) - Function
- `src/infrastructure/http/middlewares/content-type.ts`
  - `src.infrastructure.http.middlewares.content-type.requireDeclaredContentType.<function>.operation` (L46-L48) - Class
  - `src.infrastructure.http.middlewares.content-type.requireDeclaredContentType.<function>.operation.operations.find() callback` (L47-L47) - Function
- `src/infrastructure/http/middlewares/locale.ts`
  - `src.infrastructure.http.middlewares.locale.negotiateLocale.offered` (L36-L36) - Class
  - `src.infrastructure.http.middlewares.locale.negotiateLocale.offered.supported.filter() callback` (L36-L36) - Function
- `src/infrastructure/http/middlewares/upload.ts`
  - `src.infrastructure.http.middlewares.upload.withLocaleRestored` (L196-L205) - Class
  - `src.infrastructure.http.middlewares.upload.withLocaleRestored.<function>` (L198-L205) - Function
  - `src.infrastructure.http.middlewares.upload.withLocaleRestored.<function>.middleware() callback` (L199-L205) - Function
  - `src.infrastructure.http.middlewares.upload.withLocaleRestored.<function>.middleware() callback.runWithLocaleContext() callback` (L204-L204) - Function
  - `src.infrastructure.http.middlewares.upload.validateUploadedImages.then() callback.rejected` (L237-L241) - Class
  - `src.infrastructure.http.middlewares.upload.validateUploadedImages.then() callback.rejected.paths.filter() callback` (L238-L240) - Function
  - `src.infrastructure.http.middlewares.upload.validateUploadedImages.then() callback.rejected.map() callback` (L259-L259) - Function
  - `src.infrastructure.http.middlewares.upload.then() callback.digested.map() callback` (L332-L332) - Function
  - `src.infrastructure.http.middlewares.upload.quarantineUploadedImages.then() callback.failed` (L372-L372) - Class
  - `src.infrastructure.http.middlewares.upload.quarantineUploadedImages.then() callback.failed.results.find() callback` (L372-L372) - Function
  - `src.infrastructure.http.middlewares.upload.quarantineUploadedImages.then() callback.keys` (L378-L380) - Class
  - `src.infrastructure.http.middlewares.upload.quarantineUploadedImages.then() callback.keys.results.map() callback` (L379-L379) - Function
  - `src.infrastructure.http.middlewares.upload.upload` (L446-L448) - Class
  - `src.infrastructure.http.middlewares.upload.upload.image` (L447-L447) - Method
- `src/infrastructure/http/preconditions.ts`
  - `src.infrastructure.http.preconditions.tagsOf` (L28-L28) - Class
  - `src.infrastructure.http.preconditions.tagsOf.map() callback` (L28-L28) - Function
