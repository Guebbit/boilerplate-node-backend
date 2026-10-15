---
tags:
  - 2brain
  - 2brain/arch
  - project/boilerplate-node-backend
type: architecture
component: Contract_Type_Code_Generation_Demo_Removal_Ops
---

```mermaid
graph LR
    Invoicing_Domain_Module_E_Invoicing_Provider_Port["Invoicing Domain Module & E-Invoicing Provider Port"]
    Durable_Artifact_Persistence_Retention_Adapters["Durable Artifact Persistence & Retention Adapters"]
    Contract_Generation_Demo_Removal_Ops["Contract Generation & Demo-Removal Ops"]
    Invoicing_Domain_Module_E_Invoicing_Provider_Port -- "Domain consumer of the durable document store (write + read path)" --> Durable_Artifact_Persistence_Retention_Adapters
    Contract_Generation_Demo_Removal_Ops -- "Consumes the module's committed OpenAPI fragment as build-time input for root assembly" --> Invoicing_Domain_Module_E_Invoicing_Provider_Port
```

## Details

Contract-first code generation (AsyncAPI types, error codes, root assembly fragments) plus the ops tooling that strips demo/authorization/test scaffolding and refreshes breached-password corpora. It produces the generated artifacts and the demo-removal transformations that keep the boilerplate reusable.

### Invoicing Domain Module & E-Invoicing Provider Port
The invoicing bounded context — the e-invoicing provider port (a pluggable seam where a national e-invoicing network or the shipped pdf implementation answers), the hand-written repository for invoices/credit-notes and their numbering counters, and the read path that streams a stored PDF. It is the domain consumer of the durable document store and the authorization service's grantable roles.

**Related Classes/Methods**:

- `src.modules.invoicing.providers.index.EInvoicingProvider`:59-69
- `src.modules.invoicing.providers.pdf.pdfEInvoicingProvider`:37-50
- `src.modules.invoicing.repository.insertInvoice`:97-103
- `src.infrastructure.adapters.document-store.readDocument`:49-61
- `src.modules.access.service.grantableRoles`:176-179

**Source Files:**

- `src/infrastructure/adapters/document-store.ts`
  - `src.infrastructure.adapters.document-store.readDocument` (L49-L61) - Class
  - `src.infrastructure.adapters.document-store.readDocument.then() callback` (L55-L59) - Function
- `src/modules/access/service.ts`
  - `src.modules.access.service.grantableRoles` (L176-L179) - Class
  - `src.modules.access.service.grantableRoles.PRESET_ROLES.filter() callback` (L178-L178) - Function
  - `src.modules.access.service.grantableRoles.map() callback` (L179-L179) - Function
- `src/modules/invoicing/providers/index.ts`
  - `src.modules.invoicing.providers.index.EInvoicingDocument` (L30-L50) - Interface
  - `src.modules.invoicing.providers.index.EInvoicingArtifact` (L53-L56) - Interface
  - `src.modules.invoicing.providers.index.EInvoicingProvider` (L59-L69) - Interface
  - `src.modules.invoicing.providers.index.EInvoicingProvider.issue` (L68-L68) - Method
- `src/modules/invoicing/providers/pdf.ts`
  - `src.modules.invoicing.providers.pdf.pdfEInvoicingProvider` (L37-L50) - Class
  - `src.modules.invoicing.providers.pdf.pdfEInvoicingProvider.issue` (L40-L49) - Method
  - `src.modules.invoicing.providers.pdf.issue.then() callback` (L48-L48) - Function
  - `src.modules.invoicing.providers.pdf.pdfEInvoicingProvider.issue.then() callback` (L49-L49) - Function
- `src/modules/invoicing/repository.ts`
  - `src.modules.invoicing.repository.WithId` (L86-L88) - Interface
  - `src.modules.invoicing.repository.insertInvoice` (L97-L103) - Class
  - `src.modules.invoicing.repository.insertInvoice.then() callback` (L103-L103) - Function
  - `src.modules.invoicing.repository.insertCreditNote` (L147-L156) - Class
  - `src.modules.invoicing.repository.insertCreditNote.then() callback` (L156-L156) - Function
- `src/modules/invoicing/services/credit-breakdown.ts`
  - `src.modules.invoicing.services.credit-breakdown.creditBreakdownOf.items.lines.map() callback` (L26-L29) - Function
- `src/modules/invoicing/services/issue-credit-note.ts`
  - `src.modules.invoicing.services.issue-credit-note.creditableOf.lines.invoice.lines.map() callback` (L42-L46) - Function
- `src/modules/invoicing/services/render.ts`
  - `src.modules.invoicing.services.render.storedOrRendered` (L60-L91) - Class
  - `src.modules.invoicing.services.render.storedOrRendered.catch() callback` (L64-L72) - Function
  - `src.modules.invoicing.services.render.storedOrRendered.then() callback` (L74-L89) - Function
  - `src.modules.invoicing.services.render.storedOrRendered.then() callback.then() callback` (L76-L88) - Function
  - `src.modules.invoicing.services.render.storedOrRendered.then() callback.then() callback.then() callback` (L79-L87) - Function
  - `src.modules.invoicing.services.render.renderInvoicePdf` (L100-L105) - Class
  - `src.modules.invoicing.services.render.renderInvoicePdf.storedOrRendered(`invoice-${String(invoice._id)}.pdf`) callback` (L101-L104) - Function
  - `src.modules.invoicing.services.render.renderInvoicePdf.storedOrRendered(`invoice-${String(invoice._id)}.pdf`) callback.then() callback` (L104-L104) - Function
  - `src.modules.invoicing.services.render.renderCreditNotePdf` (L112-L121) - Class
  - `src.modules.invoicing.services.render.renderCreditNotePdf.storedOrRendered(`credit-note-${String(creditNote._id)}.pdf`) callback` (L113-L120) - Function
  - `src.modules.invoicing.services.render.renderCreditNotePdf.storedOrRendered(`credit-note-${String(creditNote._id)}.pdf`) callback.then() callback` (L120-L120) - Function
- `src/modules/invoicing/services/stats.ts`
  - `src.modules.invoicing.services.stats.DocumentTotals` (L17-L27) - Interface
  - `src.modules.invoicing.services.stats.MoneyBucket` (L30-L35) - Interface
- `src/modules/products/domain/preorder.ts`
  - `src.modules.products.domain.preorder.PreorderFacts` (L10-L17) - Interface
- `src/modules/shop/service.ts`
  - `src.modules.shop.service.ShopIdentity` (L51-L65) - Interface
  - `src.modules.shop.service.ReturnAddress` (L88-L96) - Interface

### Durable Artifact Persistence & Retention Adapters
The infrastructure adapters that persist regenerable binary artifacts (rendered PDFs, account exports) to disk with atomic writes, name-shape validation, and retention-based reaping, plus the filesystem primitives they build on. This is the write/retention counterpart to the read path in the invoicing module — a regenerable copy store, never the legal record.

**Related Classes/Methods**:

- `src.infrastructure.adapters.document-store.writeDocument`:72-89
- `src.infrastructure.adapters.export-store.writeExport`:60-89
- `src.infrastructure.adapters.filesystem.pruneUnreferenced`:169-200
- `src.infrastructure.runtime.otel-sdk.publicEndpointPropagator`:99-109

**Source Files:**

- `src/infrastructure/adapters/document-store.ts`
  - `src.infrastructure.adapters.document-store.then() callback` (L54-L54) - Function
  - `src.infrastructure.adapters.document-store.writeDocument` (L72-L89) - Class
  - `src.infrastructure.adapters.document-store.writeDocument.then() callback` (L80-L80) - Function
  - `src.infrastructure.adapters.document-store.writeDocument.catch() callback` (L81-L87) - Function
  - `src.infrastructure.adapters.document-store.writeDocument.catch() callback.then() callback` (L84-L86) - Function
- `src/infrastructure/adapters/export-store.ts`
  - `src.infrastructure.adapters.export-store.writeExport` (L60-L89) - Class
  - `src.infrastructure.adapters.export-store.writeExport.then() callback.produce() callback` (L76-L76) - Function
  - `src.infrastructure.adapters.export-store.writeExport.then() callback.produce() callback.then() callback` (L76-L76) - Function
  - `src.infrastructure.adapters.export-store.writeExport.then() callback.finally() callback` (L76-L77) - Function
  - `src.infrastructure.adapters.export-store.writeExport.then() callback` (L80-L80) - Function
  - `src.infrastructure.adapters.export-store.writeExport.catch() callback` (L81-L87) - Function
  - `src.infrastructure.adapters.export-store.writeExport.catch() callback.then() callback` (L84-L86) - Function
- `src/infrastructure/adapters/filesystem.ts`
  - `src.infrastructure.adapters.filesystem.unlinkIfPresent` (L75-L88) - Class
  - `src.infrastructure.adapters.filesystem.unlinkIfPresent.then() callback` (L82-L87) - Function
  - `src.infrastructure.adapters.filesystem.pruneUnreferenced` (L169-L200) - Class
  - `src.infrastructure.adapters.filesystem.pruneUnreferenced.catch() callback` (L175-L178) - Function
  - `src.infrastructure.adapters.filesystem.pruneUnreferenced.then() callback` (L179-L200) - Function
  - `src.infrastructure.adapters.filesystem.pruneUnreferenced.then() callback.then() callback` (L196-L199) - Function
- `src/infrastructure/runtime/otel-sdk.ts`
  - `src.infrastructure.runtime.otel-sdk.publicEndpointPropagator` (L99-L109) - Class
  - `src.infrastructure.runtime.otel-sdk.publicEndpointPropagator.inject` (L102-L104) - Method
  - `src.infrastructure.runtime.otel-sdk.publicEndpointPropagator.extract` (L106-L106) - Method
  - `src.infrastructure.runtime.otel-sdk.publicEndpointPropagator.fields` (L107-L107) - Method

### Contract Generation & Demo-Removal Ops
Pure, disk-owning build/ops scripts that (a) generate the contract-derived artifacts — AsyncAPI TypeScript types, the error-code registry, and the assembled root OpenAPI document from module fragments — and (b) perform the demo-removal transformations (pruning authorization grants and conformance cases, removing test/demo modules) plus the breached-password corpus refresh. It treats the committed contract as the single source of truth and produces the artifacts and transformations that keep the boilerplate reusable.

**Related Classes/Methods**:

- `scripts.contracts.generate-error-codes.rows`

**Source Files:**

- `scripts/contracts/cookie-auth.ts`
  - `scripts.contracts.cookie-auth.SecuredOperation` (L26-L29) - Interface
- `scripts/contracts/fragments.ts`
  - `scripts.contracts.fragments.DeclaredTag` (L16-L19) - Interface
- `scripts/contracts/generate-asyncapi-types.ts`
  - `scripts.contracts.generate-asyncapi-types.buildOutput.sections` (L532-L561) - Class
  - `scripts.contracts.generate-asyncapi-types.buildOutput.sections.sseEntries.map() callback` (L555-L555) - Function
- `scripts/contracts/generate-error-codes.ts`
  - `scripts.contracts.generate-error-codes.rows` (L81-L81) - Class
  - `scripts.contracts.generate-error-codes.rows.codes.map() callback` (L81-L81) - Function
- `scripts/contracts/personal-data-assembly.ts`
  - `scripts.contracts.personal-data-assembly.PersonalDataSection` (L33-L42) - Interface
- `scripts/contracts/prune-unused.ts`
  - `scripts.contracts.prune-unused.BundledDocument` (L26-L29) - Interface
- `scripts/contracts/root-assembly.ts`
  - `scripts.contracts.root-assembly.ModuleFragment` (L22-L31) - Interface
  - `scripts.contracts.root-assembly.appendMissingTags.used` (L108-L108) - Class
  - `scripts.contracts.root-assembly.appendMissingTags.used.fragments.flatMap() callback` (L108-L108) - Function
  - `scripts.contracts.root-assembly.appendMissingTags.wanted` (L109-L111) - Class
  - `scripts.contracts.root-assembly.appendMissingTags.wanted.filter() callback` (L110-L110) - Function
- `scripts/mutation/baseline.ts`
  - `scripts.mutation.baseline.missingFromReport` (L230-L236) - Class
  - `scripts.mutation.baseline.missingFromReport.filter() callback` (L235-L235) - Function
- `scripts/mutation/check-baseline.ts`
  - `scripts.mutation.check-baseline.printProgress` (L104-L114) - Class
  - `scripts.mutation.check-baseline.printProgress.comparisons.filter() callback` (L109-L109) - Function
- `scripts/mutation/pull-baseline.ts`
  - `scripts.mutation.pull-baseline.listArtifacts` (L28-L32) - Class
  - `scripts.mutation.pull-baseline.listArtifacts.then() callback` (L32-L32) - Function
  - `scripts.mutation.pull-baseline.then() callback.then() callback` (L49-L49) - Function
  - `scripts.mutation.pull-baseline.catch() callback` (L67-L70) - Function
- `scripts/pairing/spec-identity.ts`
  - `scripts.pairing.spec-identity.sharedFileProblems` (L192-L193) - Class
  - `scripts.pairing.spec-identity.sharedFileProblems.comparisons.filter() callback` (L193-L193) - Function
- `scripts/pairing/sync-to-frontend.ts`
  - `scripts.pairing.sync-to-frontend.Outcome` (L112-L119) - Interface
  - `scripts.pairing.sync-to-frontend.list` (L156-L157) - Class
  - `scripts.pairing.sync-to-frontend.list.items.map() callback` (L157-L157) - Function
- `scripts/scaffold/apply.ts`
  - `scripts.scaffold.apply.applyScaffold.edits` (L99-L107) - Class
  - `scripts.scaffold.apply.applyScaffold.edits.map() callback` (L100-L106) - Function
- `scripts/scaffold/central-edits.ts`
  - `scripts.scaffold.central-edits.CentralEdit` (L21-L26) - Interface
  - `scripts.scaffold.central-edits.appendToList` (L36-L51) - Class
  - `scripts.scaffold.central-edits.appendToList.items.map() callback` (L48-L48) - Function
  - `scripts.scaffold.central-edits.addParityEntry` (L67-L85) - Class
  - `scripts.scaffold.central-edits.addParityEntry.sorted.map() callback` (L82-L82) - Function
  - `scripts.scaffold.central-edits.centralEdits` (L92-L108) - Class
  - `scripts.scaffold.central-edits.centralEdits.apply` (L106-L106) - Method
- `scripts/scaffold/names.ts`
  - `scripts.scaffold.names.ModuleNames` (L8-L29) - Interface
  - `scripts.scaffold.names.snake` (L75-L76) - Class
  - `scripts.scaffold.names.snake.replaceAll() callback` (L76-L76) - Function
  - `scripts.scaffold.names.permissionKeys` (L134-L135) - Class
  - `scripts.scaffold.names.permissionKeys.KEY_ACTIONS.map() callback` (L135-L135) - Function
