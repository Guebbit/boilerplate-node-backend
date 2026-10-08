---
tags:
  - 2brain
  - 2brain/arch
  - project/boilerplate-node-backend
type: architecture
component: Scenario_Application_Orchestrator
---

```mermaid
graph LR
    Scenario_Bootstrap_Adapter_Conductor["Scenario Bootstrap & Adapter Conductor"]
    HTTP_Security_Configuration_Foundation["HTTP Security & Configuration Foundation"]
    Returns_Bounded_Context_Seeded_Flow_Target_["Returns Bounded Context (Seeded Flow Target)"]
    Scenario_Bootstrap_Adapter_Conductor -- "Drives the return lifecycle end-to-end via loopback HTTP dispatch" --> Returns_Bounded_Context_Seeded_Flow_Target_
    HTTP_Security_Configuration_Foundation -- "Delegates upload quarantine filesystem cleanup to the conductor's adapter layer" --> Scenario_Bootstrap_Adapter_Conductor
    Returns_Bounded_Context_Seeded_Flow_Target_ -- "Consumes transport-level rate-limiting, content-type gating, and idempotency for its write endpoints" --> HTTP_Security_Configuration_Foundation
```

## Details

The entry-point and environment-bootstrap layer of the flow driver. scenarios/apply.ts is the single command that the demo profile invokes (npm run db:bootstrap → scenario:apply); it wires together the security middleware (installRequestParsing, isRawBodyPath), the kernel authentication resolvers (AuthResolver, CredentialResolver, ResolvedCredential), the filesystem and image-store adapters, and the scaffold/mutation-CI planning utilities, then hands control to the execution engine. It is the conductor that ensures the app is in a fully configured, authenticated, and filesystem-ready state before any HTTP flow is driven.

### Scenario Bootstrap & Adapter Conductor
The entry-point and environment-bootstrap layer of the flow driver. `scenarios/apply.ts` is the single command the demo profile invokes; it wires together the security middleware, the kernel authentication resolvers, the filesystem and image-store adapters, and the scaffold/mutation-CI planning utilities, then hands control to the execution engine (`buildScenario`). It is the conductor that ensures the app is in a fully configured, authenticated, and filesystem-ready state before any HTTP flow is driven. It also owns the pure planning data (`ScaffoldPlan`/`PlannedFile`) and the content-based image identification pipeline (`identifyImage`, `ImageFormat`) that the seeded flows' upload paths depend on.

**Related Classes/Methods**:

- `src.infrastructure.adapters.image-signatures.identifyImage`:107-112
- `src.infrastructure.adapters.filesystem.deleteFile`:49-59

**Source Files:**

- `scenarios/apply.ts`
  - `scenarios.apply.filter() callback` (L91-L91) - Function
- `scripts/contracts/check-asyncapi-breaking.ts`
  - `scripts.contracts.check-asyncapi-breaking.then() callback` (L90-L131) - Function
- `scripts/mutation/ci/slice-ignorer.ts`
  - `scripts.mutation.ci.slice-ignorer.LineSlice` (L17-L20) - Interface
  - `scripts.mutation.ci.slice-ignorer.NodeLocation` (L23-L26) - Interface
  - `scripts.mutation.ci.slice-ignorer.IgnorerPath` (L29-L31) - Interface
  - `scripts.mutation.ci.slice-ignorer.strykerPlugins.value.shouldIgnore` (L84-L87) - Method
- `scripts/scaffold/plan.ts`
  - `scripts.scaffold.plan.PlannedFile` (L15-L20) - Interface
  - `scripts.scaffold.plan.ScaffoldPlan` (L23-L28) - Interface
- `src/infrastructure/adapters/filesystem.ts`
  - `src.infrastructure.adapters.filesystem.deleteFile` (L49-L59) - Class
  - `src.infrastructure.adapters.filesystem.deleteFile.toolkitDeleteFile() callback` (L51-L58) - Function
- `src/infrastructure/adapters/image-signatures.ts`
  - `src.infrastructure.adapters.image-signatures.ImageFormat` (L19-L32) - Interface
  - `src.infrastructure.adapters.image-signatures.hasMarker` (L97-L99) - Class
  - `src.infrastructure.adapters.image-signatures.hasMarker.marker.bytes.every() callback` (L99-L99) - Function
  - `src.infrastructure.adapters.image-signatures.identifyImage` (L107-L112) - Class
  - `src.infrastructure.adapters.image-signatures.identifyImage.SUPPORTED_IMAGE_FORMATS.find() callback` (L109-L111) - Function
  - `src.infrastructure.adapters.image-signatures.identifyImage.SUPPORTED_IMAGE_FORMATS.find() callback.every() callback` (L111-L111) - Function
  - `src.infrastructure.adapters.image-signatures.extensionForImage` (L153-L154) - Class
  - `src.infrastructure.adapters.image-signatures.extensionForImage.SUPPORTED_IMAGE_FORMATS.find() callback` (L154-L154) - Function
- `src/infrastructure/adapters/image-store.ts`
  - `src.infrastructure.adapters.image-store.ImageStore` (L25-L103) - Interface
  - `src.infrastructure.adapters.image-store.ImageStore.quarantine` (L35-L35) - Method
  - `src.infrastructure.adapters.image-store.ImageStore.readQuarantined` (L44-L44) - Method
  - `src.infrastructure.adapters.image-store.ImageStore.removeQuarantined` (L55-L55) - Method
  - `src.infrastructure.adapters.image-store.ImageStore.promote` (L76-L76) - Method
  - `src.infrastructure.adapters.image-store.ImageStore.putDerivative` (L90-L90) - Method
  - `src.infrastructure.adapters.image-store.ImageStore.remove` (L102-L102) - Method
  - `src.infrastructure.adapters.image-store.filesystemImageStore` (L195-L254) - Class
  - `src.infrastructure.adapters.image-store.filesystemImageStore.quarantine` (L196-L204) - Method
  - `src.infrastructure.adapters.image-store.filesystemImageStore.readQuarantined` (L206-L206) - Method
  - `src.infrastructure.adapters.image-store.filesystemImageStore.removeQuarantined` (L208-L208) - Method
  - `src.infrastructure.adapters.image-store.filesystemImageStore.promote` (L210-L220) - Method
  - `src.infrastructure.adapters.image-store.filesystemImageStore.putDerivative` (L222-L229) - Method
  - `src.infrastructure.adapters.image-store.filesystemImageStore.remove` (L231-L253) - Method
  - `src.infrastructure.adapters.image-store.filesystemImageStore.remove.then() callback` (L251-L251) - Function
- `src/infrastructure/adapters/image.worker.ts`
  - `src.infrastructure.adapters.image.worker.UnsupportedImageFormatError` (L44-L46) - Class
  - `src.infrastructure.adapters.image.worker.DigestedImageUrls` (L74-L79) - Interface
  - `src.infrastructure.adapters.image.worker.digestQuarantinedImage` (L133-L164) - Class
  - `src.infrastructure.adapters.image.worker.digestQuarantinedImage.then() callback` (L134-L164) - Function
  - `src.infrastructure.adapters.image.worker.then() callback.then() callback` (L144-L145) - Function
  - `src.infrastructure.adapters.image.worker.digestQuarantinedImage.then() callback.then() callback.then() callback` (L145-L145) - Function
  - `src.infrastructure.adapters.image.worker.digestQuarantinedImage.then() callback.catch() callback` (L147-L155) - Function
  - `src.infrastructure.adapters.image.worker.digestQuarantinedImage.then() callback.then() callback` (L163-L163) - Function
  - `src.infrastructure.adapters.image.worker.settleWriteback` (L186-L214) - Class
  - `src.infrastructure.adapters.image.worker.settleWriteback.then() callback` (L193-L214) - Function
  - `src.infrastructure.adapters.image.worker.then() callback.clearQuarantine.then() callback` (L209-L209) - Function
  - `src.infrastructure.adapters.image.worker.settleWriteback.then() callback.then() callback` (L210-L210) - Function
  - `src.infrastructure.adapters.image.worker.settleWriteback.then() callback.clearQuarantine.then() callback` (L213-L213) - Function
  - `src.infrastructure.adapters.image.worker.handleImageDigestJob` (L226-L266) - Class
  - `src.infrastructure.adapters.image.worker.handleImageDigestJob.then() callback` (L247-L248) - Function
  - `src.infrastructure.adapters.image.worker.handleImageDigestJob.then() callback.then() callback` (L248-L248) - Function
  - `src.infrastructure.adapters.image.worker.handleImageDigestJob.catch() callback` (L250-L265) - Function
  - `src.infrastructure.adapters.image.worker.handleImageDigestJob.catch() callback.then() callback` (L256-L256) - Function
  - `src.infrastructure.adapters.image.worker.enqueueImageDigest` (L284-L313) - Class
  - `src.infrastructure.adapters.image.worker.enqueueImageDigest.runInline` (L288-L297) - Class
  - `src.infrastructure.adapters.image.worker.enqueueImageDigest.runInline.then() callback` (L289-L296) - Function
  - `src.infrastructure.adapters.image.worker.enqueueImageDigest.runInline.then() callback.then() callback` (L296-L296) - Function
  - `src.infrastructure.adapters.image.worker.enqueueImageDigest.then() callback` (L305-L312) - Function
  - `src.infrastructure.adapters.image.worker.enqueueIfImagePending` (L333-L357) - Class
  - `src.infrastructure.adapters.image.worker.enqueueIfImagePending.then() callback` (L349-L356) - Function
- `src/infrastructure/adapters/remote-image.ts`
  - `src.infrastructure.adapters.remote-image.digestBytes` (L78-L95) - Class
  - `src.infrastructure.adapters.remote-image.digestBytes.then() callback` (L84-L88) - Function
  - `src.infrastructure.adapters.remote-image.digestBytes.then() callback.finally() callback` (L86-L87) - Function
  - `src.infrastructure.adapters.remote-image.digestBytes.catch() callback` (L90-L93) - Function
  - `src.infrastructure.adapters.remote-image.digestBytes.catch() callback.then() callback` (L91-L93) - Function
- `src/infrastructure/http/middlewares/upload.ts`
  - `src.infrastructure.http.middlewares.upload.releaseUnclaimedUpload` (L297-L304) - Class
  - `src.infrastructure.http.middlewares.upload.releaseUnclaimedUpload.response.once('close') callback` (L298-L303) - Function
- `src/infrastructure/http/uploads.ts`
  - `src.infrastructure.http.uploads.RequestImage` (L29-L58) - Interface
  - `src.infrastructure.http.uploads.deleteUpload` (L88-L88) - Method
  - `src.infrastructure.http.uploads.readUploadedImage.deleteUpload` (L111-L111) - Method
- `src/infrastructure/observability/metrics-http.ts`
  - `src.infrastructure.observability.metrics-http.RequestMetricInput` (L95-L101) - Interface
- `src/infrastructure/observability/tracer.ts`
  - `src.infrastructure.observability.tracer.tracer.startActiveSpan() callback.then() callback` (L57-L57) - Function
- `src/kernel/authentication.ts`
  - `src.kernel.authentication.AuthResolver` (L28-L31) - Interface
  - `src.kernel.authentication.ResolvedCredential` (L46-L49) - Interface
  - `src.kernel.authentication.CredentialResolver` (L52-L54) - Interface
- `src/modules/account/emails.ts`
  - `src.modules.account.emails.resetConfirmEmail.data.providers.providers.providers.map() callback` (L312-L312) - Function
- `src/modules/account/services/oauth.ts`
  - `src.modules.account.services.oauth.discardAvatar` (L117-L120) - Class
  - `src.modules.account.services.oauth.discardAvatar.then() callback` (L118-L120) - Function
- `src/modules/account/services/two-factor.ts`
  - `src.modules.account.services.two-factor.entryFor.existing` (L177-L177) - Class
  - `src.modules.account.services.two-factor.entryFor.existing.user.twoFactorMethods.find() callback` (L177-L177) - Function
- `src/modules/example/services/personal-data.ts`
  - `src.modules.example.services.personal-data.eraseForUser` (L51-L59) - Class
  - `src.modules.example.services.personal-data.eraseForUser.then() callback` (L55-L58) - Function
  - `src.modules.example.services.personal-data.eraseForUser.then() callback.<function>` (L55-L58) - Function
  - `src.modules.example.services.personal-data.eraseForUser.then() callback.<function>.imageUrls.map() callback` (L56-L56) - Function
  - `src.modules.example.services.personal-data.eraseForUser.then() callback.<function>.then() callback` (L57-L57) - Function
- `src/modules/users/services/lookups.ts`
  - `src.modules.users.services.lookups.emailTaken` (L68-L69) - Class
  - `src.modules.users.services.lookups.emailTaken.then() callback` (L69-L69) - Function
- `src/modules/users/services/read.ts`
  - `src.modules.users.services.read.getById` (L24-L27) - Class
  - `src.modules.users.services.read.getById.then() callback` (L26-L26) - Function
- `src/modules/users/services/signup.ts`
  - `src.modules.users.services.signup.discardFailedSignup` (L81-L82) - Class
  - `src.modules.users.services.signup.discardFailedSignup.then() callback` (L82-L82) - Function
- `src/modules/users/services/update.ts`
  - `src.modules.users.services.update.changedRole` (L95-L101) - Class
  - `src.modules.users.services.update.changedRole.then() callback` (L98-L100) - Function
  - `src.modules.users.services.update.updateSavedUser` (L111-L119) - Class
  - `src.modules.users.services.update.updateSavedUser.then() callback` (L117-L118) - Function
  - `src.modules.users.services.update.saveWithRole` (L127-L189) - Class
  - `src.modules.users.services.update.saveWithRole.then() callback` (L153-L188) - Function
  - `src.modules.users.services.update.saveWithRole.then() callback.imageCleanup` (L155-L157) - Class
  - `src.modules.users.services.update.saveWithRole.then() callback.imageCleanup.then() callback` (L156-L156) - Function
  - `src.modules.users.services.update.saveWithRole.then() callback.then() callback` (L186-L186) - Function
  - `src.modules.users.services.update.refusalFor.missing` (L270-L270) - Class
  - `src.modules.users.services.update.refusalFor.missing.find() callback` (L270-L270) - Function

### HTTP Security & Configuration Foundation
The request-path foundation the conductor boots into. `src/app/security.ts` installs the request-parsing middleware (`installRequestParsing`) and the raw-body path predicate (`isRawBodyPath`) that every seeded flow's HTTP request must traverse. `src/infrastructure/config/*` provides the typed environment store (`define`, `fields`, `store`) that `apply.ts`'s `installEnvironment` overrides (rate-limit budgets, mail transport, broker off, bank-transfer beneficiary) read from. `src/infrastructure/http/uploads.ts` and `http/middlewares/upload.ts` expose the multipart form-file extraction the seeded image-upload flows rely on. This sub-component is the horizontal band the conductor depends on — it is not demo-specific, but it is the surface the demo profile must be in a known state before driving any flow.

**Related Classes/Methods**:

- `src.app.security.installRequestParsing`:200-239
- `src.app.security.isRawBodyPath`:48-51
- `src.infrastructure.config.store.overrideEnvironment`:113-129
- `src.infrastructure.config.fields.BuildOptions`:81-86
- `src.infrastructure.http.uploads.getFormFiles`:24-26

**Source Files:**

- `src/app/security.ts`
  - `src.app.security.isRawBodyPath` (L48-L51) - Class
  - `src.app.security.isRawBodyPath.RAW_BODY_PATHS.some() callback` (L50-L50) - Function
  - `src.app.security.installRequestParsing` (L200-L239) - Class
  - `src.app.security.installRequestParsing.verify` (L219-L225) - Method
- `src/infrastructure/config/define.ts`
  - `src.infrastructure.config.define.ConfigError` (L66-L72) - Class
  - `src.infrastructure.config.define.ConfigError.constructor` (L68-L71) - Constructor
  - `src.infrastructure.config.define.configProblems.merged` (L277-L279) - Class
  - `src.infrastructure.config.define.configProblems.merged.all.flatMap() callback` (L278-L278) - Function
  - `src.infrastructure.config.define.assertConfigIn.clauses` (L297-L303) - Class
  - `src.infrastructure.config.define.assertConfigIn.clauses.filter() callback` (L303-L303) - Function
- `src/infrastructure/config/fields.ts`
  - `src.infrastructure.config.fields.CommonOptions` (L55-L60) - Interface
  - `src.infrastructure.config.fields.BuildOptions` (L81-L86) - Interface
  - `src.infrastructure.config.fields.RangeOptions` (L112-L119) - Interface
  - `src.infrastructure.config.fields.TextOptions` (L271-L276) - Interface
  - `src.infrastructure.config.fields.CsvOptions` (L328-L333) - Interface
- `src/infrastructure/config/store.ts`
  - `src.infrastructure.config.store.StoreState` (L24-L37) - Interface
  - `src.infrastructure.config.store.overrideEnvironment` (L113-L129) - Class
  - `src.infrastructure.config.store.overrideEnvironment.before` (L116-L118) - Class
  - `src.infrastructure.config.store.overrideEnvironment.before.map() callback` (L117-L117) - Function
  - `src.infrastructure.config.store.overrideEnvironment.<function>` (L122-L128) - Function
- `src/infrastructure/http/middlewares/content-type.ts`
  - `src.infrastructure.http.middlewares.content-type.requireDeclaredContentType` (L41-L62) - Class
  - `src.infrastructure.http.middlewares.content-type.requireDeclaredContentType.<function>` (L44-L61) - Function
- `src/infrastructure/http/middlewares/request-logger.ts`
  - `src.infrastructure.http.middlewares.request-logger.requestLogger` (L17-L43) - Class
  - `src.infrastructure.http.middlewares.request-logger.requestLogger.response.once('finish') callback` (L21-L40) - Function
- `src/infrastructure/http/middlewares/upload.ts`
  - `src.infrastructure.http.middlewares.upload.resolveUploadDestination` (L66-L84) - Class
  - `src.infrastructure.http.middlewares.upload.resolveUploadDestination.then() callback` (L82-L82) - Function
  - `src.infrastructure.http.middlewares.upload.resolveUploadDestination.catch() callback` (L83-L83) - Function
  - `src.infrastructure.http.middlewares.upload.validateUploadedImages` (L221-L264) - Class
  - `src.infrastructure.http.middlewares.upload.validateUploadedImages.paths.map() callback` (L235-L235) - Function
  - `src.infrastructure.http.middlewares.upload.validateUploadedImages.then() callback` (L236-L262) - Function
  - `src.infrastructure.http.middlewares.upload.validateUploadedImages.then() callback.then() callback` (L259-L261) - Function
  - `src.infrastructure.http.middlewares.upload.validateUploadedImages.catch() callback` (L263-L263) - Function
  - `src.infrastructure.http.middlewares.upload.cleanupAfterPartialQuarantine` (L276-L285) - Class
  - `src.infrastructure.http.middlewares.upload.cleanupAfterPartialQuarantine.staged.map() callback` (L281-L281) - Function
  - `src.infrastructure.http.middlewares.upload.cleanupAfterPartialQuarantine.results.filter() callback` (L283-L283) - Function
  - `src.infrastructure.http.middlewares.upload.cleanupAfterPartialQuarantine.map() callback` (L284-L284) - Function
  - `src.infrastructure.http.middlewares.upload.digestQuarantinedKeysInline` (L317-L345) - Class
  - `src.infrastructure.http.middlewares.upload.digestQuarantinedKeysInline.keys.map() callback` (L329-L329) - Function
  - `src.infrastructure.http.middlewares.upload.digestQuarantinedKeysInline.then() callback` (L331-L340) - Function
  - `src.infrastructure.http.middlewares.upload.digestQuarantinedKeysInline.then() callback.digested.map() callback` (L333-L333) - Function
  - `src.infrastructure.http.middlewares.upload.digestQuarantinedKeysInline.then() callback.keys.map() callback` (L337-L337) - Function
  - `src.infrastructure.http.middlewares.upload.digestQuarantinedKeysInline.then() callback.then() callback` (L337-L338) - Function
  - `src.infrastructure.http.middlewares.upload.digestQuarantinedKeysInline.catch() callback` (L341-L344) - Function
  - `src.infrastructure.http.middlewares.upload.digestQuarantinedKeysInline.catch() callback.keys.map() callback` (L342-L342) - Function
  - `src.infrastructure.http.middlewares.upload.digestQuarantinedKeysInline.catch() callback.then() callback` (L342-L343) - Function
  - `src.infrastructure.http.middlewares.upload.quarantineUploadedImages` (L359-L423) - Class
  - `src.infrastructure.http.middlewares.upload.quarantineUploadedImages.staged.map() callback` (L369-L369) - Function
  - `src.infrastructure.http.middlewares.upload.quarantineUploadedImages.then() callback` (L371-L417) - Function
  - `src.infrastructure.http.middlewares.upload.quarantineUploadedImages.then() callback.then() callback` (L374-L375) - Function
  - `src.infrastructure.http.middlewares.upload.quarantineUploadedImages.catch() callback` (L422-L422) - Function
- `src/infrastructure/http/uploads.ts`
  - `src.infrastructure.http.uploads.getFormFiles` (L24-L26) - Function
- `src/infrastructure/observability/metrics-outbox.ts`
  - `src.infrastructure.observability.metrics-outbox._outboxPendingGauge` (L58-L74) - Class
  - `src.infrastructure.observability.metrics-outbox._outboxPendingGauge.collect` (L62-L73) - Method
  - `src.infrastructure.observability.metrics-outbox._outboxPendingGauge.collect.then() callback` (L69-L71) - Function
  - `src.infrastructure.observability.metrics-outbox._outboxPendingGauge.collect.catch() callback` (L72-L72) - Function
- `src/infrastructure/observability/metrics-registry.ts`
  - `src.infrastructure.observability.metrics-registry._processUptimeGauge` (L38-L45) - Class
  - `src.infrastructure.observability.metrics-registry._processUptimeGauge.collect` (L42-L44) - Method
- `src/infrastructure/runtime/otel-sdk.ts`
  - `src.infrastructure.runtime.otel-sdk.redactUrlSecrets.secrets` (L66-L66) - Class
  - `src.infrastructure.runtime.otel-sdk.redactUrlSecrets.secrets.QUERY_SECRETS.filter() callback` (L66-L66) - Function
- `src/infrastructure/runtime/server-lifecycle.ts`
  - `src.infrastructure.runtime.server-lifecycle.listenOn` (L43-L53) - Class
  - `src.infrastructure.runtime.server-lifecycle.listenOn.<function>` (L44-L53) - Function
  - `src.infrastructure.runtime.server-lifecycle.closeServer.<function>.cutTimer` (L106-L109) - Class
  - `src.infrastructure.runtime.server-lifecycle.closeServer.<function>.cutTimer.setTimeout() callback` (L107-L107) - Function
  - `src.infrastructure.runtime.server-lifecycle.registerSignalHandlers.onProcessSignal.forcedExitTimer` (L185-L189) - Class
  - `src.infrastructure.runtime.server-lifecycle.registerSignalHandlers.onProcessSignal.forcedExitTimer.setTimeout() callback` (L185-L189) - Function

### Returns Bounded Context (Seeded Flow Target)
The returns domain module — one of the bounded contexts whose endpoints the seeded flows exercise end-to-end. It owns the returnable-quantity computation (`returnableLinesOf`, `wireLines`, `ProductQuantity`), the status projection (`projectReturnStatus`, `ProjectedReturn`), and the two service operations the demo flow drives: `create` (with `alreadyReturned` guard and `openUnderLock`) and `receive` (with `claimAndRestock` and `ReceiveReturnInput`). This sub-component is the domain-side target of the conductor's HTTP flows: the conductor drives the real `POST /returns` and `POST /returns/:id/receive` endpoints, and this module is what answers them. It is included in the subsystem because the demo profile's shop history is incomplete without a returns leg, and the conductor's `buildScenario` registry maps the `shop` scenario to flows that hit these endpoints.

**Related Classes/Methods**:

- `src.modules.returns.domain.quantities.returnableLinesOf`:36-44
- `src.modules.returns.domain.status-projection.projectReturnStatus`:32-54
- `src.modules.returns.services.create.alreadyReturned`:215-222
- `src.modules.returns.services.receive.claimAndRestock`:99-124

**Source Files:**

- `src/modules/returns/domain/quantities.ts`
  - `src.modules.returns.domain.quantities.ProductQuantity` (L8-L11) - Interface
  - `src.modules.returns.domain.quantities.wireLines` (L24-L27) - Class
  - `src.modules.returns.domain.quantities.wireLines.lines.map() callback` (L27-L27) - Function
  - `src.modules.returns.domain.quantities.returnableLinesOf` (L36-L44) - Class
  - `src.modules.returns.domain.quantities.returnableLinesOf.items.filter() callback` (L43-L43) - Function
  - `src.modules.returns.domain.quantities.returnableLinesOf.map() callback` (L44-L44) - Function
  - `src.modules.returns.domain.quantities.checkRequestedLines.lines.filter() callback` (L84-L84) - Function
  - `src.modules.returns.domain.quantities.checkRequestedLines.lines.map() callback` (L100-L100) - Function
- `src/modules/returns/domain/status-projection.ts`
  - `src.modules.returns.domain.status-projection.ProjectedReturn` (L12-L15) - Interface
  - `src.modules.returns.domain.status-projection.projectReturnStatus` (L32-L54) - Class
  - `src.modules.returns.domain.status-projection.holding.some() callback` (L42-L42) - Function
- `src/modules/returns/services/create.ts`
  - `src.modules.returns.services.create.alreadyReturned` (L215-L222) - Class
  - `src.modules.returns.services.create.alreadyReturned.then() callback` (L218-L221) - Function
  - `src.modules.returns.services.create.alreadyReturned.then() callback.returns.filter() callback` (L220-L220) - Function
  - `src.modules.returns.services.create.alreadyReturned.then() callback.flatMap() callback` (L221-L221) - Function
  - `src.modules.returns.services.create.openUnderLock` (L276-L298) - Class
  - `src.modules.returns.services.create.openUnderLock.withTransaction() callback` (L280-L297) - Function
  - `src.modules.returns.services.create.openUnderLock.withTransaction() callback.then() callback` (L284-L297) - Function
  - `src.modules.returns.services.create.openUnderLock.withTransaction() callback.then() callback.then() callback` (L295-L295) - Function
- `src/modules/returns/services/projection.ts`
  - `src.modules.returns.services.projection.syncReturnStatus.then() callback.status` (L26-L32) - Class
  - `src.modules.returns.services.projection.syncReturnStatus.then() callback.status.returns.map() callback` (L27-L30) - Function
- `src/modules/returns/services/receive.ts`
  - `src.modules.returns.services.receive.ReceiveReturnInput` (L47-L50) - Interface
  - `src.modules.returns.services.receive.claimAndRestock` (L99-L124) - Class
  - `src.modules.returns.services.receive.claimAndRestock.withTransaction() callback` (L104-L124) - Function
  - `src.modules.returns.services.receive.then() callback.then() callback` (L201-L201) - Function
