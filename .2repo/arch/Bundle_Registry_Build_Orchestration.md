---
tags:
  - 2repo
  - 2repo/arch
  - project/boilerplate-node-backend
type: architecture
component: Bundle_Registry_Build_Orchestration
---

```mermaid
graph LR
    Account_Two_Factor_JWT_Verification["Account Two-Factor & JWT Verification"]
    Bundle_Registry_Build_Orchestration["Bundle Registry & Build Orchestration"]
    Seed_Demo_Data_No_Hardcoded_Text_Guard["Seed/Demo Data & No-Hardcoded-Text Guard"]
    Account_Two_Factor_JWT_Verification -- "Contributes contract fragment for 2FA and MFA-challenge endpoints" --> Bundle_Registry_Build_Orchestration
    Account_Two_Factor_JWT_Verification -- "Subject to static i18n guard on user-facing error strings" --> Seed_Demo_Data_No_Hardcoded_Text_Guard
    Seed_Demo_Data_No_Hardcoded_Text_Guard -- "Consumes committed contract as downstream validation input" --> Bundle_Registry_Build_Orchestration
```

## Details

The core of the subsystem — the CONTRACT_BUNDLES registry that enumerates every published document, the ContractBundle type taxonomy (compiled vs. generated) that determines build ordering and staleness semantics, and the build-contract-bundles CLI that assembles fragments into committed bundles or verifies they are current. This is the entry point for npm run contracts:bundle and the single place where adding a new bundle requires one registry entry plus its spec file.

### Account Two-Factor & JWT Verification
The account module's authentication-verification core — TOTP two-factor verification (code + backup codes), the service-level verifyCodeOrBackup / confirmTwoFactor / verifyLoginChallenge flows, and the JWT primitives (verifyAccessToken, verifyMfaChallenge) that gate session and MFA-challenge access. This is the security verification seam of the account bounded context, distinct from the contract-build pipeline.

**Related Classes/Methods**:

- `src.modules.account.two-factor.verifyTotpCode`:114-139
- `src.modules.account.services.two-factor.verifyCodeOrBackup`:40-55
- `src.modules.account.session.jwt.verifyAccessToken`:60-73

**Source Files:**

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

### Bundle Registry & Build Orchestration
The heart of the subsystem. Owns the CONTRACT_BUNDLES registry that enumerates every published document, the ContractBundle type taxonomy (CompiledBundle vs GeneratedBundle) that determines build ordering (compiled first, so generated collections read a current contract) and staleness semantics (compiled bundles have sources() to watch; generated ones are .gitignore'd and never stale), and the build-contract-bundles.ts CLI that assembles fragments into committed bundles or verifies they are current. This is the entry point for npm run contracts:bundle and the single place where adding a new bundle requires one registry entry plus its spec file. It also hosts the per-bundle builders (openapiBundle via redocly bundle, asyncapiBundle/asyncapiPublicBundle via YAML-AST merge) and the supporting generators (generate-asyncapi-types, generate-module-graph, client-collections-bundle).

**Related Classes/Methods**:

- `scripts.contracts.openapi-bundle.openapiBundle`:196-203
- `scripts.contracts.asyncapi-bundles.asyncapiBundle`:159-170

**Source Files:**

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

### Seed/Demo Data & No-Hardcoded-Text Guard
The data-seeding and demo-data layer plus its cross-cutting guard. Owns the SeedRepository / OwnedSeedRepository persistence abstraction and upsertByOwner that idempotently seeds per-owner collections, the per-module demo seeders (seedAddressBooksCollection, seedCartsCollection, seedWishlistsCollection), and the no-hardcoded-user-text ESLint rule that enforces i18n discipline on user-facing strings. This is the demo-data provisioning seam, distinct from the contract-build pipeline.

**Related Classes/Methods**:

- `src.modules.account.demo.seedAddressBooksCollection`:83-84
- `src.modules.cart.demo.seedCartsCollection`:70-71
- `eslint.rules.no-hardcoded-user-text.noHardcodedUserText`:19-67

**Source Files:**

- `eslint/rules/no-hardcoded-user-text.ts`
  - `eslint.rules.no-hardcoded-user-text.noHardcodedUserText` (L19-L67) - Class
  - `eslint.rules.no-hardcoded-user-text.noHardcodedUserText.create` (L30-L66) - Method
  - `eslint.rules.no-hardcoded-user-text.noHardcodedUserText.create.CallExpression` (L32-L64) - Method
  - `eslint.rules.no-hardcoded-user-text.noHardcodedUserText.create.CallExpression.errors` (L36-L38) - Class
  - `eslint.rules.no-hardcoded-user-text.noHardcodedUserText.create.CallExpression.errors.node.arguments.find() callback` (L37-L37) - Function
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
- `src/modules/cart/demo.ts`
  - `src.modules.cart.demo.seedCartsCollection` (L70-L71) - Class
  - `src.modules.cart.demo.seedCartsCollection.cartFixtures.map() callback` (L71-L71) - Function
- `src/modules/wishlist/demo.ts`
  - `src.modules.wishlist.demo.seedWishlistsCollection` (L39-L40) - Class
  - `src.modules.wishlist.demo.seedWishlistsCollection.wishlistFixtures.map() callback` (L40-L40) - Function
