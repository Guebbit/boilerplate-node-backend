---
tags:
  - 2brain
  - 2brain/arch
  - project/boilerplate-node-backend
type: architecture
component: Scenario_Account_Flows_Cross_Cutting_Tooling
---

```mermaid
graph LR
    Scenario_Account_Flows_Developer_Tooling_Surface["Scenario Account Flows & Developer Tooling Surface"]
    Human_Challenge_Provider_Port_Adapters["Human-Challenge Provider Port & Adapters"]
    Typed_Configuration_Slice_Framework["Typed Configuration-Slice Framework"]
    Scenario_Account_Flows_Developer_Tooling_Surface -- "Defines antibot email-policy config slice via typed field builders" --> Typed_Configuration_Slice_Framework
    Human_Challenge_Provider_Port_Adapters -- "Composes rung-2 email verdict into the antibot module's HTTP response surface" --> Scenario_Account_Flows_Developer_Tooling_Surface
    Human_Challenge_Provider_Port_Adapters -- "Consumes typed config accessors for provider selection and vendor secrets" --> Typed_Configuration_Slice_Framework
    Typed_Configuration_Slice_Framework -- "Boot-time validation gate inspects and rejects misconfigured antibot policy slice" --> Scenario_Account_Flows_Developer_Tooling_Surface
```

## Details

The scenario-side account flow entry points plus the scattered cross-cutting tooling that the harness touches — contract breaking-change checks, mutation diff reporting, module-scaffold option parsing, the app's system routes (/readyz), and the antibot provider adapters (altcha store, email/MX policy). It is the 'scenario + tooling' surface that the demo server exercises.

### Scenario Account Flows & Developer Tooling Surface
The scenario-side account flow entry points plus the scattered cross-cutting tooling the harness touches: the seed-account persona registry, the contract breaking-change gate, the mutation diff reporter, the module-scaffold CLI option parser, the app's system routes, and the antibot rung-2 email/MX policy. It is the entry-point layer that the demo server and developer tooling drive, kept out of src/modules because it belongs to nobody's business logic.

**Related Classes/Methods**:

- `src.infrastructure.adapters.antibot.checkEmailPolicy`:55-86

**Source Files:**

- `scenarios/accounts.ts`
  - `scenarios.accounts.then() callback` (L200-L219) - Function
- `scenarios/support/doubles/payments/fake.ts`
  - `scenarios.support.doubles.payments.fake.parseWebhook.then() callback` (L237-L237) - Function
- `scripts/contracts/check-asyncapi-breaking.ts`
  - `scripts.contracts.check-asyncapi-breaking.catch() callback` (L132-L135) - Function
- `scripts/mutation/run-diff.ts`
  - `scripts.mutation.run-diff.then() callback` (L106-L106) - Function
- `scripts/scaffold/options.ts`
  - `scripts.scaffold.options.ScaffoldOptions` (L10-L23) - Interface
  - `scripts.scaffold.options.ParseRefusal` (L38-L40) - Interface
- `scripts/scaffold/scaffold-module.ts`
  - `scripts.scaffold.scaffold-module.then() callback` (L70-L73) - Function
- `src/app/system-routes.ts`
  - `src.app.system-routes.router.get('/readyz') callback` (L40-L42) - Function
- `src/infrastructure/adapters/antibot-providers/altcha.ts`
  - `src.infrastructure.adapters.antibot-providers.altcha.issue` (L47-L59) - Class
  - `src.infrastructure.adapters.antibot-providers.altcha.issue.then() callback` (L56-L59) - Function
- `src/infrastructure/adapters/antibot-providers/index.ts`
  - `src.infrastructure.adapters.antibot-providers.index.humanChallengeProviderProbe` (L135-L139) - Class
  - `src.infrastructure.adapters.antibot-providers.index.humanChallengeProviderProbe.check` (L138-L138) - Method
- `src/infrastructure/adapters/antibot.ts`
  - `src.infrastructure.adapters.antibot.hasMxRecord` (L39-L43) - Class
  - `src.infrastructure.adapters.antibot.hasMxRecord.then() callback` (L42-L42) - Function
  - `src.infrastructure.adapters.antibot.hasMxRecord.catch() callback` (L43-L43) - Function
  - `src.infrastructure.adapters.antibot.checkEmailPolicy` (L55-L86) - Class
  - `src.infrastructure.adapters.antibot.checkEmailPolicy.then() callback` (L56-L86) - Function
  - `src.infrastructure.adapters.antibot.checkEmailPolicy.then() callback.then() callback` (L85-L85) - Function
- `src/infrastructure/adapters/config.ts`
  - `src.infrastructure.adapters.config.mailConfig` (L27-L51) - Class
  - `src.infrastructure.adapters.config.mailConfig.check` (L39-L50) - Method
  - `src.infrastructure.adapters.config.mailConfig.check.SMTP_COMPANIONS.filter() callback` (L42-L42) - Function
  - `src.infrastructure.adapters.config.antibotConfig` (L136-L164) - Class
  - `src.infrastructure.adapters.config.antibotConfig.check` (L148-L163) - Method
- `src/infrastructure/adapters/mail-transports.ts`
  - `src.infrastructure.adapters.mail-transports.mailTransportProbe` (L116-L120) - Class
  - `src.infrastructure.adapters.mail-transports.mailTransportProbe.check` (L119-L119) - Method
- `src/infrastructure/adapters/pdf.ts`
  - `src.infrastructure.adapters.pdf.then() callback.then() callback` (L240-L240) - Function
- `src/infrastructure/config/define.ts`
  - `src.infrastructure.config.define.FieldInfo` (L26-L33) - Interface
  - `src.infrastructure.config.define.SliceProblems` (L36-L43) - Interface
  - `src.infrastructure.config.define.ConfigSlice` (L46-L58) - Interface
  - `src.infrastructure.config.define.ConfigSlice.inspect` (L57-L57) - Method
  - `src.infrastructure.config.define.ConfigDefinition` (L183-L193) - Interface
  - `src.infrastructure.config.define.ConfigDefinition.check` (L192-L192) - Method
  - `src.infrastructure.config.define.presenceProblems.presence.map() callback` (L214-L214) - Function
  - `src.infrastructure.config.define.slice` (L230-L243) - Class
  - `src.infrastructure.config.define.defineConfig.slice.inspect` (L233-L242) - Method
  - `src.infrastructure.config.define.configProblems.all` (L274-L274) - Class
  - `src.infrastructure.config.define.configProblems.all.slices.map() callback` (L274-L274) - Function
  - `src.infrastructure.config.define.configProblems.invalid.merged() callback` (L281-L281) - Function
  - `src.infrastructure.config.define.configProblems.presence.merged() callback` (L282-L282) - Function
  - `src.infrastructure.config.define.configProblems.checks.merged() callback` (L283-L283) - Function
- `src/infrastructure/config/fields.ts`
  - `src.infrastructure.config.fields.int` (L158-L169) - Function
  - `src.infrastructure.config.fields.choice` (L232-L254) - Function
  - `src.infrastructure.config.fields.text` (L285-L291) - Function
- `src/infrastructure/http/config.ts`
  - `src.infrastructure.http.config.rateLimitBudgetConfig.shape.budgets.map() callback` (L92-L95) - Function
- `src/infrastructure/http/middlewares/cache.ts`
  - `src.infrastructure.http.middlewares.cache.CachedResponse` (L35-L39) - Interface
- `src/infrastructure/http/middlewares/idempotency-model.ts`
  - `src.infrastructure.http.middlewares.idempotency-model.IdempotencyRecordDocument` (L27-L38) - Interface
- `src/infrastructure/observability/analytics/index.ts`
  - `src.infrastructure.observability.analytics.index.analyticsProviderProbe` (L229-L233) - Class
  - `src.infrastructure.observability.analytics.index.analyticsProviderProbe.check` (L232-L232) - Method
- `src/infrastructure/runtime/provider-registry.ts`
  - `src.infrastructure.runtime.provider-registry.ProviderRegistry` (L18-L35) - Interface
  - `src.infrastructure.runtime.provider-registry.ProviderRegistry.register` (L24-L24) - Method
  - `src.infrastructure.runtime.provider-registry.ProviderRegistry.names` (L27-L27) - Method
  - `src.infrastructure.runtime.provider-registry.ProviderRegistry.resolve` (L34-L34) - Method
  - `src.infrastructure.runtime.provider-registry.registryOver` (L42-L48) - Class
  - `src.infrastructure.runtime.provider-registry.registryOver.register` (L43-L45) - Method
  - `src.infrastructure.runtime.provider-registry.registryOver.names` (L46-L46) - Method
  - `src.infrastructure.runtime.provider-registry.registryOver.resolve` (L47-L47) - Method
- `src/modules/account/oauth/config.ts`
  - `src.modules.account.oauth.config.oauthConfig` (L32-L51) - Class
  - `src.modules.account.oauth.config.oauthConfig.check` (L43-L50) - Method
  - `src.modules.account.oauth.config.oauthConfig.check.PROVIDER_PAIRS.some() callback` (L45-L45) - Function
- `src/modules/account/oauth/providers/github.ts`
  - `src.modules.account.oauth.providers.github.githubOAuthProvider.exchangeCode.then() callback.primary` (L126-L126) - Class
  - `src.modules.account.oauth.providers.github.githubOAuthProvider.exchangeCode.then() callback.primary.emails.find() callback` (L126-L126) - Function
- `src/modules/account/oauth/providers/index.ts`
  - `src.modules.account.oauth.providers.index.enabledProviders` (L35-L36) - Class
  - `src.modules.account.oauth.providers.index.enabledProviders.filter() callback` (L36-L36) - Function
- `src/modules/invoicing/emails.ts`
  - `src.modules.invoicing.emails.DocumentVatRow` (L42-L52) - Interface
  - `src.modules.invoicing.emails.DocumentTaxSummaryRow` (L55-L61) - Interface
  - `src.modules.invoicing.emails.DocumentVatBlock` (L64-L92) - Interface
  - `src.modules.invoicing.emails.buildVatBlock.rows.document.lines.map() callback` (L160-L169) - Function
  - `src.modules.invoicing.emails.rows` (L160-L169) - Class
  - `src.modules.invoicing.emails.buildVatBlock.shipping.rows.shippingByRate.map() callback` (L208-L214) - Function
  - `src.modules.invoicing.emails.buildVatBlock.summaryRows.taxSummary.map() callback` (L218-L222) - Function
- `src/modules/invoicing/providers/index.ts`
  - `src.modules.invoicing.providers.index.invoicingProviderProbe` (L102-L106) - Class
  - `src.modules.invoicing.providers.index.invoicingProviderProbe.check` (L105-L105) - Method
- `src/modules/observability/services/process-snapshot.ts`
  - `src.modules.observability.services.process-snapshot.ProcessMemorySnapshot` (L11-L23) - Interface
  - `src.modules.observability.services.process-snapshot.ProcessSnapshot` (L26-L33) - Interface
- `src/modules/payments/config.ts`
  - `src.modules.payments.config.webhookSecretRing` (L86-L87) - Class
  - `src.modules.payments.config.webhookSecretRing.map() callback` (L87-L87) - Function
  - `src.modules.payments.config.paymentsConfig` (L98-L123) - Class
  - `src.modules.payments.config.paymentsConfig.check` (L113-L122) - Method
  - `src.modules.payments.config.paymentsConfig.check.some() callback` (L116-L116) - Function
- `src/modules/payments/providers/index.ts`
  - `src.modules.payments.providers.index.paymentProviderProbe` (L239-L243) - Class
  - `src.modules.payments.providers.index.paymentProviderProbe.check` (L242-L242) - Method
- `src/modules/payments/providers/webhook-signature.ts`
  - `src.modules.payments.providers.webhook-signature.verifyWebhookSignature.pairs` (L85-L88) - Class
  - `src.modules.payments.providers.webhook-signature.verifyWebhookSignature.pairs.map() callback` (L85-L88) - Function
  - `src.modules.payments.providers.webhook-signature.verifyWebhookSignature.timestamp` (L90-L90) - Class
  - `src.modules.payments.providers.webhook-signature.verifyWebhookSignature.timestamp.pairs.find() callback` (L90-L90) - Function
  - `src.modules.payments.providers.webhook-signature.verifyWebhookSignature.provided` (L93-L93) - Class
  - `src.modules.payments.providers.webhook-signature.verifyWebhookSignature.provided.map() callback` (L93-L93) - Function
  - `src.modules.payments.providers.webhook-signature.verifyWebhookSignature.provided.pairs.filter() callback` (L93-L93) - Function

### Human-Challenge Provider Port & Adapters
Rung 3 of the anti-automation ladder — the HumanChallengeProvider port and its concrete adapters (none, turnstile, altcha), the single-use altcha-store, the humanChallengeGate middleware, and the antibot module's getAntibotChallenge controller. A clean ports-and-adapters boundary where the module owns the HTTP surface and infrastructure owns the provider implementations.

**Related Classes/Methods**:

- `src.infrastructure.adapters.antibot-providers.index.HumanChallengeProvider`:58-90
- `src.infrastructure.adapters.antibot-providers.turnstile.turnstileProvider`:60-67
- `src.infrastructure.adapters.antibot-providers.altcha-store.claim`:94-100
- `src.infrastructure.http.middlewares.human-challenge.humanChallengeGate`:36-64
- `src.modules.antibot.controllers.get-antibot-challenge.getAntibotChallenge`:20-38

**Source Files:**

- `src/infrastructure/adapters/antibot-providers/altcha-store.ts`
  - `src.infrastructure.adapters.antibot-providers.altcha-store.claim` (L94-L100) - Class
  - `src.infrastructure.adapters.antibot-providers.altcha-store.claim.then() callback` (L99-L99) - Function
- `src/infrastructure/adapters/antibot-providers/altcha.ts`
  - `src.infrastructure.adapters.antibot-providers.altcha.check` (L106-L125) - Class
  - `src.infrastructure.adapters.antibot-providers.altcha.check.then() callback.then() callback` (L119-L119) - Function
  - `src.infrastructure.adapters.antibot-providers.altcha.check.then() callback` (L123-L123) - Function
  - `src.infrastructure.adapters.antibot-providers.altcha.altchaProvider` (L128-L135) - Class
  - `src.infrastructure.adapters.antibot-providers.altcha.altchaProvider.publicParameters` (L132-L132) - Method
  - `src.infrastructure.adapters.antibot-providers.altcha.altchaProvider.verify` (L134-L134) - Method
  - `src.infrastructure.adapters.antibot-providers.altcha.altchaProvider.verify.catch() callback` (L134-L134) - Function
- `src/infrastructure/adapters/antibot-providers/index.ts`
  - `src.infrastructure.adapters.antibot-providers.index.IssuedChallenge` (L24-L28) - Interface
  - `src.infrastructure.adapters.antibot-providers.index.ChallengeParameters` (L31-L45) - Interface
  - `src.infrastructure.adapters.antibot-providers.index.HumanChallengeProvider` (L58-L90) - Interface
  - `src.infrastructure.adapters.antibot-providers.index.HumanChallengeProvider.publicParameters` (L71-L71) - Method
  - `src.infrastructure.adapters.antibot-providers.index.HumanChallengeProvider.issueChallenge` (L80-L80) - Method
  - `src.infrastructure.adapters.antibot-providers.index.HumanChallengeProvider.verify` (L89-L89) - Method
- `src/infrastructure/adapters/antibot-providers/none.ts`
  - `src.infrastructure.adapters.antibot-providers.none.noneProvider` (L11-L15) - Class
  - `src.infrastructure.adapters.antibot-providers.none.noneProvider.publicParameters` (L13-L13) - Method
  - `src.infrastructure.adapters.antibot-providers.none.noneProvider.verify` (L14-L14) - Method
- `src/infrastructure/adapters/antibot-providers/turnstile.ts`
  - `src.infrastructure.adapters.antibot-providers.turnstile.siteverify` (L38-L57) - Class
  - `src.infrastructure.adapters.antibot-providers.turnstile.then() callback` (L52-L53) - Function
  - `src.infrastructure.adapters.antibot-providers.turnstile.siteverify.then() callback` (L55-L56) - Function
  - `src.infrastructure.adapters.antibot-providers.turnstile.turnstileProvider` (L60-L67) - Class
  - `src.infrastructure.adapters.antibot-providers.turnstile.turnstileProvider.publicParameters` (L62-L65) - Method
  - `src.infrastructure.adapters.antibot-providers.turnstile.turnstileProvider.verify` (L66-L66) - Method
  - `src.infrastructure.adapters.antibot-providers.turnstile.turnstileProvider.verify.catch() callback` (L66-L66) - Function
- `src/infrastructure/http/middlewares/human-challenge.ts`
  - `src.infrastructure.http.middlewares.human-challenge.humanChallengeGate` (L36-L64) - Class
  - `src.infrastructure.http.middlewares.human-challenge.humanChallengeGate.then() callback` (L55-L61) - Function
  - `src.infrastructure.http.middlewares.human-challenge.humanChallengeGate.catch() callback` (L63-L63) - Function
- `src/modules/antibot/controllers/get-antibot-challenge.ts`
  - `src.modules.antibot.controllers.get-antibot-challenge.getAntibotChallenge` (L20-L38) - Class
  - `src.modules.antibot.controllers.get-antibot-challenge.then() callback` (L22-L22) - Function
  - `src.modules.antibot.controllers.get-antibot-challenge.getAntibotChallenge.then() callback` (L23-L37) - Function
  - `src.modules.antibot.controllers.get-antibot-challenge.getAntibotChallenge.then() callback.then() callback` (L36-L36) - Function
- `src/modules/antibot/controllers/get-antibot-config.ts`
  - `src.modules.antibot.controllers.get-antibot-config.getAntibotConfig` (L29-L42) - Class
  - `src.modules.antibot.controllers.get-antibot-config.then() callback` (L31-L31) - Function
  - `src.modules.antibot.controllers.get-antibot-config.getAntibotConfig.then() callback` (L32-L40) - Function

### Typed Configuration-Slice Framework
The single layer that reads, validates, and types the environment — the foundation every adapter slice is written against. defineConfig turns an owner's slice into a typed, memoised accessor. Field builders enforce the 'blank is unset, a set-and-wrong value is an issue, never a silent fallback' rule. versioned-secret.parseVersionedKeyRing handles the vN: versioned key-ring format. The boot gate validates every slice at once.

**Related Classes/Methods**:

- `src.infrastructure.config.fields.build`:98-109
- `src.infrastructure.security.versioned-secret.parseVersionedKeyRing`:32-41
- `src.infrastructure.adapters.config.outboundConfig`:104-113

**Source Files:**

- `src/infrastructure/adapters/config.ts`
  - `src.infrastructure.adapters.config.outboundConfig` (L104-L113) - Class
  - `src.infrastructure.adapters.config.outboundConfig.check` (L109-L112) - Method
  - `src.infrastructure.adapters.config.outboundConfig.check.config.NODE_OUTBOUND_ALLOWED_PORTS.filter() callback` (L111-L111) - Function
  - `src.infrastructure.adapters.config.outboundConfig.check.map() callback` (L112-L112) - Function
- `src/infrastructure/config/define.ts`
  - `src.infrastructure.config.define.presenceBroken` (L135-L147) - Class
  - `src.infrastructure.config.define.presenceBroken.members` (L137-L137) - Class
  - `src.infrastructure.config.define.presenceBroken.members.filter() callback` (L137-L137) - Function
  - `src.infrastructure.config.define.presenceBroken.members.some() callback` (L141-L144) - Function
  - `src.infrastructure.config.define.describeShape` (L150-L155) - Class
  - `src.infrastructure.config.define.describeShape.map() callback` (L151-L155) - Function
  - `src.infrastructure.config.define.presenceProblems.presence.info.filter() callback` (L209-L212) - Function
- `src/infrastructure/config/fields.ts`
  - `src.infrastructure.config.fields.build` (L98-L109) - Function
  - `src.infrastructure.config.fields.build.rule` (L102-L102) - Class
  - `src.infrastructure.config.fields.build.rule.transform() callback` (L102-L102) - Function
  - `src.infrastructure.config.fields.decimal` (L178-L192) - Function
  - `src.infrastructure.config.fields.email` (L300-L305) - Function
  - `src.infrastructure.config.fields.listRule` (L342-L348) - Class
  - `src.infrastructure.config.fields.listRule.transform() callback` (L343-L347) - Function
  - `src.infrastructure.config.fields.listRule.transform() callback.map() callback` (L346-L346) - Function
  - `src.infrastructure.config.fields.listRule.transform() callback.filter() callback` (L347-L347) - Function
  - `src.infrastructure.config.fields.csv` (L355-L359) - Class
  - `src.infrastructure.config.fields.csv.listRule() callback` (L357-L357) - Function
  - `src.infrastructure.config.fields.keyRing` (L367-L371) - Class
  - `src.infrastructure.config.fields.keyRing.listRule() callback` (L369-L369) - Function
  - `src.infrastructure.config.fields.versionedKeyRing` (L378-L382) - Class
  - `src.infrastructure.config.fields.versionedKeyRing.transform() callback` (L380-L380) - Function
- `src/infrastructure/security/versioned-secret.ts`
  - `src.infrastructure.security.versioned-secret.parseVersionedKeyRing` (L32-L41) - Class
  - `src.infrastructure.security.versioned-secret.parseVersionedKeyRing.filter() callback` (L35-L35) - Function
  - `src.infrastructure.security.versioned-secret.parseVersionedKeyRing.map() callback` (L36-L41) - Function
- `src/modules/account/session/config.ts`
  - `src.modules.account.session.config.sessionConfig` (L45-L89) - Class
  - `src.modules.account.session.config.sessionConfig.check` (L82-L88) - Method
