---
tags:
  - 2repo
  - 2repo/arch
  - project/boilerplate-node-backend
type: architecture
component: Static_Analysis_Rules_Contract_Artifact_Generation
---

```mermaid
graph LR
    Contract_Bundle_Orchestration_Test_Heap_Reporting["Contract Bundle Orchestration & Test/Heap Reporting"]
    Architectural_ESLint_Rules_AsyncAPI_Section_Merge["Architectural ESLint Rules & AsyncAPI Section Merge"]
    AsyncAPI_Type_Generation_Cross_Repo_Spec_Identity["AsyncAPI Type Generation & Cross-Repo Spec Identity"]
    Contract_Bundle_Orchestration_Test_Heap_Reporting -- "drives AsyncAPI section merge via bundle-registry dispatch" --> Architectural_ESLint_Rules_AsyncAPI_Section_Merge
    Architectural_ESLint_Rules_AsyncAPI_Section_Merge -- "supplies merged AsyncAPI contract as sole input to type generation" --> AsyncAPI_Type_Generation_Cross_Repo_Spec_Identity
    click Contract_Bundle_Orchestration_Test_Heap_Reporting href "/Contract_Bundle_Orchestration_Test_Heap_Reporting.md" "Details"
    click Architectural_ESLint_Rules_AsyncAPI_Section_Merge href "/Architectural_ESLint_Rules_AsyncAPI_Section_Merge.md" "Details"
    click AsyncAPI_Type_Generation_Cross_Repo_Spec_Identity href "/AsyncAPI_Type_Generation_Cross_Repo_Spec_Identity.md" "Details"
```

## Details

Enforces architectural ESLint rules (no hardcoded user text, no persistence imports) and drives contract artifact generation (bundle selection, AsyncAPI output building), with secondary mutation-baseline comparison and heap-summary reporting.

### Contract Bundle Orchestration & Test/Heap Reporting [[Expand]](./Contract_Bundle_Orchestration_Test_Heap_Reporting.md)
The composition root of the contract pipeline. It owns bundle selection (named vs. full run, --check staleness semantics, generated-vs-authored distinction) and drives the assembly of the committed bundles, including the opt-in client collections (Bruno/Insomnia/Mockoon/Postman) built from the committed OpenAPI contract plus per-module probes.ts and the demo dataset. It also carries the secondary reporting surface — test-result bucketing and heap-retainer/heap-summary reporting — that surfaces run health alongside the contract build.

**Related Classes/Methods**:

- `scripts.contracts.client-collections-bundle.allProbes`:260-261
- `scripts.report-test-results.Report`:65-71
- `scripts.run-mutation-tests.main`:78-124

**Source Files:**

- `scripts/build-contract-bundles.ts`
  - `scripts.build-contract-bundles.unknown` (L36-L36) - Class
  - `scripts.build-contract-bundles.unknown.named.filter() callback` (L36-L36) - Function
- `scripts/contracts/analytics-events-bundle.ts`
  - `scripts.contracts.analytics-events-bundle.assertSliceMatches.sliced` (L203-L203) - Class
  - `scripts.contracts.analytics-events-bundle.assertSliceMatches.sliced.map() callback` (L203-L203) - Function
- `scripts/contracts/client-collections-bundle.ts`
  - `scripts.contracts.client-collections-bundle.allProbes` (L260-L261) - Class
  - `scripts.contracts.client-collections-bundle.allProbes.requests.filter() callback` (L261-L261) - Function
  - `scripts.contracts.client-collections-bundle.contentFor` (L264-L269) - Class
  - `scripts.contracts.client-collections-bundle.contentFor.<function>` (L264-L269) - Function
- `scripts/report-heap-retainers.ts`
  - `scripts.report-heap-retainers.main.totalBytes` (L213-L213) - Class
  - `scripts.report-heap-retainers.main.totalBytes.targets.reduce() callback` (L213-L213) - Function
- `scripts/report-heap-summary.ts`
  - `scripts.report-heap-summary.streamArray('nodes') callback` (L131-L165) - Function
- `scripts/report-test-results.ts`
  - `scripts.report-test-results.SuiteResult` (L51-L63) - Interface
  - `scripts.report-test-results.Report` (L65-L71) - Interface
  - `scripts.report-test-results.Bucket` (L124-L129) - Interface
  - `scripts.report-test-results.labelWidth` (L274-L274) - Class
  - `scripts.report-test-results.labelWidth.covered.map() callback` (L274-L274) - Function
- `scripts/run-mutation-tests.ts`
  - `scripts.run-mutation-tests.main` (L78-L124) - Class
  - `scripts.run-mutation-tests.main.stryker.stdout.on('data') callback` (L99-L119) - Function
  - `scripts.run-mutation-tests.main.stryker.on('exit') callback` (L121-L123) - Function
- `src/app/demo.ts`
  - `src.app.demo.runDemoSeed` (L34-L43) - Class
  - `src.app.demo.runDemoSeed.then() callback.enabledModules.map() callback` (L38-L38) - Function
  - `src.app.demo.runDemoSeed.then() callback` (L41-L43) - Function
  - `src.app.demo.installDemo` (L45-L58) - Class
  - `src.app.demo.installDemo.app.post('/__demo/reset') callback` (L46-L53) - Function
  - `src.app.demo.installDemo.app.post('/__demo/reset') callback.then() callback` (L48-L48) - Function
  - `src.app.demo.installDemo.app.post('/__demo/reset') callback.catch() callback` (L49-L52) - Function
  - `src.app.demo.installDemo.app.get('/__demo/emails') callback` (L55-L57) - Function
- `src/app/telemetry.ts`
  - `src.app.telemetry.installTelemetry` (L23-L43) - Class
  - `src.app.telemetry.installTelemetry.app.use() callback` (L27-L42) - Function
  - `src.app.telemetry.installTelemetry.app.use() callback.response.once('finish') callback` (L30-L40) - Function
- `src/cluster.ts`
  - `src.cluster.process.on('SIGTERM') callback` (L158-L158) - Function
  - `src.cluster.process.on('SIGINT') callback` (L159-L159) - Function
- `src/infrastructure/adapters/mailer.ts`
  - `src.infrastructure.adapters.mailer.withSpan('email.send') callback.then() callback` (L191-L200) - Function
  - `src.infrastructure.adapters.mailer.EmailContent` (L248-L264) - Interface
  - `src.infrastructure.adapters.mailer.then() callback` (L289-L289) - Function
- `src/infrastructure/http/middlewares/request-logger.ts`
  - `src.infrastructure.http.middlewares.request-logger.requestLogger` (L10-L35) - Class
  - `src.infrastructure.http.middlewares.request-logger.requestLogger.response.once('finish') callback` (L14-L32) - Function
- `src/infrastructure/i18n/context.ts`
  - `src.infrastructure.i18n.context.LocaleContext` (L26-L29) - Interface
- `src/infrastructure/i18n/negotiate.ts`
  - `src.infrastructure.i18n.negotiate.negotiateLocale.lowercaseSupported` (L31-L31) - Class
  - `src.infrastructure.i18n.negotiate.negotiateLocale.lowercaseSupported.supported.map() callback` (L31-L31) - Function
  - `src.infrastructure.i18n.negotiate.negotiateLocale.candidates` (L33-L53) - Class
  - `src.infrastructure.i18n.negotiate.negotiateLocale.candidates.map() callback` (L35-L50) - Function
  - `src.infrastructure.i18n.negotiate.negotiateLocale.candidates.filter() callback` (L51-L51) - Function
  - `src.infrastructure.i18n.negotiate.negotiateLocale.candidates.toSorted() callback` (L53-L53) - Function
- `src/infrastructure/persistence/base-repository.ts`
  - `src.infrastructure.persistence.base-repository.createBaseRepository.deleteOne.then() callback` (L297-L297) - Function
  - `src.infrastructure.persistence.base-repository.createBaseRepository.search.then() callback` (L322-L328) - Function
- `src/kernel/events.ts`
  - `src.kernel.events.DomainEventMap` (L22-L22) - Interface
- `src/modules/account/model.ts`
  - `src.modules.account.model.AddressItem` (L19-L34) - Interface
  - `src.modules.account.model.AddressBookDocument` (L37-L42) - Interface
- `src/modules/account/services/addresses.ts`
  - `src.modules.account.services.addresses.AddressesView` (L26-L28) - Interface
  - `src.modules.account.services.addresses.toView.addresses.map() callback` (L43-L43) - Function
  - `src.modules.account.services.addresses.then() callback.book.items.find() callback` (L95-L95) - Function
- `src/modules/cart/model.ts`
  - `src.modules.cart.model.CartItem` (L32-L35) - Interface
- `src/modules/cart/services/checkout.ts`
  - `src.modules.cart.services.checkout.toStockLines` (L42-L43) - Class
  - `src.modules.cart.services.checkout.toStockLines.lines.map() callback` (L43-L43) - Function
  - `src.modules.cart.services.checkout.orderConfirm` (L85-L294) - Class
  - `src.modules.cart.services.checkout.orderConfirm.<function>` (L93-L268) - Function
  - `src.modules.cart.services.checkout.orderConfirm.<function>.then() callback` (L127-L267) - Function
  - `src.modules.cart.services.checkout.orderConfirm.<function>.then() callback.then() callback.joined` (L165-L165) - Class
  - `src.modules.cart.services.checkout.orderConfirm.<function>.then() callback.then() callback.joined.lines.filter() callback` (L165-L165) - Function
  - `src.modules.cart.services.checkout.orderConfirm.<function>.then() callback.then() callback.then() callback` (L197-L265) - Function
  - `src.modules.cart.services.checkout.orderConfirm.<function>.then() callback.then() callback.then() callback.then() callback` (L228-L264) - Function
  - `src.modules.cart.services.checkout.orderConfirm.<function>.then() callback.then() callback.then() callback.then() callback.then() callback` (L256-L262) - Function
  - `src.modules.cart.services.checkout.orderConfirm.catch() callback` (L269-L269) - Function
- `src/modules/cart/services/items.ts`
  - `src.modules.cart.services.items.cartRemove` (L207-L217) - Class
  - `src.modules.cart.services.items.cartRemove.then() callback` (L208-L216) - Function
- `src/modules/cart/services/view.ts`
  - `src.modules.cart.services.view.CartLine` (L24-L27) - Interface
  - `src.modules.cart.services.view.CartView` (L38-L41) - Interface
  - `src.modules.cart.services.view.PopulatedCart` (L50-L52) - Interface
  - `src.modules.cart.services.view.readCartLines` (L63-L76) - Class
  - `src.modules.cart.services.view.readCartLines.productIds` (L66-L66) - Class
  - `src.modules.cart.services.view.readCartLines.productIds.cart.items.map() callback` (L66-L66) - Function
  - `src.modules.cart.services.view.readCartLines.then() callback` (L69-L74) - Function
  - `src.modules.cart.services.view.readCartLines.then() callback.items.map() callback` (L70-L74) - Function
  - `src.modules.cart.services.view.toCartView` (L87-L101) - Class
  - `src.modules.cart.services.view.toCartView.then() callback` (L88-L101) - Function
  - `src.modules.cart.services.view.toCartView.then() callback.items.lines.map() callback` (L91-L94) - Function
- `src/modules/delivery/service.ts`
  - `src.modules.delivery.service.shipOrder.user` (L82-L82) - Class
  - `src.modules.delivery.service.shipOrder.user.catch() callback` (L82-L82) - Function
- `src/modules/inventory/service.ts`
  - `src.modules.inventory.service.StockLine` (L43-L46) - Interface
  - `src.modules.inventory.service.StockShortfall` (L49-L54) - Interface
  - `src.modules.inventory.service.MovementFilters` (L72-L75) - Interface
- `src/modules/orders/demo.ts`
  - `src.modules.orders.demo.seedOrdersCollection` (L138-L139) - Class
  - `src.modules.orders.demo.seedOrdersCollection.orderFixtures.map() callback` (L139-L139) - Function
- `src/modules/orders/emails.ts`
  - `src.modules.orders.emails.orderConfirmEmail.data.lines.order.items.map() callback` (L50-L55) - Function
  - `src.modules.orders.emails.invoiceDocument.lines.order.items.map() callback` (L88-L93) - Function
- `src/modules/products/model.ts`
  - `src.modules.products.model.ProductSnapshot` (L28-L37) - Interface
  - `src.modules.products.model.ProductDocument` (L42-L42) - Interface
- `src/modules/wishlist/service.ts`
  - `src.modules.wishlist.service.WishlistView` (L26-L28) - Interface
  - `src.modules.wishlist.service.toWishlistView.items.map() callback` (L32-L32) - Function

### Architectural ESLint Rules & AsyncAPI Section Merge [[Expand]](./Architectural_ESLint_Rules_AsyncAPI_Section_Merge.md)
The architectural-guard half of the subsystem. It defines the custom ESLint rules that encode the DDD layering invariants — no-persistence-imports (persistence handles/schema files stay behind the repository) and no-hardcoded-user-text (user-facing error copy must come from i18n). It also owns the AsyncAPI merge machinery that folds the per-section documents into the two scoped bundles (asyncapi.yaml / asyncapi.public.yaml) through the YAML AST with collision refusal, and the per-file mutation-baseline ratchet that turns Stryker's global thresholds into an actionable per-file gate.

**Related Classes/Methods**:

- `eslint.rules.no-persistence-imports.noPersistenceImports`:58-118

**Source Files:**

- `eslint/rules/no-hardcoded-user-text.ts`
  - `eslint.rules.no-hardcoded-user-text.noHardcodedUserText.create.CallExpression.errors` (L36-L38) - Class
  - `eslint.rules.no-hardcoded-user-text.noHardcodedUserText.create.CallExpression.errors.node.arguments.find() callback` (L37-L37) - Function
- `eslint/rules/no-persistence-imports.ts`
  - `eslint.rules.no-persistence-imports.noPersistenceImports` (L58-L118) - Class
  - `eslint.rules.no-persistence-imports.noPersistenceImports.create` (L89-L117) - Method
  - `eslint.rules.no-persistence-imports.noPersistenceImports.create.ImportDeclaration` (L95-L115) - Method
- `scripts/contracts/asyncapi-bundles.ts`
  - `scripts.contracts.asyncapi-bundles.marker` (L72-L77) - Class
  - `scripts.contracts.asyncapi-bundles.marker.sections.map() callback` (L76-L76) - Function
- `scripts/mutation-baseline.ts`
  - `scripts.mutation-baseline.formatRegressions.regressed` (L181-L181) - Class
  - `scripts.mutation-baseline.formatRegressions.regressed.comparisons.filter() callback` (L181-L181) - Function
- `scripts/run-demo-server.ts`
  - `scripts.run-demo-server.then() callback.process.once() callback` (L65-L70) - Function
  - `scripts.run-demo-server.then() callback.process.once() callback.catch() callback` (L68-L68) - Function
  - `scripts.run-demo-server.then() callback.process.once() callback.then() callback` (L69-L69) - Function
  - `scripts.run-demo-server.then() callback.then() callback.waitForDatabase() callback` (L81-L81) - Function
  - `scripts.run-demo-server.then() callback.then() callback` (L84-L88) - Function
- `src/infrastructure/adapters/cache.ts`
  - `src.infrastructure.adapters.cache.startCache` (L138-L138) - Class
  - `src.infrastructure.adapters.cache.startCache.then() callback` (L138-L138) - Function
- `src/infrastructure/adapters/image-signatures.ts`
  - `src.infrastructure.adapters.image-signatures.ImageSignature` (L23-L27) - Interface
  - `src.infrastructure.adapters.image-signatures.HEADER_LENGTH` (L58-L60) - Class
  - `src.infrastructure.adapters.image-signatures.HEADER_LENGTH.IMAGE_SIGNATURES.map() callback` (L59-L59) - Function
  - `src.infrastructure.adapters.image-signatures.identifyImage` (L68-L73) - Class
  - `src.infrastructure.adapters.image-signatures.identifyImage.IMAGE_SIGNATURES.find() callback` (L70-L72) - Function
  - `src.infrastructure.adapters.image-signatures.identifyImage.IMAGE_SIGNATURES.find() callback.signature.bytes.every() callback` (L72-L72) - Function
- `src/infrastructure/adapters/pdf.worker.ts`
  - `src.infrastructure.adapters.pdf.worker.handlePdfJob` (L19-L45) - Class
  - `src.infrastructure.adapters.pdf.worker.handlePdfJob.then() callback` (L37-L40) - Function
  - `src.infrastructure.adapters.pdf.worker.handlePdfJob.catch() callback` (L41-L44) - Function
- `src/infrastructure/adapters/queue.ts`
  - `src.infrastructure.adapters.queue.startQueue` (L173-L173) - Class
  - `src.infrastructure.adapters.queue.startQueue.then() callback` (L173-L173) - Function
- `src/infrastructure/persistence/base-repository.ts`
  - `src.infrastructure.persistence.base-repository.FindAllOptions` (L21-L26) - Interface
  - `src.infrastructure.persistence.base-repository.SearchSpec` (L38-L59) - Interface
  - `src.infrastructure.persistence.base-repository.PaginatedResult` (L145-L148) - Interface
  - `src.infrastructure.persistence.base-repository.BaseRepositoryOptions` (L150-L155) - Interface
- `src/infrastructure/persistence/search.ts`
  - `src.infrastructure.persistence.search.PaginationResult` (L17-L21) - Interface
  - `src.infrastructure.persistence.search.PaginatedMeta` (L23-L28) - Interface
- `src/infrastructure/persistence/serialize.ts`
  - `src.infrastructure.persistence.serialize.SerializeOptions` (L26-L40) - Interface
  - `src.infrastructure.persistence.serialize.SerializableSchema` (L50-L52) - Interface
  - `src.infrastructure.persistence.serialize.applySerialization` (L61-L94) - Class
  - `src.infrastructure.persistence.serialize.transform` (L65-L79) - Class
  - `src.infrastructure.persistence.serialize.applySerialization.transform.toString` (L68-L68) - Method
  - `src.infrastructure.persistence.serialize.applySerialization.transform` (L90-L90) - Method
- `src/modules/account/module.ts`
  - `src.modules.account.module.<function>.then() callback` (L37-L37) - Function
- `src/modules/audit-logs/model.ts`
  - `src.modules.audit-logs.model.AuditLogDocument` (L39-L41) - Interface
  - `src.modules.audit-logs.model.applyAuditLogTransform` (L170-L177) - Class
  - `src.modules.audit-logs.model.applyAuditLogTransform.after` (L173-L176) - Method
- `src/modules/audit-logs/service.ts`
  - `src.modules.audit-logs.service.record` (L29-L39) - Class
  - `src.modules.audit-logs.service.record.catch() callback` (L30-L38) - Function
- `src/modules/cart/domain/rules.ts`
  - `src.modules.cart.domain.rules.CartLineCandidate` (L7-L18) - Interface
  - `src.modules.cart.domain.rules.CheckoutShortfall` (L21-L26) - Interface
  - `src.modules.cart.domain.rules.evaluateCheckout` (L67-L86) - Class
  - `src.modules.cart.domain.rules.evaluateCheckout.lines.some() callback` (L69-L69) - Function
  - `src.modules.cart.domain.rules.shortfalls` (L75-L82) - Class
  - `src.modules.cart.domain.rules.evaluateCheckout.shortfalls.lines.filter() callback` (L76-L76) - Function
  - `src.modules.cart.domain.rules.evaluateCheckout.shortfalls.map() callback` (L77-L82) - Function
- `src/modules/cart/services/checkout.ts`
  - `src.modules.cart.services.checkout.orderConfirm.<function>.then() callback.then() callback` (L133-L266) - Function
- `src/modules/orders/domain/lifecycle.ts`
  - `src.modules.orders.domain.lifecycle.statusesLeadingTo` (L91-L92) - Class
  - `src.modules.orders.domain.lifecycle.statusesLeadingTo.filter() callback` (L92-L92) - Function
- `src/modules/orders/domain/totals.ts`
  - `src.modules.orders.domain.totals.LineItem` (L29-L33) - Interface
  - `src.modules.orders.domain.totals.LineItemTotals` (L35-L42) - Interface
  - `src.modules.orders.domain.totals.OrderTotalInput` (L69-L76) - Interface
- `src/modules/orders/model.ts`
  - `src.modules.orders.model.OrderDocumentItem` (L19-L29) - Interface
  - `src.modules.orders.model.OrderDocument` (L43-L66) - Interface
  - `src.modules.orders.model.applyOrderTransform` (L235-L240) - Class
  - `src.modules.orders.model.applyOrderTransform.after` (L236-L239) - Method
- `src/modules/orders/service.ts`
  - `src.modules.orders.service.create.then() callback.then() callback.outcome` (L175-L181) - Class
  - `src.modules.orders.service.create.then() callback.then() callback.outcome.resolvedItems.map() callback` (L177-L180) - Function
- `src/modules/products/service.ts`
  - `src.modules.products.service.getByIdViewed` (L128-L141) - Class
  - `src.modules.products.service.getByIdViewed.then() callback` (L133-L141) - Function
  - `src.modules.products.service.remove` (L262-L282) - Class
  - `src.modules.products.service.remove.then() callback` (L281-L281) - Function
  - `src.modules.products.service.removeById` (L291-L298) - Class
  - `src.modules.products.service.removeById.then() callback` (L295-L298) - Function

### AsyncAPI Type Generation & Cross-Repo Spec Identity [[Expand]](./AsyncAPI_Type_Generation_Cross_Repo_Spec_Identity.md)
The typed-artifact and cross-repo consistency half of the pipeline. It generates the TypeScript realtime contract types from the merged asyncapi.yaml — walking channels, messages and $ref-ed JSON schemas to emit payload interfaces, message aliases, per-namespace channel constants/unions and SSE event maps into src/types/asyncapi.generated.ts, with a --check mode that fails when the committed types no longer match the contract. It also enforces cross-repo identity (not equivalence) of the shared contract files between this backend and the paired frontend, so a one-line spec edit cannot silently fork what both sides believe they share.

**Related Classes/Methods**:

- `scripts.generate-asyncapi-types.AsyncApiDocument`:55-60
- `scripts.generate-asyncapi-types.channelNamespaceBlocks`:354-356
- `scripts.mutation-baseline.MutationReport`:38-40

**Source Files:**

- `eslint/rules/no-persistence-imports.ts`
  - `eslint.rules.no-persistence-imports.noPersistenceImports.create.ImportDeclaration.name.find() callback` (L109-L110) - Function
  - `eslint.rules.no-persistence-imports.noPersistenceImports.create.ImportDeclaration.name` (L109-L111) - Class
  - `eslint.rules.no-persistence-imports.noPersistenceImports.create.ImportDeclaration.name.find() callback.bindings.some() callback` (L110-L110) - Function
- `scripts/build-contract-bundles.ts`
  - `scripts.build-contract-bundles.CONTRACT_BUNDLES.map() callback` (L40-L40) - Function
  - `scripts.build-contract-bundles.bundle.stale` (L51-L51) - Class
  - `scripts.build-contract-bundles.bundle.stale.bundles.filter() callback` (L51-L51) - Function
  - `scripts.build-contract-bundles.stale.map() callback` (L129-L129) - Function
- `scripts/generate-asyncapi-types.ts`
  - `scripts.generate-asyncapi-types.AsyncApiOperation` (L27-L31) - Interface
  - `scripts.generate-asyncapi-types.AsyncApiChannel` (L33-L36) - Interface
  - `scripts.generate-asyncapi-types.AsyncApiMessage` (L38-L40) - Interface
  - `scripts.generate-asyncapi-types.JsonSchema` (L42-L53) - Interface
  - `scripts.generate-asyncapi-types.AsyncApiDocument` (L55-L60) - Interface
  - `scripts.generate-asyncapi-types.renderPayloadMap.rows` (L266-L270) - Class
  - `scripts.generate-asyncapi-types.renderPayloadMap.rows.entries.map() callback` (L268-L268) - Function
  - `scripts.generate-asyncapi-types.channelNamespaceBlocks` (L354-L356) - Class
  - `scripts.generate-asyncapi-types.channelNamespaceBlocks.map() callback` (L355-L355) - Function
  - `scripts.generate-asyncapi-types.then() callback` (L424-L449) - Function
  - `scripts.generate-asyncapi-types.catch() callback` (L450-L453) - Function
- `scripts/mutation-baseline.ts`
  - `scripts.mutation-baseline.MutationReport` (L38-L40) - Interface
  - `scripts.mutation-baseline.MutationBaseline` (L42-L47) - Interface
  - `scripts.mutation-baseline.FileComparison` (L51-L56) - Interface
  - `scripts.mutation-baseline.scoresFromReport.killed` (L82-L82) - Class
  - `scripts.mutation-baseline.scoresFromReport.killed.scored.filter() callback` (L82-L82) - Function
- `scripts/report-test-results.ts`
  - `scripts.report-test-results.suite.assertionResults.filter() callback` (L139-L139) - Function
- `scripts/run-demo-server.ts`
  - `scripts.run-demo-server.waitForDatabase` (L41-L56) - Class
  - `scripts.run-demo-server.waitForDatabase.<function>` (L42-L56) - Function
  - `scripts.run-demo-server.then() callback` (L59-L89) - Function
  - `scripts.run-demo-server.catch() callback` (L90-L93) - Function
- `scripts/spec-identity.ts`
  - `scripts.spec-identity.compareSharedFiles` (L144-L173) - Class
  - `scripts.spec-identity.compareSharedFiles.SHARED_FILES.map() callback` (L149-L173) - Function
- `scripts/sync-shared-files-to-frontend.ts`
  - `scripts.sync-shared-files-to-frontend.Outcome` (L74-L78) - Interface
  - `scripts.sync-shared-files-to-frontend.outcomes` (L80-L95) - Class
  - `scripts.sync-shared-files-to-frontend.outcomes.SHARED_FILES.map() callback` (L80-L95) - Function
  - `scripts.sync-shared-files-to-frontend.of` (L99-L99) - Class
  - `scripts.sync-shared-files-to-frontend.of.outcomes.filter() callback` (L99-L99) - Function
- `src/cluster.ts`
  - `src.cluster.cluster.on('exit') callback.recentCrashes` (L140-L140) - Class
  - `src.cluster.cluster.on('exit') callback.recentCrashes.crashHistory.filter() callback` (L140-L140) - Function
- `src/infrastructure/adapters/demo-outbox.ts`
  - `src.infrastructure.adapters.demo-outbox.DemoOutboxEmail` (L18-L26) - Interface
  - `src.infrastructure.adapters.demo-outbox.recordDemoEmail.lines.filter() callback` (L50-L50) - Function
  - `src.infrastructure.adapters.demo-outbox.recordDemoEmail.lines.map() callback` (L51-L51) - Function
- `src/infrastructure/adapters/logger.ts`
  - `src.infrastructure.adapters.logger.redactSensitiveFields` (L59-L79) - Class
  - `src.infrastructure.adapters.logger.redactSensitiveFields.input.map() callback` (L62-L62) - Function
  - `src.infrastructure.adapters.logger.redactFormat` (L114-L129) - Class
  - `src.infrastructure.adapters.logger.redactFormat.winston.format() callback` (L114-L129) - Function
  - `src.infrastructure.adapters.logger.prettyFormat` (L166-L179) - Class
  - `src.infrastructure.adapters.logger.prettyFormat.winston.format.printf() callback` (L172-L178) - Function
- `src/infrastructure/adapters/storage.ts`
  - `src.infrastructure.adapters.storage.storeUploadedImages.then() callback.failed` (L350-L350) - Class
  - `src.infrastructure.adapters.storage.storeUploadedImages.then() callback.failed.results.find() callback` (L350-L350) - Function
- `src/infrastructure/http/request.ts`
  - `src.infrastructure.http.request.readInput.undecoded` (L285-L285) - Class
  - `src.infrastructure.http.request.readInput.undecoded.stated.find() callback` (L285-L285) - Function
- `src/modules/account/demo.ts`
  - `src.modules.account.demo.seedAddressBooksCollection` (L110-L111) - Class
  - `src.modules.account.demo.seedAddressBooksCollection.addressBookFixtures.map() callback` (L111-L111) - Function
- `src/modules/account/module.ts`
  - `src.modules.account.module.resolve` (L35-L49) - Class
  - `src.modules.account.module.resolve.<function>` (L35-L49) - Function
  - `src.modules.account.module.resolve.<function>.then() callback` (L39-L48) - Function
- `src/modules/feedback/controllers/put-feedback-status.ts`
  - `src.modules.feedback.controllers.put-feedback-status.putFeedbackStatus` (L23-L39) - Class
  - `src.modules.feedback.controllers.put-feedback-status.putFeedbackStatus.then() callback` (L34-L37) - Function
- `src/modules/products/demo.ts`
  - `src.modules.products.demo.seedProductById.product` (L148-L148) - Class
  - `src.modules.products.demo.seedProductById.product.productFixtures.find() callback` (L148-L148) - Function
