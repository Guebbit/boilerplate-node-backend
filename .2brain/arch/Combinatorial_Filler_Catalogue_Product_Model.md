---
tags:
  - 2brain
  - 2brain/arch
  - project/boilerplate-node-backend
type: architecture
component: Combinatorial_Filler_Catalogue_Product_Model
---

```mermaid
graph LR
    Asset_Delivery_Response_Envelope["Asset Delivery & Response Envelope"]
    Combinatorial_Catalogue_Generator_Flow_Data_Model["Combinatorial Catalogue Generator & Flow Data Model"]
    Product_Materialisation_Locale_Resolution_Pipeline["Product Materialisation & Locale Resolution Pipeline"]
    Combinatorial_Catalogue_Generator_Flow_Data_Model -- "generates product volume consumed by the materialisation pipeline" --> Product_Materialisation_Locale_Resolution_Pipeline
    Product_Materialisation_Locale_Resolution_Pipeline -- "shapes locale HTTP replies and serves locale dictionaries" --> Asset_Delivery_Response_Envelope
```

## Details

The catalogue-generation pillar. It defines the combinatorial product model — AnimalLine (species/line), FillerCopy (marketing copy variants), Tier (price/quality tier), ProductType (physical/digital/service) — and the GRID_PRODUCTS matrix that cross-multiplies them into a full filler catalogue. fillerProductRows materialises the grid into concrete product rows ready for seeding. The group also carries the locale-entry edit driver (driveLocaleEntryEdit) that localises each filler product, and the flow data structures (CartSummaryData, CheckoutData, Line) that the filler products flow through during cart/checkout scenario steps. This is the volume layer: it is what gives the demo shop its realistic product count without hand-authoring every SKU.

### Asset Delivery & Response Envelope
The asset-delivery and response-envelope layer that wraps product media (images, PDFs) and locale resources in the standard HTTP response contract. image-signatures canonicalises MIME types and enforces header-length limits for product image delivery. The pdf adapter guards against non-data requests and produces invoice/receipt PDFs that flow products pass through at checkout. The response module defines the four response shapes (Success, Reject, Neutral, ErrorItem) and the normalizeErrors helper that every scenario action uses to shape its HTTP reply. i18n.catalog loads locale resource bundles and lists supported locales, feeding the localisation pipeline. This group is the transport boundary: it controls how product assets and locale resources are packaged and delivered over HTTP.

**Related Classes/Methods**:

- `src.infrastructure.http.response.normalizeErrors`:210-238
- `src.infrastructure.adapters.image-signatures.CANONICAL_MIME_BY_ALIAS`:76-80
- `src.infrastructure.adapters.pdf.refuseNonDataRequest`:212-218
- `src.infrastructure.i18n.catalog.loadLocaleResources`:177-183

**Source Files:**

- `scenarios/flows/actions.ts`
  - `scenarios.flows.actions.shipOrder.then() callback.fulfillmentOrders.filter() callback` (L243-L243) - Function
  - `scenarios.flows.actions.cancelRemainder` (L309-L326) - Class
  - `scenarios.flows.actions.cancelRemainder.then() callback` (L326-L326) - Function
  - `scenarios.flows.actions.softDeleteOrder` (L359-L360) - Class
  - `scenarios.flows.actions.softDeleteOrder.then() callback` (L360-L360) - Function
- `scripts/audit/code-shape/scripts/shallow-candidates.ts`
  - `scripts.audit.code-shape.scripts.shallow-candidates.FileFacts` (L63-L72) - Interface
  - `scripts.audit.code-shape.scripts.shallow-candidates.publishedFiles.queue` (L369-L369) - Class
  - `scripts.audit.code-shape.scripts.shallow-candidates.publishedFiles.queue.filter() callback` (L369-L369) - Function
  - `scripts.audit.code-shape.scripts.shallow-candidates.findShallowCandidates.inScope` (L447-L449) - Class
  - `scripts.audit.code-shape.scripts.shallow-candidates.findShallowCandidates.inScope.scope.some() callback` (L449-L449) - Function
  - `scripts.audit.code-shape.scripts.shallow-candidates.findShallowCandidates.smallAndRare.functions.filter() callback` (L481-L481) - Function
- `scripts/docs/jobs-render.ts`
  - `scripts.docs.jobs-render.describeSchedule` (L32-L40) - Class
  - `scripts.docs.jobs-render.describeSchedule.rest.every() callback` (L37-L37) - Function
  - `scripts.docs.jobs-render.renderJobsTable` (L83-L91) - Class
  - `scripts.docs.jobs-render.renderJobsTable.jobs.map() callback` (L88-L89) - Function
- `scripts/scaffold/demo-remove-alert-rules.ts`
  - `scripts.scaffold.demo-remove-alert-rules.stripRules` (L100-L115) - Class
  - `scripts.scaffold.demo-remove-alert-rules.stripRules.kept` (L107-L107) - Class
  - `scripts.scaffold.demo-remove-alert-rules.stripRules.kept.chunks.filter() callback` (L107-L107) - Function
- `scripts/scaffold/demo-remove-authorization.ts`
  - `scripts.scaffold.demo-remove-authorization.readRemovedAuthorization.subjects.filter() callback` (L52-L52) - Function
  - `scripts.scaffold.demo-remove-authorization.stripRoleGrants.lines` (L66-L68) - Class
  - `scripts.scaffold.demo-remove-authorization.stripRoleGrants.lines.filter() callback` (L68-L68) - Function
- `scripts/scaffold/demo-remove-registry.ts`
  - `scripts.scaffold.demo-remove-registry.RemovalNote` (L19-L22) - Interface
- `scripts/scaffold/demo-remove-validation-labels.ts`
  - `scripts.scaffold.demo-remove-validation-labels.readRemovedFields.survivors` (L124-L126) - Class
  - `scripts.scaffold.demo-remove-validation-labels.readRemovedFields.survivors.filter() callback` (L125-L125) - Function
  - `scripts.scaffold.demo-remove-validation-labels.readRemovedFields.survivors.map() callback` (L126-L126) - Function
- `src/infrastructure/adapters/image-signatures.ts`
  - `src.infrastructure.adapters.image-signatures.CANONICAL_MIME_BY_ALIAS` (L76-L80) - Class
  - `src.infrastructure.adapters.image-signatures.CANONICAL_MIME_BY_ALIAS.SUPPORTED_IMAGE_FORMATS.flatMap() callback` (L77-L78) - Function
  - `src.infrastructure.adapters.image-signatures.CANONICAL_MIME_BY_ALIAS.SUPPORTED_IMAGE_FORMATS.flatMap() callback.map() callback` (L78-L78) - Function
  - `src.infrastructure.adapters.image-signatures.HEADER_LENGTH` (L83-L89) - Class
  - `src.infrastructure.adapters.image-signatures.HEADER_LENGTH.SUPPORTED_IMAGE_FORMATS.flatMap() callback` (L84-L87) - Function
  - `src.infrastructure.adapters.image-signatures.HEADER_LENGTH.SUPPORTED_IMAGE_FORMATS.flatMap() callback.map() callback` (L86-L86) - Function
- `src/infrastructure/adapters/pdf.ts`
  - `src.infrastructure.adapters.pdf.refuseNonDataRequest` (L212-L218) - Class
  - `src.infrastructure.adapters.pdf.refuseNonDataRequest.answer.catch() callback` (L217-L217) - Function
- `src/infrastructure/adapters/ssrf-guard.ts`
  - `src.infrastructure.adapters.ssrf-guard.resolveSafeOutboundTarget.then() callback.then() callback.unsafe` (L285-L287) - Class
  - `src.infrastructure.adapters.ssrf-guard.resolveSafeOutboundTarget.then() callback.then() callback.unsafe.addresses.find() callback` (L287-L287) - Function
- `src/infrastructure/http/request.ts`
  - `src.infrastructure.http.request.readInput.sources.map() callback` (L250-L251) - Function
  - `src.infrastructure.http.request.readInput.sources` (L250-L252) - Class
  - `src.infrastructure.http.request.readInput.stated` (L282-L284) - Class
  - `src.infrastructure.http.request.readInput.stated.sources.map() callback` (L283-L283) - Function
  - `src.infrastructure.http.request.readInput.stated.filter() callback` (L284-L284) - Function
  - `src.infrastructure.http.request.readInput.undecoded` (L288-L288) - Class
  - `src.infrastructure.http.request.readInput.undecoded.stated.find() callback` (L288-L288) - Function
- `src/infrastructure/http/response.ts`
  - `src.infrastructure.http.response.ResponseNeutral` (L20-L27) - Interface
  - `src.infrastructure.http.response.ResponseSuccess` (L32-L39) - Interface
  - `src.infrastructure.http.response.ResponseErrorItem` (L42-L54) - Interface
  - `src.infrastructure.http.response.ResponseReject` (L60-L69) - Interface
  - `src.infrastructure.http.response.normalizeErrors` (L210-L238) - Class
  - `src.infrastructure.http.response.normalizeErrors.inputErrors.map() callback` (L219-L237) - Function
- `src/infrastructure/i18n/catalog.ts`
  - `src.infrastructure.i18n.catalog.listSupportedLocales` (L62-L77) - Class
  - `src.infrastructure.i18n.catalog.listSupportedLocales.filter() callback` (L72-L72) - Function
  - `src.infrastructure.i18n.catalog.listSupportedLocales.map() callback` (L73-L73) - Function
  - `src.infrastructure.i18n.catalog.loadLocaleResources` (L177-L183) - Class
  - `src.infrastructure.i18n.catalog.loadLocaleResources.map() callback` (L179-L182) - Function
- `src/infrastructure/runtime/busy.ts`
  - `src.infrastructure.runtime.busy.ServiceBusyError` (L13-L19) - Class
  - `src.infrastructure.runtime.busy.ServiceBusyError.constructor` (L15-L18) - Constructor
- `src/kernel/registry.ts`
  - `src.kernel.registry.BrowserEventTarget` (L224-L230) - Interface
- `src/modules/account/jobs.ts`
  - `src.modules.account.jobs.run.then() callback` (L52-L54) - Function
- `src/modules/inventory/repository.ts`
  - `src.modules.inventory.repository.stockLevelRepository.preorderBoard.then() callback.ids` (L422-L422) - Class
  - `src.modules.inventory.repository.stockLevelRepository.preorderBoard.then() callback.ids.rows.map() callback` (L422-L422) - Function
- `src/modules/invoicing/repository.ts`
  - `src.modules.invoicing.repository.DocumentBucketRow` (L29-L37) - Interface
- `src/modules/locales/repository.ts`
  - `src.modules.locales.repository.deleteLocaleCascade` (L297-L303) - Class
  - `src.modules.locales.repository.deleteLocaleCascade.then() callback` (L301-L302) - Function
  - `src.modules.locales.repository.deleteLocaleCascade.then() callback.then() callback` (L302-L302) - Function
  - `src.modules.locales.repository.findEntityIdsByFieldMatch` (L390-L407) - Class
  - `src.modules.locales.repository.findEntityIdsByFieldMatch.$or.fields.map() callback` (L400-L402) - Function
  - `src.modules.locales.repository.findEntityIdsByFieldMatch.then() callback` (L407-L407) - Function
  - `src.modules.locales.repository.findEntityIdsByFieldMatch.then() callback.rows.map() callback` (L407-L407) - Function
- `src/modules/locales/services/capabilities.ts`
  - `src.modules.locales.services.capabilities.mergeCapabilities` (L101-L125) - Class
  - `src.modules.locales.services.capabilities.mergeCapabilities.toSorted() callback` (L124-L124) - Function
  - `src.modules.locales.services.capabilities.readDynamicTier` (L132-L152) - Class
  - `src.modules.locales.services.capabilities.readDynamicTier.then() callback` (L144-L144) - Function
  - `src.modules.locales.services.capabilities.readDynamicTier.catch() callback` (L145-L152) - Function
  - `src.modules.locales.services.capabilities.listCapabilities` (L168-L173) - Class
  - `src.modules.locales.services.capabilities.listCapabilities.then() callback` (L169-L173) - Function
- `src/modules/locales/services/entries.ts`
  - `src.modules.locales.services.entries.importEntries.keys` (L228-L228) - Class
  - `src.modules.locales.services.entries.importEntries.keys.inputs.map() callback` (L228-L228) - Function
- `src/modules/locales/services/translations.ts`
  - `src.modules.locales.services.translations.planSlot.planFields.unknownField` (L104-L106) - Class
  - `src.modules.locales.services.translations.planSlot.planFields.unknownField.find() callback` (L105-L105) - Function
  - `src.modules.locales.services.translations.writePlannedTranslations.fallbackWrite` (L232-L235) - Class
  - `src.modules.locales.services.translations.writePlannedTranslations.fallbackWrite.planned.find() callback` (L233-L234) - Function
- `src/modules/products/browser-events.ts`
  - `src.modules.products.browser-events.productsBrowserEvents.[productsAnalyticsEvents.PRODUCT_VIEWED].toReport` (L20-L23) - Method
  - `src.modules.products.browser-events.productsBrowserEvents.[productsAnalyticsEvents.PRODUCTS_SEARCHED].toReport` (L26-L29) - Method
- `src/modules/products/services/lookups.ts`
  - `src.modules.products.services.lookups.translationsWithFallback` (L93-L116) - Class
  - `src.modules.products.services.lookups.translationsWithFallback.then() callback` (L96-L116) - Function
- `src/modules/stats/services/range.ts`
  - `src.modules.stats.services.range.resolvePeriod.period.bucketStarts.range.bucketStarts.map() callback` (L74-L74) - Function

### Combinatorial Catalogue Generator & Flow Data Model
The core generation engine of the filler catalogue. It defines four orthogonal product dimensions (AnimalLine, FillerCopy, Tier, ProductType) and cross-multiplies them in the GRID_PRODUCTS matrix to produce a deterministic, exhaustive set of FillerProduct entries. The driveLocaleEntryEdit driver localises each generated product by walking its locale entries and applying per-locale copy overrides. Flow data structures (CartSummaryData, CheckoutData, Line, PaymentData) define the shape that filler products assume as they move through cart-addition, checkout, and payment scenario steps. This group is the single source of truth for product volume: every SKU in the demo shop is derived from this combinatorial model rather than hand-authored.

**Related Classes/Methods**:

- `scenarios.products-filler.GRID_PRODUCTS`:236-261
- `scenarios.locales.driveLocaleEntryEdit`:247-256

**Source Files:**

- `scenarios/flows/actions.ts`
  - `scenarios.flows.actions.Line` (L15-L18) - Interface
  - `scenarios.flows.actions.CartSummaryData` (L21-L23) - Interface
  - `scenarios.flows.actions.CheckoutData` (L26-L28) - Interface
  - `scenarios.flows.actions.PaymentData` (L31-L34) - Interface
  - `scenarios.flows.actions.ensureAddress` (L63-L78) - Class
  - `scenarios.flows.actions.ensureAddress.then() callback` (L78-L78) - Function
  - `scenarios.flows.actions.openPayment` (L128-L129) - Class
  - `scenarios.flows.actions.openPayment.then() callback` (L129-L129) - Function
  - `scenarios.flows.actions.syncPayment` (L163-L166) - Class
  - `scenarios.flows.actions.syncPayment.then() callback` (L166-L166) - Function
  - `scenarios.flows.actions.FulfillmentData` (L207-L215) - Interface
  - `scenarios.flows.actions.shipOrder.then() callback.inSequence() callback` (L245-L245) - Function
  - `scenarios.flows.actions.deliverOrder` (L294-L300) - Class
  - `scenarios.flows.actions.deliverOrder.then() callback` (L295-L299) - Function
  - `scenarios.flows.actions.deliverOrder.then() callback.shipments.filter() callback` (L297-L297) - Function
  - `scenarios.flows.actions.deliverOrder.then() callback.inSequence() callback` (L298-L298) - Function
  - `scenarios.flows.actions.cancelOrder` (L332-L333) - Class
  - `scenarios.flows.actions.cancelOrder.then() callback` (L333-L333) - Function
- `scenarios/locales.ts`
  - `scenarios.locales.driveLocaleEntryEdit` (L247-L256) - Class
  - `scenarios.locales.driveLocaleEntryEdit.then() callback` (L256-L256) - Function
- `scenarios/products-filler.ts`
  - `scenarios.products-filler.AnimalLine` (L27-L33) - Interface
  - `scenarios.products-filler.ProductType` (L46-L60) - Interface
  - `scenarios.products-filler.Tier` (L147-L156) - Interface
  - `scenarios.products-filler.FillerCopy` (L196-L199) - Interface
  - `scenarios.products-filler.FillerProduct` (L202-L226) - Interface
  - `scenarios.products-filler.GRID_PRODUCTS.ANIMALS.flatMap() callback` (L236-L260) - Function
  - `scenarios.products-filler.GRID_PRODUCTS` (L236-L261) - Class
  - `scenarios.products-filler.GRID_PRODUCTS.ANIMALS.flatMap() callback.PRODUCT_TYPES.flatMap() callback` (L237-L259) - Function
  - `scenarios.products-filler.GRID_PRODUCTS.ANIMALS.flatMap() callback.PRODUCT_TYPES.flatMap() callback.TIERS.map() callback` (L238-L259) - Function
- `scenarios/run-server.ts`
  - `scenarios.run-server.waitUntilListening.poll` (L149-L157) - Class
  - `scenarios.run-server.poll.then() callback` (L151-L151) - Function
  - `scenarios.run-server.waitUntilListening.poll.then() callback` (L152-L156) - Function
  - `scenarios.run-server.then() callback.process.once() callback.catch() callback` (L172-L176) - Function
  - `scenarios.run-server.then() callback.process.once() callback.then() callback` (L177-L177) - Function
  - `scenarios.run-server.then() callback.then() callback` (L234-L236) - Function
  - `scenarios.run-server.catch() callback` (L238-L241) - Function
- `scripts/audit/code-shape/scripts/shallow-candidates.ts`
  - `scripts.audit.code-shape.scripts.shallow-candidates.ShallowReport` (L77-L86) - Interface
  - `scripts.audit.code-shape.scripts.shallow-candidates.forwardTarget.own.declared.parameters.map() callback` (L277-L280) - Function
  - `scripts.audit.code-shape.scripts.shallow-candidates.forwardTarget.own` (L277-L281) - Class
  - `scripts.audit.code-shape.scripts.shallow-candidates.findShallowCandidates.lazyFiles.toSorted() callback` (L495-L495) - Function
- `scripts/docs/generate-jobs.ts`
  - `scripts.docs.generate-jobs.then() callback` (L79-L81) - Function
- `scripts/docs/jobs-render.ts`
  - `scripts.docs.jobs-render.rest.every() callback` (L36-L36) - Function
  - `scripts.docs.jobs-render.renderCrontab` (L73-L76) - Class
  - `scripts.docs.jobs-render.renderCrontab.jobs.map() callback` (L75-L75) - Function
  - `scripts.docs.jobs-render.withJobScripts.insertAt` (L108-L109) - Class
  - `scripts.docs.jobs-render.withJobScripts.insertAt.kept.findIndex() callback` (L109-L109) - Function
- `scripts/ops/run-job.ts`
  - `scripts.ops.run-job.requestedJob.found` (L79-L79) - Class
  - `scripts.ops.run-job.requestedJob.found.find() callback` (L79-L79) - Function
- `scripts/scaffold/demo-remove-authorization.ts`
  - `scripts.scaffold.demo-remove-authorization.readRemovedAuthorization.subjects.removed.map() callback` (L52-L52) - Function
  - `scripts.scaffold.demo-remove-authorization.stripRoleGrants.out` (L70-L75) - Class
  - `scripts.scaffold.demo-remove-authorization.stripRoleGrants.out.lines.map() callback` (L70-L75) - Function
  - `scripts.scaffold.demo-remove-authorization.pruneCase.emptied` (L104-L106) - Class
  - `scripts.scaffold.demo-remove-authorization.pruneCase.emptied.lists.some() callback` (L105-L105) - Function
  - `scripts.scaffold.demo-remove-authorization.pruneCase.emptied.lists.some() callback.all.every() callback` (L105-L105) - Function
  - `scripts.scaffold.demo-remove-authorization.pruneCase.chunk.replaceAll() callback.kept` (L110-L113) - Class
  - `scripts.scaffold.demo-remove-authorization.pruneCase.chunk.replaceAll() callback.kept.map() callback` (L112-L112) - Function
  - `scripts.scaffold.demo-remove-authorization.pruneCase.chunk.replaceAll() callback.kept.filter() callback` (L113-L113) - Function
- `scripts/scaffold/demo-remove-validation-labels.ts`
  - `scripts.scaffold.demo-remove-validation-labels.contractsIn` (L26-L31) - Class
  - `scripts.scaffold.demo-remove-validation-labels.contractsIn.filter() callback` (L29-L29) - Function
  - `scripts.scaffold.demo-remove-validation-labels.contractsIn.map() callback` (L30-L30) - Function
  - `scripts.scaffold.demo-remove-validation-labels.requestFields` (L87-L98) - Class
  - `scripts.scaffold.demo-remove-validation-labels.requestFields.eachObject() callback` (L91-L96) - Function
  - `scripts.scaffold.demo-remove-validation-labels.anyFields` (L104-L111) - Class
  - `scripts.scaffold.demo-remove-validation-labels.anyFields.eachObject() callback` (L106-L109) - Function
  - `scripts.scaffold.demo-remove-validation-labels.readRemovedFields.surviving` (L127-L131) - Class
  - `scripts.scaffold.demo-remove-validation-labels.readRemovedFields.surviving.flatMap() callback` (L128-L129) - Function
  - `scripts.scaffold.demo-remove-validation-labels.readRemovedFields.removed` (L132-L132) - Class
  - `scripts.scaffold.demo-remove-validation-labels.readRemovedFields.removed.names.flatMap() callback` (L132-L132) - Function
- `src/modules/account/repository.ts`
  - `src.modules.account.repository.supersedeSession` (L194-L211) - Class
  - `src.modules.account.repository.supersedeSession.then() callback` (L211-L211) - Function
  - `src.modules.account.repository.FamilyActivity` (L314-L319) - Interface
- `src/modules/api-keys/repository.ts`
  - `src.modules.api-keys.repository.touchLastUsed` (L52-L56) - Class
  - `src.modules.api-keys.repository.touchLastUsed.then() callback` (L56-L56) - Function
- `src/modules/delivery/events.ts`
  - `src.modules.delivery.events.FulfillmentOrderDelayed` (L25-L42) - Interface
- `src/modules/locales/apps.ts`
  - `src.modules.locales.apps.extraFrontendApps` (L28-L32) - Class
  - `src.modules.locales.apps.extraFrontendApps.NODE_LOCALE_APPS_EXTRA.map() callback` (L29-L32) - Function
  - `src.modules.locales.apps.listApps` (L35-L46) - Class
  - `src.modules.locales.apps.listApps.rows.filter() callback` (L45-L45) - Function
  - `src.modules.locales.apps.frontendAppIds` (L49-L52) - Class
  - `src.modules.locales.apps.frontendAppIds.filter() callback` (L51-L51) - Function
  - `src.modules.locales.apps.frontendAppIds.map() callback` (L52-L52) - Function
  - `src.modules.locales.apps.isKnownApp` (L55-L55) - Class
  - `src.modules.locales.apps.isKnownApp.some() callback` (L55-L55) - Function
- `src/modules/locales/repository.ts`
  - `src.modules.locales.repository.EntryInput` (L36-L39) - Interface
  - `src.modules.locales.repository.ImportCounts` (L42-L46) - Interface
  - `src.modules.locales.repository.countEntriesByLocale` (L97-L107) - Class
  - `src.modules.locales.repository.countEntriesByLocale.then() callback` (L107-L107) - Function
  - `src.modules.locales.repository.countEntriesByLocale.then() callback.rows.map() callback` (L107-L107) - Function
  - `src.modules.locales.repository.listKeys` (L135-L141) - Class
  - `src.modules.locales.repository.listKeys.then() callback` (L141-L141) - Function
  - `src.modules.locales.repository.listKeys.then() callback.rows.map() callback` (L141-L141) - Function
  - `src.modules.locales.repository.importEntries.removedKeys` (L236-L236) - Class
  - `src.modules.locales.repository.importEntries.removedKeys.filter() callback` (L236-L236) - Function
  - `src.modules.locales.repository.importEntries.created` (L262-L262) - Class
  - `src.modules.locales.repository.importEntries.created.changedEntries.filter() callback` (L262-L262) - Function
  - `src.modules.locales.repository.LocaleCascadeCounts` (L278-L283) - Interface
  - `src.modules.locales.repository.removeEntityTranslations` (L481-L490) - Class
  - `src.modules.locales.repository.removeEntityTranslations.then() callback` (L490-L490) - Function
- `src/modules/users/model.ts`
  - `src.modules.users.model.DeliveredCodeState` (L167-L179) - Interface
  - `src.modules.users.model.TwoFactorMethodRecord` (L195-L210) - Interface
  - `src.modules.users.model.MfaReservation` (L216-L222) - Interface
  - `src.modules.users.model.OAuthAccount` (L229-L236) - Interface
  - `src.modules.users.model.userSchema.pre('save') callback.then() callback` (L638-L640) - Function
- `src/modules/users/two-factor-write.ts`
  - `src.modules.users.two-factor-write.TwoFactorWriteOptions` (L85-L92) - Interface
  - `src.modules.users.two-factor-write.accountChanges.paths` (L172-L177) - Class
  - `src.modules.users.two-factor-write.accountChanges.paths.filter() callback` (L175-L176) - Function
  - `src.modules.users.two-factor-write.planTwoFactorWrite.added.entries.filter() callback` (L201-L201) - Function
  - `src.modules.users.two-factor-write.planTwoFactorWrite.changed.entries.flatMap() callback` (L204-L204) - Function
  - `src.modules.users.two-factor-write.patched.entry.$mergeObjects.map() callback` (L265-L265) - Function
  - `src.modules.users.two-factor-write.methodsAfter.patchedKept.$map.in.$switch.branches.write.changed.map() callback` (L300-L304) - Function

### Product Materialisation & Locale Resolution Pipeline
The materialisation and localisation pipeline that turns abstract GRID_PRODUCTS entries into concrete, seedable product rows. fillerProductRows maps over FILLER_PRODUCTS and produces the final row objects (with IDs, slugs, prices, images) ready for repository seeding. The locales module provides the entity-localisation port that resolves per-locale field values for each product. TranslationPort in the kernel defines the contract for translation lookups. The locale routes expose messagesCache and publicLocaleCache so that localised product copy is served with appropriate HTTP caching. This group bridges the domain model → persistence → HTTP delivery path for localised product content.

**Related Classes/Methods**:

- `scenarios.products.fillerProductRows`:376-387
- `src.modules.locales.repository.resolveEntityFields`:346-377
- `src.kernel.translation.TranslationPort`:69-152
- `src.modules.locales.routes.messagesCache`:47-53

**Source Files:**

- `scenarios/flows/actions.ts`
  - `scenarios.flows.actions.cancelRemainder.then() callback.open.fulfillmentOrders.find() callback` (L316-L317) - Function
  - `scenarios.flows.actions.cancelRemainder.then() callback.open` (L316-L318) - Class
  - `scenarios.flows.actions.cancelRemainder.then() callback.open.fulfillmentOrders.find() callback.lines.some() callback` (L317-L317) - Function
  - `scenarios.flows.actions.replaceProductImage` (L379-L383) - Class
  - `scenarios.flows.actions.replaceProductImage.then() callback` (L382-L382) - Function
- `scenarios/products.ts`
  - `scenarios.products.fillerProductRows` (L376-L387) - Class
  - `scenarios.products.fillerProductRows.FILLER_PRODUCTS.map() callback` (L377-L386) - Function
- `scripts/audit/code-shape/scripts/shallow-candidates.ts`
  - `scripts.audit.code-shape.scripts.shallow-candidates.callArgumentsOf` (L144-L150) - Class
  - `scripts.audit.code-shape.scripts.shallow-candidates.callArgumentsOf.call.arguments.some() callback` (L147-L147) - Function
  - `scripts.audit.code-shape.scripts.shallow-candidates.collectUsage.record` (L180-L201) - Class
  - `scripts.audit.code-shape.scripts.shallow-candidates.collectUsage.record.symbol.declarations.some() callback` (L187-L187) - Function
  - `scripts.audit.code-shape.scripts.shallow-candidates.forwardTarget.passed` (L282-L287) - Class
  - `scripts.audit.code-shape.scripts.shallow-candidates.forwardTarget.passed.call.arguments.map() callback` (L282-L287) - Function
- `scripts/modules-on-disk.ts`
  - `scripts.modules-on-disk.filter() callback` (L28-L28) - Function
- `scripts/scaffold/demo-remove-authorization.ts`
  - `scripts.scaffold.demo-remove-authorization.readRemovedAuthorization.stillUsed` (L48-L48) - Class
  - `scripts.scaffold.demo-remove-authorization.readRemovedAuthorization.stillUsed.map() callback` (L48-L48) - Function
  - `scripts.scaffold.demo-remove-authorization.readRemovedAuthorization.keys.removed.map() callback` (L50-L50) - Function
  - `scripts.scaffold.demo-remove-authorization.pruneCase` (L94-L116) - Class
  - `scripts.scaffold.demo-remove-authorization.pruneCase.chunk.replaceAll() callback` (L109-L115) - Function
  - `scripts.scaffold.demo-remove-authorization.stripConformanceCases.headKept` (L130-L133) - Class
  - `scripts.scaffold.demo-remove-authorization.stripConformanceCases.headKept.filter() callback` (L132-L132) - Function
  - `scripts.scaffold.demo-remove-authorization.stripConformanceCases.casesKept` (L134-L137) - Class
  - `scripts.scaffold.demo-remove-authorization.stripConformanceCases.casesKept.map() callback` (L135-L135) - Function
  - `scripts.scaffold.demo-remove-authorization.stripConformanceCases.casesKept.filter() callback` (L136-L136) - Function
- `scripts/scaffold/demo-remove-scenarios.ts`
  - `scripts.scaffold.demo-remove-scenarios.removeShopOnlyScenarioFiles` (L55-L59) - Class
  - `scripts.scaffold.demo-remove-scenarios.removeShopOnlyScenarioFiles.SHOP_ONLY_FILES.map() callback` (L56-L59) - Function
- `scripts/scaffold/demo-remove-tests.ts`
  - `scripts.scaffold.demo-remove-tests.testRoots` (L18-L26) - Class
  - `scripts.scaffold.demo-remove-tests.testRoots.filter() callback` (L25-L25) - Function
  - `scripts.scaffold.demo-remove-tests.walkTypeScript` (L29-L34) - Class
  - `scripts.scaffold.demo-remove-tests.walkTypeScript.flatMap() callback` (L30-L34) - Function
  - `scripts.scaffold.demo-remove-tests.removeResidueTests.files` (L110-L110) - Class
  - `scripts.scaffold.demo-remove-tests.removeResidueTests.files.flatMap() callback` (L110-L110) - Function
  - `scripts.scaffold.demo-remove-tests.removeResidueTests.files.filter() callback` (L123-L123) - Function
- `scripts/scaffold/demo-remove-validation-labels.ts`
  - `scripts.scaffold.demo-remove-validation-labels.readRemovedFields` (L119-L135) - Class
  - `scripts.scaffold.demo-remove-validation-labels.readRemovedFields.filter() callback` (L134-L134) - Function
- `src/infrastructure/http/middlewares/cache.ts`
  - `src.infrastructure.http.middlewares.cache.CacheOptions` (L150-L213) - Interface
  - `src.infrastructure.http.middlewares.cache.setCache` (L523-L548) - Class
  - `src.infrastructure.http.middlewares.cache.setCache.<function>` (L528-L547) - Function
- `src/kernel/translation.ts`
  - `src.kernel.translation.TranslationPort` (L69-L152) - Interface
- `src/modules/account/model.ts`
  - `src.modules.account.model.VerificationTokenDocument` (L152-L164) - Interface
- `src/modules/account/repository.ts`
  - `src.modules.account.repository.removeSessionByHash` (L270-L274) - Class
  - `src.modules.account.repository.removeSessionByHash.then() callback` (L274-L274) - Function
- `src/modules/delivery/events.ts`
  - `src.modules.delivery.events.ShipmentEventPayload` (L17-L22) - Interface
- `src/modules/locales/module.ts`
  - `src.modules.locales.module.onRegistered` (L34-L60) - Class
  - `src.modules.locales.module.onRegistered.registerLocaleOverrideProvider() callback` (L38-L38) - Function
  - `src.modules.locales.module.onRegistered.readAll` (L53-L56) - Method
  - `src.modules.locales.module.onRegistered.readAll.then() callback` (L56-L56) - Function
  - `src.modules.locales.module.onRegistered.readAll.then() callback.rows.map() callback` (L56-L56) - Function
- `src/modules/locales/repository.ts`
  - `src.modules.locales.repository.importEntries.incoming` (L234-L234) - Class
  - `src.modules.locales.repository.importEntries.incoming.inputs.map() callback` (L234-L234) - Function
  - `src.modules.locales.repository.importEntries.changedEntries` (L239-L239) - Class
  - `src.modules.locales.repository.importEntries.changedEntries.filter() callback` (L239-L239) - Function
  - `src.modules.locales.repository.resolveEntityFields` (L346-L377) - Class
  - `src.modules.locales.repository.resolveEntityFields.then() callback` (L356-L377) - Function
  - `src.modules.locales.repository.removeEntityLocale` (L462-L472) - Class
  - `src.modules.locales.repository.removeEntityLocale.then() callback` (L472-L472) - Function
- `src/modules/locales/routes.ts`
  - `src.modules.locales.routes.messagesCache` (L47-L53) - Class
  - `src.modules.locales.routes.messagesCache.scopeKey` (L51-L52) - Method
  - `src.modules.locales.routes.publicLocaleCache` (L67-L73) - Class
  - `src.modules.locales.routes.publicLocaleCache.scopeKey` (L71-L72) - Method
- `src/modules/locales/services/entries.ts`
  - `src.modules.locales.services.entries.importEntries.inputs` (L227-L227) - Class
  - `src.modules.locales.services.entries.importEntries.inputs.entries.map() callback` (L227-L227) - Function
  - `src.modules.locales.services.entries.importEntries.survivors` (L251-L251) - Class
  - `src.modules.locales.services.entries.importEntries.survivors.stored.filter() callback` (L251-L251) - Function
- `src/modules/locales/services/keys.ts`
  - `src.modules.locales.services.keys.findUnsafeKeySegment` (L94-L95) - Class
  - `src.modules.locales.services.keys.findUnsafeKeySegment.find() callback` (L95-L95) - Function
- `src/modules/locales/services/messages.ts`
  - `src.modules.locales.services.messages.readMessages` (L31-L48) - Class
  - `src.modules.locales.services.messages.readMessages.then() callback` (L37-L47) - Function
  - `src.modules.locales.services.messages.readMessages.then() callback.then() callback` (L40-L45) - Function
  - `src.modules.locales.services.messages.readApiOverrides` (L60-L88) - Class
  - `src.modules.locales.services.messages.readApiOverrides.then() callback` (L61-L88) - Function
- `src/modules/locales/services/translations.ts`
  - `src.modules.locales.services.translations.clearOmittedInPayload` (L371-L382) - Class
  - `src.modules.locales.services.translations.clearOmittedInPayload.map() callback` (L376-L381) - Function
  - `src.modules.locales.services.translations.replaceEntityTranslations.checkedLocales` (L407-L407) - Class
  - `src.modules.locales.services.translations.replaceEntityTranslations.checkedLocales.existing.map() callback` (L407-L407) - Function
  - `src.modules.locales.services.translations.replaceEntityTranslations.deletions` (L410-L412) - Class
  - `src.modules.locales.services.translations.replaceEntityTranslations.deletions.filter() callback` (L411-L411) - Function
  - `src.modules.locales.services.translations.replaceEntityTranslations.deletions.map() callback` (L411-L411) - Function
- `src/modules/products/services/lookups.ts`
  - `src.modules.products.services.lookups.titlesOf.then() callback.map() callback` (L127-L127) - Function
- `src/modules/products/services/remove.ts`
  - `src.modules.products.services.remove.announceDeleted` (L34-L47) - Class
  - `src.modules.products.services.remove.announceDeleted.then() callback` (L40-L45) - Function
  - `src.modules.products.services.remove.announceDeleted.then() callback.announceInTransaction() callback` (L41-L45) - Function
- `src/modules/returns/module.ts`
  - `src.modules.returns.module.subscribe.onDomainEvent() callback` (L78-L79) - Function
