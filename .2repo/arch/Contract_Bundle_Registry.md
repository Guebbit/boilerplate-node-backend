---
tags:
  - 2repo
  - 2repo/arch
  - project/boilerplate-node-backend
type: architecture
component: Contract_Bundle_Registry
---

```mermaid
graph LR
    Contract_Verification_Cross_Repo_Identity_Guard["Contract Verification & Cross-Repo Identity Guard"]
    Bundle_Registry_Build_Orchestration["Bundle Registry & Build Orchestration"]
    Contract_Type_Graph_Derivation["Contract Type & Graph Derivation"]
    Bundle_Registry_Build_Orchestration -- "Supplies committed bundles as derivation inputs" --> Contract_Type_Graph_Derivation
    Bundle_Registry_Build_Orchestration -- "Supplies committed artefacts for identity hashing and Prism validation" --> Contract_Verification_Cross_Repo_Identity_Guard
    Contract_Type_Graph_Derivation -- "Orchestrates frontend sync as terminal pipeline step" --> Contract_Verification_Cross_Repo_Identity_Guard
    click Contract_Verification_Cross_Repo_Identity_Guard href "./Contract_Verification_Cross_Repo_Identity_Guard.md" "Details"
    click Bundle_Registry_Build_Orchestration href "./Bundle_Registry_Build_Orchestration.md" "Details"
    click Contract_Type_Graph_Derivation href "./Contract_Type_Graph_Derivation.md" "Details"
```

## Details

The single source of truth for every contract document the repo publishes — the bundle registry (CONTRACT_BUNDLES), the bundle kind taxonomy (authored vs. generated), the per-bundle definitions (OpenAPI, AsyncAPI, AsyncAPI-public, Bruno, Insomnia, Mockoon, Postman), and the build/check CLI (build-contract-bundles) that assembles fragments into committed bundles and verifies staleness.

### Contract Verification & Cross-Repo Identity Guard [[Expand]](./Contract_Verification_Cross_Repo_Identity_Guard.md)
The verification layer that ensures contract integrity across the repository boundary and over time. It hash-compares shared contract files between this repo and the paired frontend (spec-identity), syncs shared files to the frontend when they drift, validates the committed OpenAPI contract against a live Prism mock server, tracks mutation-testing baselines to detect coverage regressions, and reports test-suite performance. This is the guard that makes the contract a verifiable, not just a published, artefact.

**Related Classes/Methods**:

- `scripts.spec-identity.compareSharedFiles`:134-163
- `scripts.sync-shared-files-to-frontend.outcomes`:80-95
- `scripts.report-test-results.covered`:270-272

**Source Files:**

- `scripts/check-mutation-baseline.ts`
  - `scripts.check-mutation-baseline.map() callback` (L71-L71) - Function
  - `scripts.check-mutation-baseline.counts.held.comparisons.filter() callback` (L82-L82) - Function
  - `scripts.check-mutation-baseline.counts.improved.comparisons.filter() callback` (L83-L83) - Function
  - `scripts.check-mutation-baseline.counts.added.comparisons.filter() callback` (L84-L84) - Function
  - `scripts.check-mutation-baseline.counts.removed.comparisons.filter() callback` (L85-L85) - Function
  - `scripts.check-mutation-baseline.comparisons.filter() callback` (L102-L102) - Function
- `scripts/contracts/openapi-bundle.ts`
  - `scripts.contracts.openapi-bundle.assertModuleSectionsAreCurrent.shouldBeListed` (L77-L79) - Class
  - `scripts.contracts.openapi-bundle.assertModuleSectionsAreCurrent.shouldBeListed.enabledModules.map() callback` (L78-L78) - Function
  - `scripts.contracts.openapi-bundle.assertModuleSectionsAreCurrent.shouldBeListed.filter() callback` (L78-L78) - Function
- `scripts/mutation-baseline.ts`
  - `scripts.mutation-baseline.formatRegressions.regressed` (L217-L217) - Class
  - `scripts.mutation-baseline.formatRegressions.regressed.comparisons.filter() callback` (L217-L217) - Function
- `scripts/report-test-results.ts`
  - `scripts.report-test-results.slowestSuites` (L180-L186) - Class
  - `scripts.report-test-results.slowestSuites.report.testResults.map() callback` (L181-L184) - Function
  - `scripts.report-test-results.slowestSuites.toSorted() callback` (L185-L185) - Function
  - `scripts.report-test-results.covered.toSorted() callback` (L270-L271) - Function
  - `scripts.report-test-results.covered` (L270-L272) - Class
- `scripts/run-prism-smoke-test.ts`
  - `scripts.run-prism-smoke-test.prism.stdout.on('data') callback` (L29-L29) - Function
  - `scripts.run-prism-smoke-test.prism.stderr.on('data') callback` (L30-L30) - Function
  - `scripts.run-prism-smoke-test.process.on('SIGINT') callback` (L37-L37) - Function
  - `scripts.run-prism-smoke-test.prism.on('error') callback` (L47-L48) - Function
  - `scripts.run-prism-smoke-test.prism.on('exit') callback` (L50-L52) - Function
- `scripts/spec-identity.ts`
  - `scripts.spec-identity.SharedFile` (L31-L34) - Interface
  - `scripts.spec-identity.SpecComparison` (L102-L112) - Interface
  - `scripts.spec-identity.compareSharedFiles` (L134-L163) - Class
  - `scripts.spec-identity.compareSharedFiles.SHARED_FILES.map() callback` (L139-L163) - Function
- `scripts/sync-shared-files-to-frontend.ts`
  - `scripts.sync-shared-files-to-frontend.outcomes` (L80-L95) - Class
  - `scripts.sync-shared-files-to-frontend.outcomes.SHARED_FILES.map() callback` (L80-L95) - Function
- `src/infrastructure/persistence/seed.ts`
  - `src.infrastructure.persistence.seed.upsertById` (L54-L62) - Class
  - `src.infrastructure.persistence.seed.upsertById.then() callback` (L58-L61) - Function
  - `src.infrastructure.persistence.seed.upsertById.then() callback.then() callback` (L61-L61) - Function
- `src/modules/account/module.ts`
  - `src.modules.account.module.resolve` (L49-L85) - Class
  - `src.modules.account.module.resolve.<function>` (L49-L85) - Function
  - `src.modules.account.module.<function>.then() callback` (L51-L58) - Function
  - `src.modules.account.module.resolve.<function>.then() callback.then() callback` (L62-L62) - Function
  - `src.modules.account.module.resolve.<function>.then() callback` (L65-L84) - Function
- `src/modules/account/services/addresses.ts`
  - `src.modules.account.services.addresses.toView.addresses.map() callback` (L41-L41) - Function
  - `src.modules.account.services.addresses.addressesGet` (L45-L46) - Class
  - `src.modules.account.services.addresses.addressesGet.then() callback` (L46-L46) - Function
- `src/modules/account/services/export.ts`
  - `src.modules.account.services.export.ownSessions` (L137-L145) - Class
  - `src.modules.account.services.export.ownSessions.tokens.filter() callback` (L139-L139) - Function
  - `src.modules.account.services.export.ownSessions.map() callback` (L140-L145) - Function
  - `src.modules.account.services.export.exportOwnData` (L153-L212) - Class
  - `src.modules.account.services.export.exportOwnData.then() callback` (L167-L212) - Function
  - `src.modules.account.services.export.exportOwnData.then() callback.then() callback` (L178-L210) - Function
  - `src.modules.account.services.export.exportOwnData.then() callback.then() callback.then() callback` (L182-L210) - Function
  - `src.modules.account.services.export.exportOwnData.then() callback.then() callback.then() callback.payload.payments.payments.map() callback` (L188-L188) - Function
  - `src.modules.account.services.export.exportOwnData.then() callback.then() callback.then() callback.payload.cart.cart.map() callback` (L193-L193) - Function
- `src/modules/account/services/token-cleanup.ts`
  - `src.modules.account.services.token-cleanup.runTokenCleanup` (L27-L46) - Class
  - `src.modules.account.services.token-cleanup.runTokenCleanup.then() callback` (L31-L33) - Function
  - `src.modules.account.services.token-cleanup.runTokenCleanup.catch() callback` (L34-L45) - Function
- `src/modules/account/services/tokens.ts`
  - `src.modules.account.services.tokens.findLiveToken` (L30-L45) - Class
  - `src.modules.account.services.tokens.findLiveToken.then() callback` (L34-L45) - Function
  - `src.modules.account.services.tokens.findLiveToken.then() callback.entry` (L40-L40) - Class
  - `src.modules.account.services.tokens.findLiveToken.then() callback.entry.user.tokens.find() callback` (L40-L40) - Function
- `src/modules/account/services/two-factor.ts`
  - `src.modules.account.services.two-factor.setupTwoFactor` (L66-L86) - Class
  - `src.modules.account.services.two-factor.setupTwoFactor.then() callback` (L71-L85) - Function
  - `src.modules.account.services.two-factor.setupTwoFactor.then() callback.then() callback` (L82-L83) - Function
  - `src.modules.account.services.two-factor.setupTwoFactor.catch() callback` (L86-L86) - Function
- `src/modules/account/session/config.ts`
  - `src.modules.account.session.config.RefreshTokenExpiryTime` (L12-L16) - Enum
- `src/modules/account/session/jwt.ts`
  - `src.modules.account.session.jwt.verifyRefreshToken` (L82-L101) - Class
  - `src.modules.account.session.jwt.verifyRefreshToken.<function>` (L83-L101) - Function
  - `src.modules.account.session.jwt.verifyRefreshToken.<function>.verify() callback` (L85-L100) - Function
  - `src.modules.account.session.jwt.verifyRefreshToken.<function>.verify() callback.then() callback` (L92-L98) - Function
  - `src.modules.account.session.jwt.verifyRefreshToken.<function>.verify() callback.catch() callback` (L99-L99) - Function
  - `src.modules.account.session.jwt.createRefreshToken` (L111-L146) - Class
  - `src.modules.account.session.jwt.createRefreshToken.then() callback` (L119-L146) - Function
  - `src.modules.account.session.jwt.createAccessToken` (L207-L214) - Class
  - `src.modules.account.session.jwt.createAccessToken.then() callback` (L208-L213) - Function
- `src/modules/feedback/emails.ts`
  - `src.modules.feedback.emails.ContactRequest` (L15-L21) - Interface
- `src/modules/locales/demo.ts`
  - `src.modules.locales.demo.seedLocalesCollection.languages` (L214-L216) - Class
  - `src.modules.locales.demo.seedLocalesCollection.languages.localeFixtures.map() callback` (L215-L215) - Function
  - `src.modules.locales.demo.seedLocalesCollection.entries` (L217-L219) - Class
  - `src.modules.locales.demo.seedLocalesCollection.entries.localeEntryFixtures.map() callback` (L218-L218) - Function
- `src/modules/orders/demo.ts`
  - `src.modules.orders.demo.seedOrdersCollection` (L258-L259) - Class
  - `src.modules.orders.demo.seedOrdersCollection.orderFixtures.map() callback` (L259-L259) - Function
- `src/modules/products/demo.ts`
  - `src.modules.products.demo.seedProductsCollection` (L174-L175) - Class
  - `src.modules.products.demo.seedProductsCollection.productFixtures.map() callback` (L175-L175) - Function
- `src/modules/users/demo.ts`
  - `src.modules.users.demo.SEED_CUSTOMER_EMAILS` (L105-L107) - Class
  - `src.modules.users.demo.SEED_CUSTOMER_EMAILS.CUSTOMER_NAMES.map() callback` (L106-L106) - Function
  - `src.modules.users.demo.customerUsers.CUSTOMER_NAMES.map() callback` (L109-L116) - Function
  - `src.modules.users.demo.customerUsers` (L109-L117) - Class
  - `src.modules.users.demo.seedUsersCollection` (L122-L123) - Class
  - `src.modules.users.demo.seedUsersCollection.userFixtures.map() callback` (L123-L123) - Function
- `src/modules/users/model.ts`
  - `src.modules.users.model.UserRecord` (L77-L116) - Interface
  - `src.modules.users.model.UserDocument` (L121-L131) - Interface
  - `src.modules.users.model.tokenAdd` (L413-L433) - Function
  - `src.modules.users.model.tokenRemoveAll` (L438-L448) - Function
- `src/modules/users/repository.ts`
  - `src.modules.users.repository.userRepository` (L53-L334) - Class
  - `src.modules.users.repository.userRepository.updateMany` (L95-L96) - Method
  - `src.modules.users.repository.userRepository.findByIdWithCredentials` (L101-L102) - Method
  - `src.modules.users.repository.userRepository.findOneWithCredentials` (L107-L108) - Method
  - `src.modules.users.repository.userRepository.findByToken` (L122-L126) - Method
  - `src.modules.users.repository.userRepository.findAuthenticatableById` (L136-L137) - Method
  - `src.modules.users.repository.userRepository.tokenRemove` (L148-L157) - Method
  - `src.modules.users.repository.userRepository.tokenRemoveByValue` (L167-L176) - Method
  - `src.modules.users.repository.userRepository.tokenRemoveExpired` (L192-L206) - Method
  - `src.modules.users.repository.userRepository.tokenRemoveExpired.then() callback` (L205-L205) - Function
  - `src.modules.users.repository.userRepository.findByTokenValue` (L218-L222) - Method
  - `src.modules.users.repository.userRepository.tokenTouch` (L230-L237) - Method
  - `src.modules.users.repository.userRepository.tokenSupersede` (L255-L267) - Method
  - `src.modules.users.repository.userRepository.tokenSupersede.then() callback` (L267-L267) - Function
  - `src.modules.users.repository.userRepository.sessionRemove` (L276-L283) - Method
  - `src.modules.users.repository.userRepository.writebackImage` (L292-L303) - Method
  - `src.modules.users.repository.userRepository.writebackImage.then() callback` (L303-L303) - Function
  - `src.modules.users.repository.userRepository.findInactiveUnwarned` (L305-L313) - Method
  - `src.modules.users.repository.userRepository.findWarnedStillInactive` (L315-L322) - Method
  - `src.modules.users.repository.userRepository.findReaperSoftDeletedPastGrace` (L324-L333) - Method
- `src/modules/users/service.ts`
  - `src.modules.users.service.getById` (L60-L63) - Class
  - `src.modules.users.service.getById.then() callback` (L62-L62) - Function
  - `src.modules.users.service.update.then() callback.revoke` (L187-L190) - Class
  - `src.modules.users.service.update.then() callback.revoke.catch() callback` (L189-L189) - Function
  - `src.modules.users.service.update.then() callback.revoke.then() callback` (L191-L191) - Function
  - `src.modules.users.service.remove.then() callback.revoke` (L254-L256) - Class
  - `src.modules.users.service.remove.then() callback.revoke.catch() callback` (L255-L255) - Function
  - `src.modules.users.service.remove.then() callback.revoke.then() callback` (L257-L257) - Function
  - `src.modules.users.service.consumeToken` (L283-L293) - Class
  - `src.modules.users.service.consumeToken.then() callback` (L284-L293) - Function
  - `src.modules.users.service.consumeToken.then() callback.user.tokens.filter() callback` (L288-L288) - Function

### Bundle Registry & Build Orchestration [[Expand]](./Bundle_Registry_Build_Orchestration.md)
The core of the subsystem — the CONTRACT_BUNDLES registry that enumerates every published document, the ContractBundle type taxonomy (compiled vs. generated) that determines build ordering and staleness semantics, and the build-contract-bundles CLI that assembles fragments into committed bundles or verifies they are current. This is the entry point for npm run contracts:bundle and the single place where adding a new bundle requires one registry entry plus its spec file.

**Related Classes/Methods**:

- `scripts.contracts.openapi-bundle.openapiBundle`:196-203
- `scripts.contracts.asyncapi-bundles.asyncapiBundle`:159-170

**Source Files:**

- `eslint/rules/no-hardcoded-user-text.ts`
  - `eslint.rules.no-hardcoded-user-text.noHardcodedUserText` (L19-L67) - Class
  - `eslint.rules.no-hardcoded-user-text.noHardcodedUserText.create` (L30-L66) - Method
  - `eslint.rules.no-hardcoded-user-text.noHardcodedUserText.create.CallExpression` (L32-L64) - Method
  - `eslint.rules.no-hardcoded-user-text.noHardcodedUserText.create.CallExpression.errors` (L36-L38) - Class
  - `eslint.rules.no-hardcoded-user-text.noHardcodedUserText.create.CallExpression.errors.node.arguments.find() callback` (L37-L37) - Function
- `scripts/build-contract-bundles.ts`
  - `scripts.build-contract-bundles.unknown` (L36-L36) - Class
  - `scripts.build-contract-bundles.unknown.named.filter() callback` (L36-L36) - Function
  - `scripts.build-contract-bundles.bundle.assembled` (L49-L49) - Class
  - `scripts.build-contract-bundles.bundle.assembled.bundles.map() callback` (L49-L49) - Function
  - `scripts.build-contract-bundles.selected` (L63-L63) - Class
  - `scripts.build-contract-bundles.selected.named.map() callback` (L63-L63) - Function
  - `scripts.build-contract-bundles.generated` (L71-L71) - Class
  - `scripts.build-contract-bundles.generated.selected.filter() callback` (L71-L71) - Function
  - `scripts.build-contract-bundles.generated.map() callback` (L79-L79) - Function
- `scripts/contracts/asyncapi-bundles.ts`
  - `scripts.contracts.asyncapi-bundles.sectionsInScope` (L43-L46) - Class
  - `scripts.contracts.asyncapi-bundles.sectionsInScope.ASYNC_SECTION_ORDER.filter() callback` (L46-L46) - Function
  - `scripts.contracts.asyncapi-bundles.marker` (L72-L77) - Class
  - `scripts.contracts.asyncapi-bundles.marker.sections.map() callback` (L76-L76) - Function
  - `scripts.contracts.asyncapi-bundles.asyncapiBundle` (L159-L170) - Class
  - `scripts.contracts.asyncapi-bundles.asyncapiBundle.content` (L164-L164) - Method
  - `scripts.contracts.asyncapi-bundles.asyncapiBundle.sources` (L165-L168) - Method
  - `scripts.contracts.asyncapi-bundles.asyncapiBundle.sources.map() callback` (L167-L167) - Function
  - `scripts.contracts.asyncapi-bundles.asyncapiPublicBundle` (L179-L189) - Class
  - `scripts.contracts.asyncapi-bundles.asyncapiPublicBundle.content` (L183-L183) - Method
  - `scripts.contracts.asyncapi-bundles.asyncapiPublicBundle.sources` (L184-L187) - Method
  - `scripts.contracts.asyncapi-bundles.asyncapiPublicBundle.sources.map() callback` (L186-L186) - Function
- `scripts/contracts/bundle-kinds.ts`
  - `scripts.contracts.bundle-kinds.BundleIdentity` (L28-L49) - Interface
  - `scripts.contracts.bundle-kinds.CompiledBundle` (L59-L64) - Interface
  - `scripts.contracts.bundle-kinds.GeneratedBundle` (L74-L77) - Interface
- `scripts/contracts/bundle-registry.ts`
  - `scripts.contracts.bundle-registry.findBundle` (L40-L41) - Class
  - `scripts.contracts.bundle-registry.findBundle.CONTRACT_BUNDLES.find() callback` (L41-L41) - Function
- `scripts/contracts/client-collections-bundle.ts`
  - `scripts.contracts.client-collections-bundle.values` (L76-L206) - Class
  - `scripts.contracts.client-collections-bundle.values.pathParam` (L169-L179) - Method
  - `scripts.contracts.client-collections-bundle.values.tokens.seedSoftDeletedProductId.seedProducts.find() callback` (L201-L201) - Function
  - `scripts.contracts.client-collections-bundle.values.tokens.seedInactiveProductId.seedProducts.find() callback` (L203-L203) - Function
  - `scripts.contracts.client-collections-bundle.values.tokens.seedDeletedOrderId.seedOrders.find() callback` (L204-L204) - Function
- `scripts/contracts/openapi-bundle.ts`
  - `scripts.contracts.openapi-bundle.openapiBundle` (L196-L203) - Class
  - `scripts.contracts.openapi-bundle.openapiBundle.sources` (L202-L202) - Method
  - `scripts.contracts.openapi-bundle.openapiBundle.sources.MODULE_SECTIONS.map() callback` (L202-L202) - Function
- `scripts/generate-asyncapi-types.ts`
  - `scripts.generate-asyncapi-types.channelNamespaceBlocks` (L276-L278) - Class
  - `scripts.generate-asyncapi-types.channelNamespaceBlocks.map() callback` (L277-L277) - Function
- `scripts/generate-module-graph.ts`
  - `scripts.generate-module-graph.readEdges.labels` (L94-L96) - Class
  - `scripts.generate-module-graph.readEdges.labels.map() callback` (L95-L95) - Function
  - `scripts.generate-module-graph.renderNeighbourhood.reached` (L165-L165) - Class
  - `scripts.generate-module-graph.renderNeighbourhood.reached.edges.filter() callback` (L165-L165) - Function
  - `scripts.generate-module-graph.renderNeighbourhood.announces` (L166-L166) - Class
  - `scripts.generate-module-graph.renderNeighbourhood.announces.events.filter() callback` (L166-L166) - Function
  - `scripts.generate-module-graph.renderNeighbourhood.reached.map() callback` (L197-L197) - Function
  - `scripts.generate-module-graph.renderNeighbourhood.announces.map() callback` (L200-L200) - Function
- `scripts/generate-seed-images.ts`
  - `scripts.generate-seed-images.main.keptBasenames` (L131-L133) - Class
  - `scripts.generate-seed-images.main.keptBasenames.map() callback` (L132-L132) - Function
- `scripts/mutation-baseline.ts`
  - `scripts.mutation-baseline.missingFromReport` (L185-L191) - Class
  - `scripts.mutation-baseline.missingFromReport.filter() callback` (L190-L190) - Function
- `scripts/report-test-results.ts`
  - `scripts.report-test-results.rows.toSorted() callback` (L151-L152) - Function
  - `scripts.report-test-results.rows` (L151-L153) - Class
  - `scripts.report-test-results.slowestTests` (L192-L201) - Class
  - `scripts.report-test-results.slowestTests.report.testResults.flatMap() callback` (L193-L198) - Function
  - `scripts.report-test-results.slowestTests.report.testResults.flatMap() callback.suite.assertionResults.map() callback` (L194-L198) - Function
  - `scripts.report-test-results.slowestTests.toSorted() callback` (L200-L200) - Function
- `scripts/run-mutation-tests.ts`
  - `scripts.run-mutation-tests.main` (L78-L124) - Class
  - `scripts.run-mutation-tests.main.stryker.stdout.on('data') callback` (L99-L119) - Function
  - `scripts.run-mutation-tests.main.stryker.on('exit') callback` (L121-L123) - Function
- `scripts/spec-identity.ts`
  - `scripts.spec-identity.sharedFileProblems` (L166-L167) - Class
  - `scripts.spec-identity.sharedFileProblems.comparisons.filter() callback` (L167-L167) - Function
- `src/infrastructure/persistence/seed.ts`
  - `src.infrastructure.persistence.seed.SeedRepository` (L21-L24) - Interface
  - `src.infrastructure.persistence.seed.OwnedSeedRepository` (L29-L32) - Interface
  - `src.infrastructure.persistence.seed.upsertByOwner` (L74-L82) - Class
  - `src.infrastructure.persistence.seed.upsertByOwner.then() callback` (L78-L81) - Function
  - `src.infrastructure.persistence.seed.upsertByOwner.then() callback.then() callback` (L81-L81) - Function
- `src/modules/account/demo.ts`
  - `src.modules.account.demo.seedAddressBooksCollection` (L83-L84) - Class
  - `src.modules.account.demo.seedAddressBooksCollection.addressBookFixtures.map() callback` (L84-L84) - Function
- `src/modules/account/repository.ts`
  - `src.modules.account.repository.addressBookRepository.removeEntry.entry` (L100-L100) - Class
  - `src.modules.account.repository.addressBookRepository.removeEntry.entry.book.items.find() callback` (L100-L100) - Function
- `src/modules/account/services/two-factor.ts`
  - `src.modules.account.services.two-factor.verifyCodeOrBackup` (L40-L55) - Class
  - `src.modules.account.services.two-factor.verifyCodeOrBackup.then() callback` (L42-L54) - Function
  - `src.modules.account.services.two-factor.confirmTwoFactor.outcome` (L101-L120) - Class
  - `src.modules.account.services.two-factor.confirmTwoFactor.outcome.then() callback.then() callback` (L109-L118) - Function
  - `src.modules.account.services.two-factor.confirmTwoFactor.outcome.then() callback.then() callback.backupCodes.map() callback` (L115-L115) - Function
  - `src.modules.account.services.two-factor.confirmTwoFactor.outcome.then() callback.then() callback.then() callback` (L117-L117) - Function
  - `src.modules.account.services.two-factor.confirmTwoFactor.outcome.catch() callback` (L120-L120) - Function
  - `src.modules.account.services.two-factor.confirmTwoFactor.outcome.then() callback` (L122-L130) - Function
  - `src.modules.account.services.two-factor.verifyLoginChallenge.outcome` (L196-L211) - Class
  - `src.modules.account.services.two-factor.verifyLoginChallenge.outcome.then() callback.then() callback` (L200-L208) - Function
  - `src.modules.account.services.two-factor.verifyLoginChallenge.outcome.then() callback.then() callback.then() callback` (L203-L207) - Function
  - `src.modules.account.services.two-factor.verifyLoginChallenge.outcome.then() callback.then() callback.then() callback.then() callback` (L206-L206) - Function
  - `src.modules.account.services.two-factor.verifyLoginChallenge.outcome.then() callback.catch() callback` (L209-L209) - Function
  - `src.modules.account.services.two-factor.verifyLoginChallenge.outcome.then() callback` (L216-L225) - Function
- `src/modules/account/session/jwt.ts`
  - `src.modules.account.session.jwt.verifyAccessToken` (L60-L73) - Class
  - `src.modules.account.session.jwt.verifyAccessToken.<function>` (L61-L73) - Function
  - `src.modules.account.session.jwt.verifyAccessToken.<function>.verify() callback` (L66-L72) - Function
  - `src.modules.account.session.jwt.verifyMfaChallenge` (L174-L178) - Class
  - `src.modules.account.session.jwt.verifyMfaChallenge.then() callback` (L175-L178) - Function
- `src/modules/account/two-factor.ts`
  - `src.modules.account.two-factor.TotpVerification` (L100-L104) - Interface
  - `src.modules.account.two-factor.verifyTotpCode` (L114-L139) - Class
  - `src.modules.account.two-factor.verifyTotpCode.then() callback` (L125-L131) - Function
  - `src.modules.account.two-factor.verifyTotpCode.catch() callback` (L138-L138) - Function
  - `src.modules.account.two-factor.generateBackupCodes` (L145-L146) - Class
  - `src.modules.account.two-factor.generateBackupCodes.Array.from() callback` (L146-L146) - Function
- `src/modules/cart/demo.ts`
  - `src.modules.cart.demo.seedCartsCollection` (L70-L71) - Class
  - `src.modules.cart.demo.seedCartsCollection.cartFixtures.map() callback` (L71-L71) - Function
- `src/modules/wishlist/demo.ts`
  - `src.modules.wishlist.demo.seedWishlistsCollection` (L39-L40) - Class
  - `src.modules.wishlist.demo.seedWishlistsCollection.wishlistFixtures.map() callback` (L40-L40) - Function

### Contract Type & Graph Derivation [[Expand]](./Contract_Type_Graph_Derivation.md)
The downstream derivation layer that transforms committed contracts into machine-consumable artefacts. It generates TypeScript channel/message/model types from the AsyncAPI document (for gen:asyncapi), builds the module dependency and event-edge graph (for architecture documentation and tooling), and orchestrates the two-phase build ordering (compiled bundles first, then generated collections) that ensures derived artefacts always read a current contract.

**Related Classes/Methods**:

- `scripts.generate-asyncapi-types.collectChannelMessageEntries`:146-163
- `scripts.generate-module-graph.render`:214-258
- `scripts.build-contract-bundles.authored`
- `scripts.generate-asyncapi-types.toPascalCase`:90-97

**Source Files:**

- `scripts/build-contract-bundles.ts`
  - `scripts.build-contract-bundles.named` (L34-L34) - Class
  - `scripts.build-contract-bundles.named.arguments_.filter() callback` (L34-L34) - Function
  - `scripts.build-contract-bundles.CONTRACT_BUNDLES.map() callback` (L40-L40) - Function
  - `scripts.build-contract-bundles.bundle` (L48-L53) - Class
  - `scripts.build-contract-bundles.bundle.stale` (L50-L50) - Class
  - `scripts.build-contract-bundles.bundle.stale.assembled.filter() callback` (L50-L50) - Function
  - `scripts.build-contract-bundles.bundle.stale.map() callback` (L52-L52) - Function
  - `scripts.build-contract-bundles.authored` (L107-L107) - Class
  - `scripts.build-contract-bundles.authored.CONTRACT_BUNDLES.filter() callback` (L107-L107) - Function
  - `scripts.build-contract-bundles.stale.map() callback` (L128-L128) - Function
- `scripts/contracts/client-collections-bundle.ts`
  - `scripts.contracts.client-collections-bundle.sections` (L56-L57) - Class
  - `scripts.contracts.client-collections-bundle.sections.SECTION_ORDER.map() callback` (L57-L57) - Function
- `scripts/contracts/openapi-bundle.ts`
  - `scripts.contracts.openapi-bundle.rootPaths` (L122-L129) - Class
  - `scripts.contracts.openapi-bundle.rootPaths.filter() callback` (L127-L127) - Function
  - `scripts.contracts.openapi-bundle.rootPaths.map() callback` (L128-L128) - Function
  - `scripts.contracts.openapi-bundle.sectionPaths` (L132-L137) - Class
  - `scripts.contracts.openapi-bundle.sectionPaths.map() callback` (L136-L136) - Function
- `scripts/generate-asyncapi-types.ts`
  - `scripts.generate-asyncapi-types.toPascalCase` (L90-L97) - Class
  - `scripts.generate-asyncapi-types.toPascalCase.map() callback` (L96-L96) - Function
  - `scripts.generate-asyncapi-types.collectChannelMessageEntries` (L146-L163) - Class
  - `scripts.generate-asyncapi-types.collectChannelMessageEntries.filter() callback` (L152-L152) - Function
  - `scripts.generate-asyncapi-types.collectChannelMessageEntries.map() callback` (L153-L162) - Function
  - `scripts.generate-asyncapi-types.collectChannelMessageEntries.toSorted() callback` (L163-L163) - Function
  - `scripts.generate-asyncapi-types.renderPayloadMap.rows` (L188-L192) - Class
  - `scripts.generate-asyncapi-types.renderPayloadMap.rows.entries.map() callback` (L190-L190) - Function
  - `scripts.generate-asyncapi-types.modelNameConstraints` (L255-L257) - Class
  - `scripts.generate-asyncapi-types.modelNameConstraints.NAMING_FORMATTER` (L256-L256) - Method
  - `scripts.generate-asyncapi-types.messageTypeBlocks` (L294-L304) - Class
  - `scripts.generate-asyncapi-types.messageTypeBlocks.map() callback` (L295-L303) - Function
- `scripts/generate-module-graph.ts`
  - `scripts.generate-module-graph.EventEdge` (L42-L46) - Interface
  - `scripts.generate-module-graph.Target` (L49-L54) - Interface
  - `scripts.generate-module-graph.readEdges` (L74-L107) - Class
  - `scripts.generate-module-graph.readEdges.edges.toSorted() callback` (L106-L106) - Function
  - `scripts.generate-module-graph.readEventEdges` (L129-L156) - Class
  - `scripts.generate-module-graph.readEventEdges.edges.toSorted() callback` (L151-L154) - Function
  - `scripts.generate-module-graph.renderNeighbourhood` (L159-L212) - Class
  - `scripts.generate-module-graph.renderNeighbourhood.byKind` (L182-L183) - Class
  - `scripts.generate-module-graph.renderNeighbourhood.byKind.map() callback` (L183-L183) - Function
  - `scripts.generate-module-graph.renderNeighbourhood.byKind.neighbours.filter() callback` (L183-L183) - Function
  - `scripts.generate-module-graph.render` (L214-L258) - Class
  - `scripts.generate-module-graph.render.declare` (L217-L217) - Class
  - `scripts.generate-module-graph.render.declare.names.map() callback` (L217-L217) - Function
  - `scripts.generate-module-graph.render.byKind` (L218-L219) - Class
  - `scripts.generate-module-graph.render.byKind.map() callback` (L219-L219) - Function
  - `scripts.generate-module-graph.render.byKind.names.filter() callback` (L219-L219) - Function
  - `scripts.generate-module-graph.render.isolated` (L220-L220) - Class
  - `scripts.generate-module-graph.render.isolated.map() callback` (L220-L220) - Function
  - `scripts.generate-module-graph.render.isolated.names.filter() callback` (L220-L220) - Function
  - `scripts.generate-module-graph.render.edges.map() callback` (L228-L228) - Function
  - `scripts.generate-module-graph.render.names.map() callback` (L247-L251) - Function
  - `scripts.generate-module-graph.names.map() callback.reaches` (L248-L248) - Class
  - `scripts.generate-module-graph.render.names.map() callback.reaches.edges.filter() callback` (L248-L248) - Function
  - `scripts.generate-module-graph.render.names.map() callback.reaches.map() callback` (L248-L248) - Function
  - `scripts.generate-module-graph.names.map() callback.reached` (L249-L249) - Class
  - `scripts.generate-module-graph.render.names.map() callback.reached.edges.filter() callback` (L249-L249) - Function
  - `scripts.generate-module-graph.render.names.map() callback.reached.map() callback` (L249-L249) - Function
  - `scripts.generate-module-graph.render.toSorted() callback` (L252-L252) - Function
  - `scripts.generate-module-graph.render.map() callback` (L254-L255) - Function
  - `scripts.generate-module-graph.targets` (L297-L312) - Class
  - `scripts.generate-module-graph.targets.map() callback` (L305-L310) - Function
  - `scripts.generate-module-graph.then() callback` (L323-L325) - Function
- `scripts/mutation-baseline.ts`
  - `scripts.mutation-baseline.MutationProfile` (L35-L40) - Interface
  - `scripts.mutation-baseline.MutationReport` (L67-L69) - Interface
  - `scripts.mutation-baseline.MutationBaseline` (L71-L76) - Interface
  - `scripts.mutation-baseline.FileComparison` (L80-L85) - Interface
  - `scripts.mutation-baseline.scoresFromReport.killed` (L111-L111) - Class
  - `scripts.mutation-baseline.scoresFromReport.killed.scored.filter() callback` (L111-L111) - Function
  - `scripts.mutation-baseline.compareToBaseline` (L156-L175) - Class
  - `scripts.mutation-baseline.compareToBaseline.files.map() callback` (L163-L174) - Function
- `scripts/report-test-results.ts`
  - `scripts.report-test-results.wall` (L157-L160) - Class
  - `scripts.report-test-results.wall.report.testResults.reduce() callback` (L158-L158) - Function
  - `scripts.report-test-results.failures.report.testResults.flatMap() callback` (L209-L218) - Function
  - `scripts.report-test-results.failures` (L209-L219) - Class
  - `scripts.report-test-results.failures.report.testResults.flatMap() callback.suite.assertionResults.filter() callback` (L211-L211) - Function
  - `scripts.report-test-results.failures.report.testResults.flatMap() callback.map() callback` (L212-L218) - Function
- `scripts/run-mutation-diff.ts`
  - `scripts.run-mutation-diff.changedFiles` (L70-L79) - Class
  - `scripts.run-mutation-diff.changedFiles.map() callback` (L76-L76) - Function
  - `scripts.run-mutation-diff.filter() callback` (L77-L77) - Function
  - `scripts.run-mutation-diff.changedFiles.filter() callback` (L79-L79) - Function
- `scripts/sync-shared-files-to-frontend.ts`
  - `scripts.sync-shared-files-to-frontend.list` (L101-L102) - Class
  - `scripts.sync-shared-files-to-frontend.list.items.map() callback` (L102-L102) - Function
- `src/cluster.ts`
  - `src.cluster.startPrimaryShutdown.forceShutdownTimer` (L106-L113) - Class
  - `src.cluster.startPrimaryShutdown.forceShutdownTimer.setTimeout() callback` (L106-L113) - Function
  - `src.cluster.cluster.on('exit') callback` (L120-L156) - Function
  - `src.cluster.process.on('SIGTERM') callback` (L158-L158) - Function
  - `src.cluster.process.on('SIGINT') callback` (L159-L159) - Function
- `src/infrastructure/persistence/seed.ts`
  - `src.infrastructure.persistence.seed.exportCollection` (L95-L104) - Class
  - `src.infrastructure.persistence.seed.exportCollection.then() callback` (L104-L104) - Function
  - `src.infrastructure.persistence.seed.exportCollection.then() callback.documents.map() callback` (L104-L104) - Function
- `src/modules/account/repository.ts`
  - `src.modules.account.repository.addressBookRepository.updateEntry.entry` (L76-L76) - Class
  - `src.modules.account.repository.addressBookRepository.updateEntry.entry.book.items.find() callback` (L76-L76) - Function
- `src/modules/account/services/authentication.ts`
  - `src.modules.account.services.authentication.MissingRefreshTokenError` (L231-L236) - Class
  - `src.modules.account.services.authentication.MissingRefreshTokenError.constructor` (L232-L235) - Constructor
  - `src.modules.account.services.authentication.refreshAccessToken` (L249-L294) - Class
  - `src.modules.account.services.authentication.refreshAccessToken.then() callback` (L257-L265) - Function
  - `src.modules.account.services.authentication.refreshAccessToken.catch() callback` (L266-L294) - Function
- `src/modules/account/session/jwt.ts`
  - `src.modules.account.session.jwt.recordRefreshTokenUse` (L189-L193) - Class
  - `src.modules.account.session.jwt.recordRefreshTokenUse.then() callback` (L192-L192) - Function
  - `src.modules.account.session.jwt.recordRefreshTokenUse.catch() callback` (L193-L193) - Function
  - `src.modules.account.session.jwt.TokenReuseError` (L222-L227) - Class
  - `src.modules.account.session.jwt.TokenReuseError.constructor` (L223-L226) - Constructor
  - `src.modules.account.session.jwt.revokeAllRefreshTokens` (L230-L233) - Class
  - `src.modules.account.session.jwt.revokeAllRefreshTokens.then() callback` (L233-L233) - Function
  - `src.modules.account.session.jwt.reissueRotated` (L246-L273) - Class
  - `src.modules.account.session.jwt.reissueRotated.then() callback` (L252-L273) - Function
  - `src.modules.account.session.jwt.reissueRotated.then() callback.then() callback.then() callback` (L264-L264) - Function
  - `src.modules.account.session.jwt.reissueRotated.then() callback.then() callback` (L265-L272) - Function
  - `src.modules.account.session.jwt.rotateRefreshToken` (L300-L358) - Class
  - `src.modules.account.session.jwt.rotateRefreshToken.<function>` (L303-L312) - Function
  - `src.modules.account.session.jwt.rotateRefreshToken.<function>.verify() callback` (L305-L311) - Function
  - `src.modules.account.session.jwt.rotateRefreshToken.then() callback` (L312-L358) - Function
  - `src.modules.account.session.jwt.rotateRefreshToken.then() callback.then() callback` (L323-L357) - Function
  - `src.modules.account.session.jwt.rotateRefreshToken.then() callback.then() callback.then() callback` (L326-L356) - Function
  - `src.modules.account.session.jwt.rotateRefreshToken.then() callback.then() callback.then() callback.then() callback` (L353-L355) - Function
