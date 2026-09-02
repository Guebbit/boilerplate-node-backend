---
tags:
  - 2repo
  - 2repo/arch
  - project/boilerplate-node-backend
type: architecture
component: Contract_Type_Generation_Architectural_Quality_Gates
---

```mermaid
graph LR
    Contract_Type_Generation_Mutation_Testing_Pipeline["Contract Type Generation & Mutation Testing Pipeline"]
    Controller_Chain_Invariant_Enforcement["Controller Chain Invariant Enforcement"]
    Persistence_Boundary_Guard_Platform_Kernel["Persistence Boundary Guard & Platform Kernel"]
    Contract_Type_Generation_Mutation_Testing_Pipeline -- "Demo server script dispatches to demo seeding surface at runtime" --> Controller_Chain_Invariant_Enforcement
    Contract_Type_Generation_Mutation_Testing_Pipeline -- "Reads kernel module registry to validate contract bundle membership" --> Persistence_Boundary_Guard_Platform_Kernel
    Controller_Chain_Invariant_Enforcement -- "Demo seeding surface consumes kernel adapters (logger, module registry) at runtime" --> Persistence_Boundary_Guard_Platform_Kernel
```

## Details

The code-generation and quality-gate pipeline itself. It comprises three functional pillars: (a) Type generation — generate-asyncapi-types parses asyncapi.yaml and emits src/types/asyncapi.generated.ts (payload interfaces, channel constants, SSE event maps) with a --check mode that fails CI on drift; generate-module-graph runs dependency-cruiser over src/modules and writes Mermaid diagrams into docs/modules/index.md and per-module pages, also with --check for divergence detection. (b) Architectural invariant enforcement — custom ESLint rules controllerChainMustCatch (promise chains in controllers must end in .catch()) and noPersistenceImports (persistence handles and schema files stay behind the repository) encode the layering contract as machine-checkable rules. (c) Mutation testing — mutation-baseline records the current mutation score, and run-mutation-diff compares against the baseline to gate PRs on test-suite effectiveness. This sub-component is the active enforcement layer that validates Groups 1 and 2.

### Contract Type Generation & Mutation Testing Pipeline
The code-generation and test-effectiveness pipeline. It owns every scripts/ entry point that transforms declarative contracts into build artifacts or CI verdicts: AsyncAPI to TypeScript type emission with --check CI gating, module dependency graph rendering via dependency-cruiser into Mermaid diagrams, mutation-testing baseline recording and regression diffing, OpenAPI contract bundling and Postman/Insomnia collection generation, and operational housekeeping scripts for account pruning and frontend type syncing.

**Related Classes/Methods**:

- `scripts.run-mutation-diff.baseArgument`
- `scripts.contracts.client-collections-bundle.allProbes`:260-261

**Source Files:**

- `scripts/contracts/client-collections-bundle.ts`
  - `scripts.contracts.client-collections-bundle.allProbes` (L260-L261) - Class
  - `scripts.contracts.client-collections-bundle.allProbes.requests.filter() callback` (L261-L261) - Function
  - `scripts.contracts.client-collections-bundle.contentFor` (L264-L269) - Class
  - `scripts.contracts.client-collections-bundle.contentFor.<function>` (L264-L269) - Function
- `scripts/contracts/openapi-bundle.ts`
  - `scripts.contracts.openapi-bundle.assertModuleSectionsAreCurrent.stale` (L83-L83) - Class
  - `scripts.contracts.openapi-bundle.assertModuleSectionsAreCurrent.stale.filter() callback` (L83-L83) - Function
- `scripts/generate-asyncapi-types.ts`
  - `scripts.generate-asyncapi-types.AsyncApiOperation` (L27-L31) - Interface
  - `scripts.generate-asyncapi-types.AsyncApiChannel` (L33-L35) - Interface
  - `scripts.generate-asyncapi-types.AsyncApiMessage` (L37-L39) - Interface
  - `scripts.generate-asyncapi-types.JsonSchema` (L41-L52) - Interface
  - `scripts.generate-asyncapi-types.AsyncApiDocument` (L54-L59) - Interface
  - `scripts.generate-asyncapi-types.renderLiteralArray.lines` (L173-L173) - Class
  - `scripts.generate-asyncapi-types.renderLiteralArray.lines.values.map() callback` (L173-L173) - Function
  - `scripts.generate-asyncapi-types.renderChannelNamespace.entries` (L223-L225) - Class
  - `scripts.generate-asyncapi-types.renderChannelNamespace.entries.channelNames.map() callback` (L224-L224) - Function
  - `scripts.generate-asyncapi-types.buildOutput.sections` (L313-L336) - Class
  - `scripts.generate-asyncapi-types.buildOutput.sections.sseEntries.map() callback` (L330-L330) - Function
  - `scripts.generate-asyncapi-types.then() callback` (L346-L371) - Function
  - `scripts.generate-asyncapi-types.then() callback.modelBlocks` (L347-L350) - Class
  - `scripts.generate-asyncapi-types.then() callback.modelBlocks.models.map() callback` (L348-L349) - Function
  - `scripts.generate-asyncapi-types.catch() callback` (L372-L375) - Function
- `scripts/generate-module-graph.ts`
  - `scripts.generate-module-graph.renderNeighbourhood.listens` (L167-L167) - Class
  - `scripts.generate-module-graph.renderNeighbourhood.listens.events.filter() callback` (L167-L167) - Function
  - `scripts.generate-module-graph.renderNeighbourhood.neighbours` (L169-L176) - Class
  - `scripts.generate-module-graph.renderNeighbourhood.neighbours.announces.map() callback` (L173-L173) - Function
  - `scripts.generate-module-graph.renderNeighbourhood.neighbours.listens.map() callback` (L174-L174) - Function
  - `scripts.generate-module-graph.renderNeighbourhood.neighbours.map() callback` (L195-L195) - Function
  - `scripts.generate-module-graph.renderNeighbourhood.listens.map() callback` (L199-L199) - Function
- `scripts/mutation-baseline.ts`
  - `scripts.mutation-baseline.scoresFromReport.scored` (L103-L103) - Class
  - `scripts.mutation-baseline.scoresFromReport.scored.mutants.filter() callback` (L103-L103) - Function
  - `scripts.mutation-baseline.formatRegressions.lines` (L220-L223) - Class
  - `scripts.mutation-baseline.formatRegressions.lines.regressed.map() callback` (L221-L222) - Function
- `scripts/reap-inactive-accounts.ts`
  - `scripts.reap-inactive-accounts.warn` (L81-L93) - Class
  - `scripts.reap-inactive-accounts.warn.then() callback` (L88-L91) - Function
  - `scripts.reap-inactive-accounts.warn.then() callback.then() callback` (L90-L90) - Function
- `scripts/run-mutation-diff.ts`
  - `scripts.run-mutation-diff.baseArgument` (L51-L51) - Class
  - `scripts.run-mutation-diff.baseArgument.process.argv.find() callback` (L51-L51) - Function
- `scripts/spec-identity.ts`
  - `scripts.spec-identity.formatSharedFileProblems.lines` (L184-L200) - Class
  - `scripts.spec-identity.formatSharedFileProblems.lines.problems.map() callback` (L184-L200) - Function
- `scripts/sync-shared-files-to-frontend.ts`
  - `scripts.sync-shared-files-to-frontend.Outcome` (L74-L78) - Interface
  - `scripts.sync-shared-files-to-frontend.of` (L99-L99) - Class
  - `scripts.sync-shared-files-to-frontend.of.outcomes.filter() callback` (L99-L99) - Function
- `src/infrastructure/adapters/email.worker.ts`
  - `src.infrastructure.adapters.email.worker.handleEmailJob` (L26-L48) - Class
  - `src.infrastructure.adapters.email.worker.handleEmailJob.then() callback` (L41-L41) - Function
  - `src.infrastructure.adapters.email.worker.handleEmailJob.catch() callback` (L42-L47) - Function
- `src/infrastructure/adapters/mailer.ts`
  - `src.infrastructure.adapters.mailer.nodemailer` (L141-L201) - Class
  - `src.infrastructure.adapters.mailer.nodemailer.withSpan('email.send') callback` (L153-L200) - Function
  - `src.infrastructure.adapters.mailer.nodemailer.withSpan('email.send') callback.then() callback` (L191-L196) - Function
  - `src.infrastructure.adapters.mailer.enqueueEmail` (L257-L287) - Class
  - `src.infrastructure.adapters.mailer.enqueueEmail.then() callback` (L275-L286) - Function
  - `src.infrastructure.adapters.mailer.enqueueEmail.then() callback.then() callback` (L278-L278) - Function
- `src/infrastructure/observability/metrics-http.ts`
  - `src.infrastructure.observability.metrics-http._heapSizeLimitGauge` (L52-L59) - Class
  - `src.infrastructure.observability.metrics-http._heapSizeLimitGauge.collect` (L56-L58) - Method
  - `src.infrastructure.observability.metrics-http.RequestMetricInput` (L141-L147) - Interface
  - `src.infrastructure.observability.metrics-http.LatencyBucket` (L194-L198) - Interface
  - `src.infrastructure.observability.metrics-http.aggregateLatencyBuckets.buckets.toSorted() callback` (L237-L237) - Function
  - `src.infrastructure.observability.metrics-http.aggregateLatencyBuckets.buckets.map() callback` (L238-L238) - Function
- `src/infrastructure/observability/tracer.ts`
  - `src.infrastructure.observability.tracer.withSpan` (L32-L74) - Class
  - `src.infrastructure.observability.tracer.withSpan.tracer.startActiveSpan() callback` (L41-L73) - Function
  - `src.infrastructure.observability.tracer.withSpan.tracer.startActiveSpan() callback.then() callback` (L57-L71) - Function
- `src/modules/account/services/authentication.ts`
  - `src.modules.account.services.authentication.requestAccountDeletion` (L64-L90) - Class
  - `src.modules.account.services.authentication.requestAccountDeletion.then() callback` (L65-L90) - Function
  - `src.modules.account.services.authentication.requestPasswordReset` (L120-L153) - Class
  - `src.modules.account.services.authentication.requestPasswordReset.then() callback` (L127-L152) - Function
  - `src.modules.account.services.authentication.requestPasswordReset.then() callback.then() callback` (L131-L150) - Function
  - `src.modules.account.services.authentication.requestAccountSetup` (L161-L171) - Class
  - `src.modules.account.services.authentication.requestAccountSetup.then() callback` (L162-L171) - Function
- `src/modules/account/services/verification.ts`
  - `src.modules.account.services.verification.sendVerificationEmail` (L39-L61) - Class
  - `src.modules.account.services.verification.sendVerificationEmail.then() callback` (L43-L61) - Function
- `src/modules/audit-logs/service.ts`
  - `src.modules.audit-logs.service.record` (L32-L42) - Class
  - `src.modules.audit-logs.service.record.catch() callback` (L33-L41) - Function
- `src/modules/feedback/service.ts`
  - `src.modules.feedback.service.create` (L79-L126) - Class
  - `src.modules.feedback.service.create.then() callback` (L90-L125) - Function
  - `src.modules.feedback.service.create.then() callback.catch() callback` (L117-L121) - Function
- `src/modules/locales/repository.ts`
  - `src.modules.locales.repository.listKeys` (L134-L142) - Class
  - `src.modules.locales.repository.listKeys.rows.map() callback` (L141-L141) - Function
  - `src.modules.locales.repository.importEntries` (L196-L231) - Class
  - `src.modules.locales.repository.importEntries.map() callback` (L209-L215) - Function
  - `src.modules.locales.repository.importEntries.created` (L221-L221) - Class
  - `src.modules.locales.repository.importEntries.created.filter() callback` (L221-L221) - Function
- `src/modules/locales/services/entries.ts`
  - `src.modules.locales.services.entries.importEntries.inputs` (L201-L201) - Class
  - `src.modules.locales.services.entries.importEntries.inputs.entries.map() callback` (L201-L201) - Function

### Controller Chain Invariant Enforcement
A focused, single-responsibility sub-component that encodes the project's error-handling layering contract as a machine-checkable ESLint rule. The rule controllerChainMustCatch walks the AST of every file under src/modules/*/controllers/, identifies promise-chain expressions (.then() sequences), and reports an error if the chain does not terminate in a .catch() handler. The co-located demo.ts provides the development seeding surface with installDemo and runDemoSeed for exercising the invariant against realistic request flows.

**Related Classes/Methods**:

- `eslint.rules.controller-chain-must-catch.controllerChainMustCatch`:83-111
- `eslint.rules.controller-chain-must-catch.controllerChainMustCatch.create`:94-110
- `src.app.demo.installDemo`:37-50
- `src.app.demo.runDemoSeed`:25-34

**Source Files:**

- `eslint/rules/controller-chain-must-catch.ts`
  - `eslint.rules.controller-chain-must-catch.controllerChainMustCatch` (L83-L111) - Class
  - `eslint.rules.controller-chain-must-catch.controllerChainMustCatch.create` (L94-L110) - Method
  - `eslint.rules.controller-chain-must-catch.controllerChainMustCatch.create.CallExpression` (L96-L108) - Method
- `src/app/demo.ts`
  - `src.app.demo.runDemoSeed` (L25-L34) - Class
  - `src.app.demo.runDemoSeed.then() callback.enabledModules.map() callback` (L29-L29) - Function
  - `src.app.demo.runDemoSeed.then() callback` (L32-L34) - Function
  - `src.app.demo.installDemo` (L37-L50) - Class
  - `src.app.demo.installDemo.app.post('/__demo/reset') callback` (L38-L45) - Function
  - `src.app.demo.installDemo.app.post('/__demo/reset') callback.then() callback` (L40-L40) - Function
  - `src.app.demo.installDemo.app.post('/__demo/reset') callback.catch() callback` (L41-L44) - Function
  - `src.app.demo.installDemo.app.get('/__demo/emails') callback` (L47-L49) - Function

### Persistence Boundary Guard & Platform Kernel
The structural layering guard and the platform kernel that modules register into. Two enforcement mechanisms (no-persistence-imports ESLint rule and assertRequiredConfig runtime validation) and three infrastructure adapters (storage, i18n negotiation, structured logging with PII redaction) form this sub-component. The no-persistence-imports rule statically forbids direct imports of Mongoose schema files outside the repository layer, while the kernel registry provides typed ports (ImageTarget, RequiredConfig) and concrete adapters that modules consume at runtime.

**Related Classes/Methods**:

- `src.infrastructure.adapters.logger.redactSensitiveFields`:108-134

**Source Files:**

- `eslint/rules/no-persistence-imports.ts`
  - `eslint.rules.no-persistence-imports.noPersistenceImports.create.ImportDeclaration.name.find() callback` (L109-L110) - Function
  - `eslint.rules.no-persistence-imports.noPersistenceImports.create.ImportDeclaration.name` (L109-L111) - Class
  - `eslint.rules.no-persistence-imports.noPersistenceImports.create.ImportDeclaration.name.find() callback.bindings.some() callback` (L110-L110) - Function
- `src/infrastructure/adapters/logger.ts`
  - `src.infrastructure.adapters.logger.redactSensitiveFields` (L108-L134) - Class
  - `src.infrastructure.adapters.logger.redactSensitiveFields.input.map() callback` (L111-L111) - Function
  - `src.infrastructure.adapters.logger.redactFormat` (L166-L181) - Class
  - `src.infrastructure.adapters.logger.redactFormat.winston.format() callback` (L166-L181) - Function
  - `src.infrastructure.adapters.logger.prettyFormat` (L216-L229) - Class
  - `src.infrastructure.adapters.logger.prettyFormat.winston.format.printf() callback` (L222-L228) - Function
- `src/infrastructure/adapters/storage.ts`
  - `src.infrastructure.adapters.storage.quarantineUploadedImages.then() callback.failed` (L293-L293) - Class
  - `src.infrastructure.adapters.storage.quarantineUploadedImages.then() callback.failed.results.find() callback` (L293-L293) - Function
- `src/infrastructure/i18n/negotiate.ts`
  - `src.infrastructure.i18n.negotiate.negotiateLocale.lowercaseSupported` (L31-L31) - Class
  - `src.infrastructure.i18n.negotiate.negotiateLocale.lowercaseSupported.supported.map() callback` (L31-L31) - Function
- `src/kernel/registry.ts`
  - `src.kernel.registry.RequiredConfig` (L62-L69) - Interface
  - `src.kernel.registry.ImageTarget` (L80-L98) - Interface
  - `src.kernel.registry.assertRequiredConfig.offending` (L198-L204) - Class
  - `src.kernel.registry.assertRequiredConfig.offending.appModules.flatMap() callback` (L199-L199) - Function
  - `src.kernel.registry.assertRequiredConfig.offending.filter() callback` (L200-L203) - Function
  - `src.kernel.registry.assertRequiredConfig.offending.map() callback` (L204-L204) - Function
