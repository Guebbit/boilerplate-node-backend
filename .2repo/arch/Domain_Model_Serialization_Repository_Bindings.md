---
tags:
  - 2repo
  - 2repo/arch
  - project/boilerplate-node-backend
type: architecture
component: Domain_Model_Serialization_Repository_Bindings
---

```mermaid
graph LR
    Address_Book_Repository_Checkout_Domain_Rule_Layer["Address-Book Repository & Checkout Domain-Rule Layer"]
    Cart_Repository_Service_Bindings["Cart Repository & Service Bindings"]
    Serialization_Pipeline_Order_Audit_Model_Bindings["Serialization Pipeline & Order/Audit Model Bindings"]
    Address_Book_Repository_Checkout_Domain_Rule_Layer -- "calls" --> Cart_Repository_Service_Bindings
    Address_Book_Repository_Checkout_Domain_Rule_Layer -- "Repository factory binding with serialization transform (compile-time)" --> Serialization_Pipeline_Order_Audit_Model_Bindings
    Cart_Repository_Service_Bindings -- "Order persistence and total computation through the serialized order repository" --> Serialization_Pipeline_Order_Audit_Model_Bindings
```

## Details

The per-module serialization pipeline and concrete repository/model bindings that sit between the persistence factory and the business services. This includes the applySerialization / transform pipeline (which maps Mongoose documents to plain-data DTOs with lean/hydrated control), the SerializableSchema contract, and the domain-specific model documents (OrderDocument, OrderDocumentItem) and repository instances (cartRepository, addressBookRepository, applyAuditLogTransform). This sub-component is the second target of the no-persistence-imports rule: the rule ensures that services and controllers consume the serialized plain data returned by these repositories rather than reaching into the raw Mongoose documents. Mutation testing validates that the serialization transforms are covered by the test suite.

### Address-Book Repository & Checkout Domain-Rule Layer
The account address-book repository binding plus the cart/checkout domain-rule layer that sits on top of the repositories. addressBookRepository binds the shared factory to the address collection and exposes the CRUD surface (addEntry, updateEntry, removeEntry, findByUserId, deleteByUserId). The domain-rules module (CartLineCandidate, CheckoutShortfall, evaluateCheckout, shortfalls) and the checkout/address services (addressForCheckout, retractOrder) are the business-logic consumers that operate on the serialized plain data produced by these repositories — enforcing the rule that services never touch raw Mongoose documents. This group represents the business-core-consumes-repository-DTOs half of the seam, complementing the cart binding in Group 2.

**Related Classes/Methods**:

- `src.modules.account.repository.addressBookRepository`:27-119
- `src.modules.cart.domain.rules.evaluateCheckout`:65-84
- `src.modules.account.services.addresses.addressForCheckout`:84-92
- `src.modules.orders.service.retractOrder`:122-142

**Source Files:**

- `src/modules/account/repository.ts`
  - `src.modules.account.repository.addressBookRepository` (L27-L119) - Class
  - `src.modules.account.repository.addressBookRepository.findByUserId` (L46-L47) - Method
  - `src.modules.account.repository.addressBookRepository.addEntry` (L56-L66) - Method
  - `src.modules.account.repository.addressBookRepository.updateEntry` (L74-L92) - Method
  - `src.modules.account.repository.addressBookRepository.removeEntry` (L98-L107) - Method
  - `src.modules.account.repository.addressBookRepository.removeEntry.book.items.filter() callback` (L103-L103) - Function
  - `src.modules.account.repository.addressBookRepository.deleteByUserId` (L112-L118) - Method
  - `src.modules.account.repository.addressBookRepository.deleteByUserId.then() callback` (L116-L118) - Function
- `src/modules/account/services/addresses.ts`
  - `src.modules.account.services.addresses.addressForCheckout` (L84-L92) - Class
  - `src.modules.account.services.addresses.addressForCheckout.then() callback` (L88-L92) - Function
  - `src.modules.account.services.addresses.addressForCheckout.then() callback.book.items.find() callback` (L91-L91) - Function
- `src/modules/cart/domain/rules.ts`
  - `src.modules.cart.domain.rules.CartLineCandidate` (L8-L19) - Interface
  - `src.modules.cart.domain.rules.CheckoutShortfall` (L22-L27) - Interface
  - `src.modules.cart.domain.rules.evaluateCheckout` (L65-L84) - Class
  - `src.modules.cart.domain.rules.evaluateCheckout.lines.some() callback` (L67-L67) - Function
  - `src.modules.cart.domain.rules.shortfalls` (L73-L80) - Class
  - `src.modules.cart.domain.rules.evaluateCheckout.shortfalls.lines.filter() callback` (L74-L74) - Function
  - `src.modules.cart.domain.rules.evaluateCheckout.shortfalls.map() callback` (L75-L80) - Function
- `src/modules/cart/services/checkout.ts`
  - `src.modules.cart.services.checkout.toStockLines` (L46-L47) - Class
  - `src.modules.cart.services.checkout.toStockLines.lines.map() callback` (L47-L47) - Function
  - `src.modules.cart.services.checkout.runCheckout` (L78-L234) - Class
- `src/modules/cart/services/reorder.ts`
  - `src.modules.cart.services.reorder.reorderIntoCart.then() callback.requested` (L64-L70) - Class
  - `src.modules.cart.services.reorder.reorderIntoCart.then() callback.requested.order.items.map() callback` (L64-L70) - Function
  - `src.modules.cart.services.reorder.reorderIntoCart.then() callback.requested.map() callback` (L74-L77) - Function
  - `src.modules.cart.services.reorder.reorderIntoCart.then() callback.requested.map() callback.then() callback` (L77-L77) - Function
- `src/modules/delivery/domain/rates.ts`
  - `src.modules.delivery.domain.rates.findShippingMethod` (L22-L23) - Class
  - `src.modules.delivery.domain.rates.findShippingMethod.SHIPPING_METHODS.find() callback` (L23-L23) - Function
- `src/modules/orders/service.ts`
  - `src.modules.orders.service.retractOrder` (L122-L142) - Class
  - `src.modules.orders.service.retractOrder.report` (L127-L133) - Class
  - `src.modules.orders.service.retractOrder.report.<function>` (L127-L133) - Function
  - `src.modules.orders.service.retractOrder.then() callback` (L140-L140) - Function

### Cart Repository & Service Bindings
The cart module's concrete binding of the shared serialization/repository pipeline to its own domain. cartRepository spreads createRepository(cartModel, { transform: applyCartTransform }) and adds the cart-specific writes keyed by userId (findByUserId, upsertLine, removeLine, clearLines, clearLinesIfUnchanged, deleteByUserId, removeProductFromAll), including the optimistic-concurrency guard clearLinesIfUnchanged that makes checkout's empty-the-cart step race-safe. The service layer (cartGet, cartViewOf, cartRemove, productRemoveFromCartsById, CartView) consumes the serialized plain data returned by the repository rather than raw documents — the exact consumer side the no-persistence-imports rule enforces. This group is the clearest end-to-end example of the repository-returns-DTO, service-reads-DTO flow.

**Related Classes/Methods**:

- `src.modules.cart.repository.cartRepository`:75-180
- `src.modules.cart.repository.cartRepository.clearLinesIfUnchanged`:146-154
- `src.modules.cart.services.items.cartGet`:30-31
- `src.modules.cart.services.cleanup.productRemoveFromCartsById`:32-44

**Source Files:**

- `src/modules/cart/repository.ts`
  - `src.modules.cart.repository.cartRepository` (L75-L180) - Class
  - `src.modules.cart.repository.cartRepository.findByUserId` (L97-L97) - Method
  - `src.modules.cart.repository.cartRepository.removeLine` (L108-L115) - Method
  - `src.modules.cart.repository.cartRepository.clearLines` (L121-L128) - Method
  - `src.modules.cart.repository.cartRepository.clearLinesIfUnchanged` (L146-L154) - Method
  - `src.modules.cart.repository.cartRepository.deleteByUserId` (L162-L168) - Method
  - `src.modules.cart.repository.cartRepository.deleteByUserId.then() callback` (L166-L168) - Function
  - `src.modules.cart.repository.cartRepository.removeProductFromAll` (L173-L179) - Method
- `src/modules/cart/services/checkout.ts`
  - `src.modules.cart.services.checkout.runCheckout.orderItems` (L167-L170) - Class
  - `src.modules.cart.services.checkout.runCheckout.orderItems.joined.map() callback` (L167-L170) - Function
- `src/modules/cart/services/cleanup.ts`
  - `src.modules.cart.services.cleanup.productRemoveFromCartsById` (L32-L44) - Class
  - `src.modules.cart.services.cleanup.productRemoveFromCartsById.then() callback` (L37-L42) - Function
  - `src.modules.cart.services.cleanup.productRemoveFromCartsById.catch() callback` (L44-L44) - Function
- `src/modules/cart/services/items.ts`
  - `src.modules.cart.services.items.cartGet` (L30-L31) - Class
  - `src.modules.cart.services.items.cartGet.then() callback` (L31-L31) - Function
  - `src.modules.cart.services.items.cartViewOf` (L39-L40) - Class
  - `src.modules.cart.services.items.cartViewOf.then() callback` (L40-L40) - Function
  - `src.modules.cart.services.items.cartRemove` (L179-L189) - Class
  - `src.modules.cart.services.items.cartRemove.then() callback` (L180-L188) - Function
  - `src.modules.cart.services.items.cartRemove.then() callback.then() callback` (L181-L188) - Function
- `src/modules/cart/services/view.ts`
  - `src.modules.cart.services.view.CartView` (L37-L40) - Interface
  - `src.modules.cart.services.view.PopulatedCart` (L49-L51) - Interface
  - `src.modules.cart.services.view.readCartLines` (L62-L75) - Class
  - `src.modules.cart.services.view.readCartLines.productIds` (L65-L65) - Class
  - `src.modules.cart.services.view.readCartLines.productIds.cart.items.map() callback` (L65-L65) - Function
  - `src.modules.cart.services.view.readCartLines.then() callback` (L68-L73) - Function
  - `src.modules.cart.services.view.readCartLines.then() callback.items.map() callback` (L69-L73) - Function
  - `src.modules.cart.services.view.toCartView` (L83-L97) - Class
  - `src.modules.cart.services.view.toCartView.then() callback` (L84-L97) - Function
  - `src.modules.cart.services.view.toCartView.then() callback.items.lines.map() callback` (L87-L90) - Function

### Serialization Pipeline & Order/Audit Model Bindings
The heart of the subsystem — the shared serialization contract and the concrete model/repository bindings that instantiate it. applySerialization builds a model's wire-shape transform and wires it into the schema's toJSON, returning the same transform for the lean/aggregate path; SerializableSchema is the structural contract a schema must satisfy, and SerializeOptions (dropId/omit/after/virtuals) lets each model customize its shape. createRepository is the generic CRUD+search factory that consumes a model's exported transform so .lean()/.aggregate() results come back already serialized. The order and audit-logs modules are the canonical bindings: OrderDocument/OrderDocumentItem + applyOrderTransform (orders read through aggregation, detachUserId/ownerScope), and applyAuditLogTransform (the dropId/virtuals:false/ISO-timestamp case). This is the primary target of the no-persistence-imports rule and the mutation-tested transform surface.

**Related Classes/Methods**:

- `src.infrastructure.persistence.serialize.applySerialization`:50-82
- `src.modules.orders.model.applyOrderTransform`:236-244
- `src.modules.audit-logs.model.applyAuditLogTransform`:166-173

**Source Files:**

- `src/infrastructure/persistence/create-repository.ts`
  - `src.infrastructure.persistence.create-repository.Repository` (L175-L220) - Interface
  - `src.infrastructure.persistence.create-repository.createRepository.buildWhere` (L348-L348) - Method
- `src/infrastructure/persistence/serialize.ts`
  - `src.infrastructure.persistence.serialize.SerializeOptions` (L16-L30) - Interface
  - `src.infrastructure.persistence.serialize.SerializableSchema` (L39-L41) - Interface
  - `src.infrastructure.persistence.serialize.applySerialization` (L50-L82) - Class
  - `src.infrastructure.persistence.serialize.transform` (L55-L69) - Class
  - `src.infrastructure.persistence.serialize.applySerialization.transform.toString` (L58-L58) - Method
  - `src.infrastructure.persistence.serialize.applySerialization.transform` (L78-L78) - Method
- `src/modules/audit-logs/model.ts`
  - `src.modules.audit-logs.model.applyAuditLogTransform` (L166-L173) - Class
  - `src.modules.audit-logs.model.applyAuditLogTransform.after` (L169-L172) - Method
- `src/modules/locales/services/entries.ts`
  - `src.modules.locales.services.entries.importEntries.survivors` (L225-L225) - Class
  - `src.modules.locales.services.entries.importEntries.survivors.stored.filter() callback` (L225-L225) - Function
- `src/modules/orders/demo.ts`
  - `src.modules.orders.demo.smallCustomerOrders` (L154-L171) - Class
  - `src.modules.orders.demo.smallCustomerOrders.map() callback` (L164-L170) - Function
  - `src.modules.orders.demo.mediumCustomerOrders.MEDIUM_ORDERS.map() callback` (L231-L239) - Function
  - `src.modules.orders.demo.mediumCustomerOrders` (L231-L240) - Class
  - `src.modules.orders.demo.mediumCustomerOrders.MEDIUM_ORDERS.map() callback.items.lines.map() callback` (L236-L237) - Function
- `src/modules/orders/model.ts`
  - `src.modules.orders.model.OrderDocumentItem` (L25-L35) - Interface
  - `src.modules.orders.model.OrderDocument` (L43-L77) - Interface
  - `src.modules.orders.model.applyOrderTransform` (L236-L244) - Class
  - `src.modules.orders.model.applyOrderTransform.after` (L240-L243) - Method
- `src/modules/orders/repository.ts`
  - `src.modules.orders.repository.search` (L55-L83) - Class
  - `src.modules.orders.repository.search.then() callback` (L70-L81) - Function
  - `src.modules.orders.repository.search.then() callback.then() callback` (L77-L80) - Function
  - `src.modules.orders.repository.findByIdScoped` (L95-L107) - Class
  - `src.modules.orders.repository.findByIdScoped.then() callback` (L102-L105) - Function
  - `src.modules.orders.repository.detachUserId` (L165-L173) - Class
  - `src.modules.orders.repository.detachUserId.then() callback` (L173-L173) - Function
- `src/modules/orders/service.ts`
  - `src.modules.orders.service.create.outcome` (L195-L201) - Class
  - `src.modules.orders.service.create.outcome.resolvedItems.map() callback` (L197-L200) - Function
