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
    Combinatorial_Catalogue_Generator_Flow_Data_Model -- "Supplies product volume and locale-entry seed data; drives locale-entry edits over HTTP" --> Product_Materialisation_Locale_Resolution_Pipeline
    Product_Materialisation_Locale_Resolution_Pipeline -- "Consumes the response-envelope contract for HTTP replies and the i18n catalog for filesystem-backed locale dictionaries" --> Asset_Delivery_Response_Envelope
```

## Details

The catalogue-generation pillar. It defines the combinatorial product model — AnimalLine (species/line), FillerCopy (marketing copy variants), Tier (price/quality tier), ProductType (physical/digital/service) — and the GRID_PRODUCTS matrix that cross-multiplies them into a full filler catalogue. fillerProductRows materialises the grid into concrete product rows ready for seeding. The group also carries the locale-entry edit driver (driveLocaleEntryEdit) that localises each filler product, and the flow data structures (CartSummaryData, CheckoutData, Line) that the filler products flow through during cart/checkout scenario steps. This is the volume layer: it is what gives the demo shop its realistic product count without hand-authoring every SKU.

### Asset Delivery & Response Envelope
The asset-delivery and response-envelope layer that wraps product media (images, PDFs) and locale resources in the standard HTTP response contract. image-signatures canonicalises MIME types and enforces header-length limits for product image delivery. The pdf adapter guards against non-data requests and produces invoice/receipt PDFs that flow products pass through at checkout. The response module defines the four response shapes (Success, Reject, Neutral, ErrorItem) and the normalizeErrors helper that every scenario action uses to shape its HTTP reply. i18n.catalog loads locale resource bundles and lists supported locales, feeding the localisation pipeline. This group is the transport boundary: it controls how product assets and locale resources are packaged and delivered over HTTP.

**Related Classes/Methods**:

- `src.infrastructure.http.response.normalizeErrors`:210-238
- `src.infrastructure.adapters.image-signatures.CANONICAL_MIME_BY_ALIAS`:76-80
- `src.infrastructure.adapters.pdf.refuseNonDataRequest`:212-218
- `src.infrastructure.i18n.catalog.loadLocaleResources`:159-165

**Source Files:**

- `scenarios/flows/actions.ts`
  - `scenarios.flows.actions.softDeleteOrder` (L258-L259) - Class
  - `scenarios.flows.actions.softDeleteOrder.then() callback` (L259-L259) - Function
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
  - `src.infrastructure.adapters.ssrf-guard.resolveSafeOutboundTarget.then() callback.then() callback.unsafe` (L283-L285) - Class
  - `src.infrastructure.adapters.ssrf-guard.resolveSafeOutboundTarget.then() callback.then() callback.unsafe.addresses.find() callback` (L285-L285) - Function
- `src/infrastructure/http/request.ts`
  - `src.infrastructure.http.request.readInput.sources.map() callback` (L222-L223) - Function
  - `src.infrastructure.http.request.readInput.sources` (L222-L224) - Class
  - `src.infrastructure.http.request.readInput.stated` (L254-L256) - Class
  - `src.infrastructure.http.request.readInput.stated.sources.map() callback` (L255-L255) - Function
  - `src.infrastructure.http.request.readInput.stated.filter() callback` (L256-L256) - Function
  - `src.infrastructure.http.request.readInput.undecoded` (L260-L260) - Class
  - `src.infrastructure.http.request.readInput.undecoded.stated.find() callback` (L260-L260) - Function
- `src/infrastructure/http/response.ts`
  - `src.infrastructure.http.response.ResponseNeutral` (L20-L27) - Interface
  - `src.infrastructure.http.response.ResponseSuccess` (L32-L39) - Interface
  - `src.infrastructure.http.response.ResponseErrorItem` (L42-L54) - Interface
  - `src.infrastructure.http.response.ResponseReject` (L60-L69) - Interface
  - `src.infrastructure.http.response.normalizeErrors` (L210-L238) - Class
  - `src.infrastructure.http.response.normalizeErrors.inputErrors.map() callback` (L219-L237) - Function
- `src/infrastructure/i18n/catalog.ts`
  - `src.infrastructure.i18n.catalog.listSupportedLocales` (L55-L70) - Class
  - `src.infrastructure.i18n.catalog.listSupportedLocales.filter() callback` (L65-L65) - Function
  - `src.infrastructure.i18n.catalog.listSupportedLocales.map() callback` (L66-L66) - Function
  - `src.infrastructure.i18n.catalog.loadLocaleResources` (L159-L165) - Class
  - `src.infrastructure.i18n.catalog.loadLocaleResources.map() callback` (L161-L164) - Function
- `src/infrastructure/runtime/busy.ts`
  - `src.infrastructure.runtime.busy.ServiceBusyError` (L13-L19) - Class
  - `src.infrastructure.runtime.busy.ServiceBusyError.constructor` (L15-L18) - Constructor
- `src/modules/locales/repository.ts`
  - `src.modules.locales.repository.deleteLocaleCascade` (L301-L307) - Class
  - `src.modules.locales.repository.deleteLocaleCascade.then() callback` (L305-L306) - Function
  - `src.modules.locales.repository.deleteLocaleCascade.then() callback.then() callback` (L306-L306) - Function
  - `src.modules.locales.repository.findEntityIdsByFieldMatch` (L394-L411) - Class
  - `src.modules.locales.repository.findEntityIdsByFieldMatch.$or.fields.map() callback` (L404-L406) - Function
  - `src.modules.locales.repository.findEntityIdsByFieldMatch.then() callback` (L411-L411) - Function
  - `src.modules.locales.repository.findEntityIdsByFieldMatch.then() callback.rows.map() callback` (L411-L411) - Function
- `src/modules/locales/services/capabilities.ts`
  - `src.modules.locales.services.capabilities.mergeCapabilities` (L101-L125) - Class
  - `src.modules.locales.services.capabilities.mergeCapabilities.toSorted() callback` (L124-L124) - Function
  - `src.modules.locales.services.capabilities.readDynamicTier` (L132-L152) - Class
  - `src.modules.locales.services.capabilities.readDynamicTier.then() callback` (L144-L144) - Function
  - `src.modules.locales.services.capabilities.readDynamicTier.catch() callback` (L145-L152) - Function
  - `src.modules.locales.services.capabilities.listCapabilities` (L168-L173) - Class
  - `src.modules.locales.services.capabilities.listCapabilities.then() callback` (L169-L173) - Function
- `src/modules/locales/services/entries.ts`
  - `src.modules.locales.services.entries.importEntries.keys` (L209-L209) - Class
  - `src.modules.locales.services.entries.importEntries.keys.inputs.map() callback` (L209-L209) - Function
- `src/modules/locales/services/translations.ts`
  - `src.modules.locales.services.translations.planSlot.planFields.unknownField` (L110-L112) - Class
  - `src.modules.locales.services.translations.planSlot.planFields.unknownField.find() callback` (L111-L111) - Function
  - `src.modules.locales.services.translations.writePlannedTranslations.fallbackWrite` (L244-L247) - Class
  - `src.modules.locales.services.translations.writePlannedTranslations.fallbackWrite.planned.find() callback` (L245-L246) - Function

### Combinatorial Catalogue Generator & Flow Data Model
The core generation engine of the filler catalogue. It defines four orthogonal product dimensions (AnimalLine, FillerCopy, Tier, ProductType) and cross-multiplies them in the GRID_PRODUCTS matrix to produce a deterministic, exhaustive set of FillerProduct entries. The driveLocaleEntryEdit driver localises each generated product by walking its locale entries and applying per-locale copy overrides. Flow data structures (CartSummaryData, CheckoutData, Line, PaymentData) define the shape that filler products assume as they move through cart-addition, checkout, and payment scenario steps. This group is the single source of truth for product volume: every SKU in the demo shop is derived from this combinatorial model rather than hand-authored.

**Related Classes/Methods**:

- `scenarios.products-filler.GRID_PRODUCTS`:236-261
- `scenarios.locales.driveLocaleEntryEdit`:247-252

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
  - `scenarios.flows.actions.deliverOrder` (L223-L224) - Class
  - `scenarios.flows.actions.deliverOrder.then() callback` (L224-L224) - Function
  - `scenarios.flows.actions.cancelOrder` (L230-L233) - Class
  - `scenarios.flows.actions.cancelOrder.then() callback` (L233-L233) - Function
- `scenarios/locales.ts`
  - `scenarios.locales.driveLocaleEntryEdit` (L247-L252) - Class
  - `scenarios.locales.driveLocaleEntryEdit.then() callback` (L252-L252) - Function
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
  - `scenarios.run-server.waitUntilListening.poll` (L155-L163) - Class
  - `scenarios.run-server.poll.then() callback` (L157-L157) - Function
  - `scenarios.run-server.waitUntilListening.poll.then() callback` (L158-L162) - Function
  - `scenarios.run-server.then() callback.process.once() callback.catch() callback` (L178-L182) - Function
  - `scenarios.run-server.then() callback.process.once() callback.then() callback` (L183-L183) - Function
  - `scenarios.run-server.then() callback.then() callback` (L240-L242) - Function
  - `scenarios.run-server.catch() callback` (L244-L247) - Function
- `src/modules/api-keys/repository.ts`
  - `src.modules.api-keys.repository.touchLastUsed` (L52-L56) - Class
  - `src.modules.api-keys.repository.touchLastUsed.then() callback` (L56-L56) - Function
- `src/modules/locales/repository.ts`
  - `src.modules.locales.repository.EntryInput` (L36-L39) - Interface
  - `src.modules.locales.repository.ImportCounts` (L42-L46) - Interface
  - `src.modules.locales.repository.countEntriesByLocale` (L97-L107) - Class
  - `src.modules.locales.repository.countEntriesByLocale.then() callback` (L107-L107) - Function
  - `src.modules.locales.repository.countEntriesByLocale.then() callback.rows.map() callback` (L107-L107) - Function
  - `src.modules.locales.repository.listKeys` (L139-L145) - Class
  - `src.modules.locales.repository.listKeys.then() callback` (L145-L145) - Function
  - `src.modules.locales.repository.listKeys.then() callback.rows.map() callback` (L145-L145) - Function
  - `src.modules.locales.repository.importEntries.removedKeys` (L240-L240) - Class
  - `src.modules.locales.repository.importEntries.removedKeys.filter() callback` (L240-L240) - Function
  - `src.modules.locales.repository.importEntries.created` (L266-L266) - Class
  - `src.modules.locales.repository.importEntries.created.changedEntries.filter() callback` (L266-L266) - Function
  - `src.modules.locales.repository.LocaleCascadeCounts` (L282-L287) - Interface
  - `src.modules.locales.repository.removeEntityTranslations` (L484-L488) - Class
  - `src.modules.locales.repository.removeEntityTranslations.then() callback` (L488-L488) - Function
- `src/modules/locales/tenants.ts`
  - `src.modules.locales.tenants.extraFrontendTenants` (L28-L32) - Class
  - `src.modules.locales.tenants.extraFrontendTenants.NODE_LOCALE_TENANTS_EXTRA.map() callback` (L29-L32) - Function
  - `src.modules.locales.tenants.listTenants` (L35-L46) - Class
  - `src.modules.locales.tenants.listTenants.rows.filter() callback` (L45-L45) - Function
  - `src.modules.locales.tenants.frontendTenantIds` (L49-L52) - Class
  - `src.modules.locales.tenants.frontendTenantIds.filter() callback` (L51-L51) - Function
  - `src.modules.locales.tenants.frontendTenantIds.map() callback` (L52-L52) - Function
  - `src.modules.locales.tenants.isKnownTenant` (L55-L55) - Class
  - `src.modules.locales.tenants.isKnownTenant.some() callback` (L55-L55) - Function
- `src/modules/users/model.ts`
  - `src.modules.users.model.TokenType` (L31-L36) - Enum
  - `src.modules.users.model.Token` (L66-L108) - Interface
  - `src.modules.users.model.DeliveredCodeState` (L226-L238) - Interface
  - `src.modules.users.model.TwoFactorMethodRecord` (L248-L263) - Interface
  - `src.modules.users.model.MfaReservation` (L269-L275) - Interface
  - `src.modules.users.model.OAuthAccount` (L282-L289) - Interface
  - `src.modules.users.model.UserMethods` (L309-L321) - Interface
  - `src.modules.users.model.userSchema.pre('save') callback.then() callback` (L761-L763) - Function
  - `src.modules.users.model.tokenAdd.then() callback` (L798-L804) - Function
  - `src.modules.users.model.tokenRemoveAll.then() callback` (L813-L819) - Function
  - `src.modules.users.model.tokenRemoveAll.then() callback.tokens.filter() callback` (L818-L818) - Function

### Product Materialisation & Locale Resolution Pipeline
The materialisation and localisation pipeline that turns abstract GRID_PRODUCTS entries into concrete, seedable product rows. fillerProductRows maps over FILLER_PRODUCTS and produces the final row objects (with IDs, slugs, prices, images) ready for repository seeding. The locales module provides the entity-localisation port that resolves per-locale field values for each product. TranslationPort in the kernel defines the contract for translation lookups. The locale routes expose messagesCache and publicLocaleCache so that localised product copy is served with appropriate HTTP caching. This group bridges the domain model → persistence → HTTP delivery path for localised product content.

**Related Classes/Methods**:

- `scenarios.products.fillerProductRows`:348-359
- `src.modules.locales.repository.resolveEntityFields`:350-381
- `src.kernel.translation.TranslationPort`:70-152
- `src.modules.locales.routes.messagesCache`:47-53

**Source Files:**

- `scenarios/flows/actions.ts`
  - `scenarios.flows.actions.replaceProductImage` (L278-L282) - Class
  - `scenarios.flows.actions.replaceProductImage.then() callback` (L281-L281) - Function
- `scenarios/products.ts`
  - `scenarios.products.fillerProductRows` (L348-L359) - Class
  - `scenarios.products.fillerProductRows.FILLER_PRODUCTS.map() callback` (L349-L358) - Function
- `src/infrastructure/http/middlewares/cache.ts`
  - `src.infrastructure.http.middlewares.cache.CacheOptions` (L150-L213) - Interface
  - `src.infrastructure.http.middlewares.cache.setCache` (L523-L548) - Class
  - `src.infrastructure.http.middlewares.cache.setCache.<function>` (L528-L547) - Function
- `src/kernel/translation.ts`
  - `src.kernel.translation.TranslationPort` (L70-L152) - Interface
- `src/modules/locales/module.ts`
  - `src.modules.locales.module.onRegistered` (L34-L60) - Class
  - `src.modules.locales.module.onRegistered.registerLocaleOverrideProvider() callback` (L38-L38) - Function
  - `src.modules.locales.module.onRegistered.readAll` (L53-L56) - Method
  - `src.modules.locales.module.onRegistered.readAll.then() callback` (L56-L56) - Function
  - `src.modules.locales.module.onRegistered.readAll.then() callback.rows.map() callback` (L56-L56) - Function
- `src/modules/locales/repository.ts`
  - `src.modules.locales.repository.importEntries.incoming` (L238-L238) - Class
  - `src.modules.locales.repository.importEntries.incoming.inputs.map() callback` (L238-L238) - Function
  - `src.modules.locales.repository.importEntries.changedEntries` (L243-L243) - Class
  - `src.modules.locales.repository.importEntries.changedEntries.filter() callback` (L243-L243) - Function
  - `src.modules.locales.repository.resolveEntityFields` (L350-L381) - Class
  - `src.modules.locales.repository.resolveEntityFields.then() callback` (L360-L381) - Function
  - `src.modules.locales.repository.removeEntityLocale` (L466-L476) - Class
  - `src.modules.locales.repository.removeEntityLocale.then() callback` (L476-L476) - Function
- `src/modules/locales/routes.ts`
  - `src.modules.locales.routes.messagesCache` (L47-L53) - Class
  - `src.modules.locales.routes.messagesCache.scopeKey` (L51-L52) - Method
  - `src.modules.locales.routes.publicLocaleCache` (L67-L73) - Class
  - `src.modules.locales.routes.publicLocaleCache.scopeKey` (L71-L72) - Method
- `src/modules/locales/services/entries.ts`
  - `src.modules.locales.services.entries.importEntries.inputs` (L208-L208) - Class
  - `src.modules.locales.services.entries.importEntries.inputs.entries.map() callback` (L208-L208) - Function
  - `src.modules.locales.services.entries.importEntries.survivors` (L232-L232) - Class
  - `src.modules.locales.services.entries.importEntries.survivors.stored.filter() callback` (L232-L232) - Function
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
  - `src.modules.locales.services.translations.clearOmittedInPayload` (L373-L384) - Class
  - `src.modules.locales.services.translations.clearOmittedInPayload.map() callback` (L378-L383) - Function
  - `src.modules.locales.services.translations.replaceEntityTranslations.checkedLocales` (L409-L409) - Class
  - `src.modules.locales.services.translations.replaceEntityTranslations.checkedLocales.existing.map() callback` (L409-L409) - Function
  - `src.modules.locales.services.translations.replaceEntityTranslations.deletions` (L412-L414) - Class
  - `src.modules.locales.services.translations.replaceEntityTranslations.deletions.filter() callback` (L413-L413) - Function
  - `src.modules.locales.services.translations.replaceEntityTranslations.deletions.map() callback` (L413-L413) - Function
