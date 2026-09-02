---
tags:
  - 2repo
  - 2repo/arch
  - project/boilerplate-node-backend
type: architecture
component: Contract_Verification_Cross_Repo_Identity_Guard
---

```mermaid
graph LR
    Live_Contract_Mutation_Verification_Gates["Live Contract & Mutation Verification Gates"]
    Cross_Repo_Sync_Test_Performance_Reporting["Cross-Repo Sync & Test-Performance Reporting"]
    Contract_Source_of_Truth_Shared_File_Registry["Contract Source-of-Truth & Shared-File Registry"]
    Live_Contract_Mutation_Verification_Gates -- "calls" --> Cross_Repo_Sync_Test_Performance_Reporting
    Live_Contract_Mutation_Verification_Gates -- "Consumes mutation-baseline data model and committed OpenAPI bundle" --> Contract_Source_of_Truth_Shared_File_Registry
    Cross_Repo_Sync_Test_Performance_Reporting -- "Consumes shared-file registry and invokes bundle/dataset staleness gates as subprocesses" --> Contract_Source_of_Truth_Shared_File_Registry
```

## Details

The verification layer that ensures contract integrity across the repository boundary and over time. It hash-compares shared contract files between this repo and the paired frontend (spec-identity), syncs shared files to the frontend when they drift, validates the committed OpenAPI contract against a live Prism mock server, tracks mutation-testing baselines to detect coverage regressions, and reports test-suite performance. This is the guard that makes the contract a verifiable, not just a published, artefact.

### Live Contract & Mutation Verification Gates
Runtime verification gates that prove the contract is live and that test quality is not regressing. Boots a Prism mock server against the committed openapi.yaml and asserts it answers from the spec's own examples (a smoke test of the contract document), owning the spawned process so a failed probe never leaks a server. In parallel runs the per-file mutation ratchet CLI: reads the Stryker JSON report, compares each file's score against the committed baseline, fails the run on any regression, and with --update rewrites the baseline upward only — never lowering it.

**Related Classes/Methods**: _None_

**Source Files:**

- `scripts/check-mutation-baseline.ts`
  - `scripts.check-mutation-baseline.map() callback` (L71-L71) - Function
  - `scripts.check-mutation-baseline.counts.held.comparisons.filter() callback` (L82-L82) - Function
  - `scripts.check-mutation-baseline.counts.improved.comparisons.filter() callback` (L83-L83) - Function
  - `scripts.check-mutation-baseline.counts.added.comparisons.filter() callback` (L84-L84) - Function
  - `scripts.check-mutation-baseline.counts.removed.comparisons.filter() callback` (L85-L85) - Function
  - `scripts.check-mutation-baseline.comparisons.filter() callback` (L102-L102) - Function
- `scripts/run-prism-smoke-test.ts`
  - `scripts.run-prism-smoke-test.prism.stdout.on('data') callback` (L29-L29) - Function
  - `scripts.run-prism-smoke-test.prism.stderr.on('data') callback` (L30-L30) - Function
  - `scripts.run-prism-smoke-test.process.on('SIGINT') callback` (L37-L37) - Function
  - `scripts.run-prism-smoke-test.prism.on('error') callback` (L47-L48) - Function
  - `scripts.run-prism-smoke-test.prism.on('exit') callback` (L50-L52) - Function
- `src/modules/account/module.ts`
  - `src.modules.account.module.resolve` (L49-L85) - Class
  - `src.modules.account.module.resolve.<function>` (L49-L85) - Function
  - `src.modules.account.module.<function>.then() callback` (L51-L58) - Function
  - `src.modules.account.module.resolve.<function>.then() callback.then() callback` (L62-L62) - Function
  - `src.modules.account.module.resolve.<function>.then() callback` (L65-L84) - Function
- `src/modules/account/services/token-cleanup.ts`
  - `src.modules.account.services.token-cleanup.runTokenCleanup` (L27-L46) - Class
  - `src.modules.account.services.token-cleanup.runTokenCleanup.then() callback` (L31-L33) - Function
  - `src.modules.account.services.token-cleanup.runTokenCleanup.catch() callback` (L34-L45) - Function
- `src/modules/account/services/tokens.ts`
  - `src.modules.account.services.tokens.findLiveToken` (L30-L45) - Class
  - `src.modules.account.services.tokens.findLiveToken.then() callback` (L34-L45) - Function
- `src/modules/account/session/config.ts`
  - `src.modules.account.session.config.RefreshTokenExpiryTime` (L12-L16) - Enum
- `src/modules/account/session/jwt.ts`
  - `src.modules.account.session.jwt.verifyRefreshToken` (L82-L101) - Class
  - `src.modules.account.session.jwt.verifyRefreshToken.<function>` (L83-L101) - Function
  - `src.modules.account.session.jwt.verifyRefreshToken.<function>.verify() callback` (L85-L100) - Function
  - `src.modules.account.session.jwt.verifyRefreshToken.<function>.verify() callback.then() callback` (L92-L98) - Function
  - `src.modules.account.session.jwt.verifyRefreshToken.<function>.verify() callback.catch() callback` (L99-L99) - Function
  - `src.modules.account.session.jwt.createAccessToken` (L207-L214) - Class
  - `src.modules.account.session.jwt.createAccessToken.then() callback` (L208-L213) - Function
- `src/modules/feedback/emails.ts`
  - `src.modules.feedback.emails.ContactRequest` (L15-L21) - Interface
- `src/modules/users/repository.ts`
  - `src.modules.users.repository.userRepository` (L53-L334) - Class
  - `src.modules.users.repository.userRepository.updateMany` (L95-L96) - Method
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
  - `src.modules.users.service.consumeToken` (L283-L293) - Class
  - `src.modules.users.service.consumeToken.then() callback` (L284-L293) - Function
  - `src.modules.users.service.consumeToken.then() callback.user.tokens.filter() callback` (L288-L288) - Function

### Cross-Repo Sync & Test-Performance Reporting
Drift-resolution and observability layer. Enforces that the paired frontend holds byte-identical copies of backend-owned shared files: runs staleness gates (contract bundles + demo dataset must match their sources) before a single byte moves, copies each drifted file to the frontend checkout (with dry-run / forced modes), and unconditionally triggers the frontend's client regeneration. Alongside this it reports test-suite performance — bucketing suites/tests by module, surfacing the slowest suites and tests, listing failures by module, and reading lcov.info to report per-module line coverage.

**Related Classes/Methods**:

- `scripts.sync-shared-files-to-frontend.outcomes`:80-95
- `scripts.report-test-results.slowestSuites`:180-186

**Source Files:**

- `scripts/report-test-results.ts`
  - `scripts.report-test-results.slowestSuites` (L180-L186) - Class
  - `scripts.report-test-results.slowestSuites.report.testResults.map() callback` (L181-L184) - Function
  - `scripts.report-test-results.slowestSuites.toSorted() callback` (L185-L185) - Function
  - `scripts.report-test-results.covered.toSorted() callback` (L270-L271) - Function
  - `scripts.report-test-results.covered` (L270-L272) - Class
- `scripts/sync-shared-files-to-frontend.ts`
  - `scripts.sync-shared-files-to-frontend.outcomes` (L80-L95) - Class
  - `scripts.sync-shared-files-to-frontend.outcomes.SHARED_FILES.map() callback` (L80-L95) - Function
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
- `src/modules/account/services/tokens.ts`
  - `src.modules.account.services.tokens.findLiveToken.then() callback.entry` (L40-L40) - Class
  - `src.modules.account.services.tokens.findLiveToken.then() callback.entry.user.tokens.find() callback` (L40-L40) - Function
- `src/modules/account/services/two-factor.ts`
  - `src.modules.account.services.two-factor.setupTwoFactor` (L66-L86) - Class
  - `src.modules.account.services.two-factor.setupTwoFactor.then() callback` (L71-L85) - Function
  - `src.modules.account.services.two-factor.setupTwoFactor.then() callback.then() callback` (L82-L83) - Function
  - `src.modules.account.services.two-factor.setupTwoFactor.catch() callback` (L86-L86) - Function
- `src/modules/account/session/jwt.ts`
  - `src.modules.account.session.jwt.createRefreshToken` (L111-L146) - Class
  - `src.modules.account.session.jwt.createRefreshToken.then() callback` (L119-L146) - Function
- `src/modules/users/demo.ts`
  - `src.modules.users.demo.SEED_CUSTOMER_EMAILS` (L105-L107) - Class
  - `src.modules.users.demo.SEED_CUSTOMER_EMAILS.CUSTOMER_NAMES.map() callback` (L106-L106) - Function
- `src/modules/users/repository.ts`
  - `src.modules.users.repository.userRepository.findByIdWithCredentials` (L101-L102) - Method
- `src/modules/users/service.ts`
  - `src.modules.users.service.getById` (L60-L63) - Class
  - `src.modules.users.service.getById.then() callback` (L62-L62) - Function

### Contract Source-of-Truth & Shared-File Registry
Declarative core that defines what is shared and how the contract is assembled. Owns the SHARED_FILES registry and the SpecComparison model used to hash-compare this repo against the sibling checkout (classifying each file as match/drift/missing-here/missing-there), the OpenAPI bundle assembly guard that fails loudly when MODULE_SECTIONS drifts from the live module registry, the mutation-baseline data model (formatRegressions, MutationBaseline) that the ratchet gate consumes, and the demo dataset seeding (seed.*Collection, upsertById) that produces the shared demo artefact both repos must agree on.

**Related Classes/Methods**:

- `scripts.spec-identity.compareSharedFiles`:134-163
- `src.infrastructure.persistence.seed.upsertById`:54-62

**Source Files:**

- `scripts/contracts/openapi-bundle.ts`
  - `scripts.contracts.openapi-bundle.assertModuleSectionsAreCurrent.shouldBeListed` (L77-L79) - Class
  - `scripts.contracts.openapi-bundle.assertModuleSectionsAreCurrent.shouldBeListed.enabledModules.map() callback` (L78-L78) - Function
  - `scripts.contracts.openapi-bundle.assertModuleSectionsAreCurrent.shouldBeListed.filter() callback` (L78-L78) - Function
- `scripts/mutation-baseline.ts`
  - `scripts.mutation-baseline.formatRegressions.regressed` (L217-L217) - Class
  - `scripts.mutation-baseline.formatRegressions.regressed.comparisons.filter() callback` (L217-L217) - Function
- `scripts/spec-identity.ts`
  - `scripts.spec-identity.SharedFile` (L31-L34) - Interface
  - `scripts.spec-identity.SpecComparison` (L102-L112) - Interface
  - `scripts.spec-identity.compareSharedFiles` (L134-L163) - Class
  - `scripts.spec-identity.compareSharedFiles.SHARED_FILES.map() callback` (L139-L163) - Function
- `src/infrastructure/persistence/seed.ts`
  - `src.infrastructure.persistence.seed.upsertById` (L54-L62) - Class
  - `src.infrastructure.persistence.seed.upsertById.then() callback` (L58-L61) - Function
  - `src.infrastructure.persistence.seed.upsertById.then() callback.then() callback` (L61-L61) - Function
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
  - `src.modules.users.demo.customerUsers.CUSTOMER_NAMES.map() callback` (L109-L116) - Function
  - `src.modules.users.demo.customerUsers` (L109-L117) - Class
  - `src.modules.users.demo.seedUsersCollection` (L122-L123) - Class
  - `src.modules.users.demo.seedUsersCollection.userFixtures.map() callback` (L123-L123) - Function
- `src/modules/users/model.ts`
  - `src.modules.users.model.UserRecord` (L77-L116) - Interface
  - `src.modules.users.model.UserDocument` (L121-L131) - Interface
  - `src.modules.users.model.tokenAdd` (L413-L433) - Function
  - `src.modules.users.model.tokenRemoveAll` (L438-L448) - Function
- `src/modules/users/service.ts`
  - `src.modules.users.service.update.then() callback.revoke` (L187-L190) - Class
  - `src.modules.users.service.update.then() callback.revoke.catch() callback` (L189-L189) - Function
  - `src.modules.users.service.update.then() callback.revoke.then() callback` (L191-L191) - Function
  - `src.modules.users.service.remove.then() callback.revoke` (L254-L256) - Class
  - `src.modules.users.service.remove.then() callback.revoke.catch() callback` (L255-L255) - Function
  - `src.modules.users.service.remove.then() callback.revoke.then() callback` (L257-L257) - Function
