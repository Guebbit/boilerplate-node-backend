---
tags:
  - 2repo
  - 2repo/arch
  - project/boilerplate-node-backend
type: architecture
component: Persistence_Domain_Service_Layer
---

```mermaid
graph LR
    Generic_Persistence_Foundation_Commerce_Aggregates["Generic Persistence Foundation & Commerce Aggregates"]
    User_Credential_Store_JWT_Session_Lifecycle["User Credential Store & JWT Session Lifecycle"]
    Account_Address_Book_One_Time_Token_Rule["Account Address Book & One-Time Token Rule"]
    Generic_Persistence_Foundation_Commerce_Aggregates -- "cross-module read of the shipping address during checkout" --> Account_Address_Book_One_Time_Token_Rule
    User_Credential_Store_JWT_Session_Lifecycle -- "inherits the shared CRUD/serialization contract" --> Generic_Persistence_Foundation_Commerce_Aggregates
    Account_Address_Book_One_Time_Token_Rule -- "delegates credential reads and atomic token spend to the sanctioned token store" --> User_Credential_Store_JWT_Session_Lifecycle
```

## Details

The data-access and business-rule tier that the contract surface describes. Provides a generic createBaseRepository factory (CRUD + serialization), per-module repositories (account, cart, inventory, payments), seed/export utilities, and domain services that encode invariants (stock reservation, payment confirmation, token lifecycle). This is the 'what the API does' half of the contract.

### Generic Persistence Foundation & Commerce Aggregates
The reusable data-access core and the commerce-domain repositories/services built on it. createBaseRepository supplies the uniform CRUD/search/serialization contract every module inherits; the cart, inventory, and payments repositories add the atomic, race-safe writes each aggregate needs (contended cart-line upsert, reservation claim/commit/release, conditional payment status transitions); and the inventory and payments services encode the cross-aggregate invariants — stock reservation lifecycle and the charge→order-move→refund payment confirmation ordering.

**Related Classes/Methods**:

- `src.infrastructure.persistence.base-repository.createBaseRepository`:222-346
- `src.infrastructure.persistence.factory.compact`:51-52
- `src.modules.cart.repository.cartRepository`:78-184
- `src.modules.inventory.service.isStockBoundToOrder`:295-298
- `src.modules.payments.service.confirmPayment`:168-271

**Source Files:**

- `scripts/run-prism-smoke-test.ts`
  - `scripts.run-prism-smoke-test.prism.stdout.on('data') callback` (L29-L29) - Function
  - `scripts.run-prism-smoke-test.prism.stderr.on('data') callback` (L30-L30) - Function
  - `scripts.run-prism-smoke-test.process.on('SIGINT') callback` (L37-L37) - Function
- `src/infrastructure/persistence/base-repository.ts`
  - `src.infrastructure.persistence.base-repository.createBaseRepository` (L222-L346) - Function
  - `src.infrastructure.persistence.base-repository.createBaseRepository.normalize.transformed.items.map() callback` (L237-L238) - Function
  - `src.infrastructure.persistence.base-repository.createBaseRepository.normalize.transformed` (L237-L239) - Class
- `src/infrastructure/persistence/factory.ts`
  - `src.infrastructure.persistence.factory.compact` (L51-L52) - Class
  - `src.infrastructure.persistence.factory.compact.filter() callback` (L52-L52) - Function
- `src/infrastructure/persistence/seed.ts`
  - `src.infrastructure.persistence.seed.SeedRepository` (L22-L25) - Interface
  - `src.infrastructure.persistence.seed.exportCollection` (L71-L80) - Class
  - `src.infrastructure.persistence.seed.exportCollection.then() callback` (L80-L80) - Function
  - `src.infrastructure.persistence.seed.exportCollection.then() callback.documents.map() callback` (L80-L80) - Function
- `src/kernel/registry.ts`
  - `src.kernel.registry.ContextEdge` (L31-L43) - Interface
- `src/modules/account/repository.ts`
  - `src.modules.account.repository.addressBookRepository` (L24-L118) - Class
  - `src.modules.account.repository.addressBookRepository.findByUserId` (L43-L44) - Method
  - `src.modules.account.repository.addressBookRepository.addEntry` (L53-L63) - Method
  - `src.modules.account.repository.addressBookRepository.updateEntry` (L73-L91) - Method
  - `src.modules.account.repository.addressBookRepository.removeEntry` (L97-L106) - Method
  - `src.modules.account.repository.addressBookRepository.removeEntry.book.items.filter() callback` (L102-L102) - Function
  - `src.modules.account.repository.addressBookRepository.deleteByUserId` (L111-L117) - Method
  - `src.modules.account.repository.addressBookRepository.deleteByUserId.then() callback` (L115-L117) - Function
- `src/modules/account/services/addresses.ts`
  - `src.modules.account.services.addresses.addressesGet` (L47-L48) - Class
  - `src.modules.account.services.addresses.addressesGet.then() callback` (L48-L48) - Function
  - `src.modules.account.services.addresses.addressAdd` (L51-L57) - Class
  - `src.modules.account.services.addresses.addressAdd.then() callback` (L57-L57) - Function
- `src/modules/account/session/config.ts`
  - `src.modules.account.session.config.RefreshTokenExpiryTime` (L12-L16) - Enum
- `src/modules/cart/repository.ts`
  - `src.modules.cart.repository.cartRepository` (L78-L184) - Class
  - `src.modules.cart.repository.cartRepository.findByUserId` (L100-L100) - Method
  - `src.modules.cart.repository.cartRepository.removeLine` (L111-L118) - Method
  - `src.modules.cart.repository.cartRepository.clearLines` (L124-L131) - Method
  - `src.modules.cart.repository.cartRepository.clearLinesIfUnchanged` (L150-L158) - Method
  - `src.modules.cart.repository.cartRepository.deleteByUserId` (L166-L172) - Method
  - `src.modules.cart.repository.cartRepository.deleteByUserId.then() callback` (L170-L172) - Function
  - `src.modules.cart.repository.cartRepository.removeProductFromAll` (L177-L183) - Method
- `src/modules/cart/services/cleanup.ts`
  - `src.modules.cart.services.cleanup.productRemoveFromCartsById` (L31-L43) - Class
  - `src.modules.cart.services.cleanup.productRemoveFromCartsById.then() callback` (L36-L41) - Function
  - `src.modules.cart.services.cleanup.productRemoveFromCartsById.catch() callback` (L43-L43) - Function
- `src/modules/cart/services/items.ts`
  - `src.modules.cart.services.items.cartGet` (L29-L30) - Class
  - `src.modules.cart.services.items.cartGet.then() callback` (L30-L30) - Function
  - `src.modules.cart.services.items.cartItemRemoveById` (L177-L199) - Class
  - `src.modules.cart.services.items.cartItemRemoveById.then() callback.then() callback` (L198-L198) - Function
- `src/modules/inventory/repository.ts`
  - `src.modules.inventory.repository.toReservationItems` (L31-L37) - Class
  - `src.modules.inventory.repository.toReservationItems.lines.map() callback` (L34-L37) - Function
  - `src.modules.inventory.repository.reservationRepository` (L59-L151) - Class
  - `src.modules.inventory.repository.reservationRepository.insertHold` (L89-L101) - Method
  - `src.modules.inventory.repository.reservationRepository.insertHold.then() callback` (L97-L97) - Function
  - `src.modules.inventory.repository.reservationRepository.insertHold.catch() callback` (L98-L101) - Function
  - `src.modules.inventory.repository.reservationRepository.findByOrderId` (L109-L110) - Method
  - `src.modules.inventory.repository.reservationRepository.claimStatus` (L125-L132) - Method
  - `src.modules.inventory.repository.reservationRepository.findExpired` (L145-L150) - Method
- `src/modules/inventory/service.ts`
  - `src.modules.inventory.service.isStockBoundToOrder` (L295-L298) - Class
  - `src.modules.inventory.service.isStockBoundToOrder.then() callback` (L298-L298) - Function
- `src/modules/payments/providers/fake.ts`
  - `src.modules.payments.providers.fake.fakePaymentProvider` (L36-L52) - Class
  - `src.modules.payments.providers.fake.fakePaymentProvider.charge` (L39-L46) - Method
  - `src.modules.payments.providers.fake.fakePaymentProvider.refund` (L48-L51) - Method
- `src/modules/payments/providers/index.ts`
  - `src.modules.payments.providers.index.PaymentProvider` (L24-L43) - Interface
  - `src.modules.payments.providers.index.PaymentProvider.charge` (L36-L36) - Method
  - `src.modules.payments.providers.index.PaymentProvider.refund` (L42-L42) - Method
- `src/modules/payments/repository.ts`
  - `src.modules.payments.repository.paymentRepository` (L21-L126) - Class
  - `src.modules.payments.repository.paymentRepository.ownerScope` (L58-L58) - Method
  - `src.modules.payments.repository.paymentRepository.findByIdScoped` (L71-L72) - Method
  - `src.modules.payments.repository.paymentRepository.findByOrderId` (L81-L82) - Method
  - `src.modules.payments.repository.paymentRepository.upsertIntent` (L95-L112) - Method
  - `src.modules.payments.repository.paymentRepository.upsertIntent.catch() callback` (L109-L112) - Function
  - `src.modules.payments.repository.paymentRepository.updateStatusIfIn` (L118-L125) - Method
- `src/modules/payments/service.ts`
  - `src.modules.payments.service.resolvePayerId` (L89-L99) - Class
  - `src.modules.payments.service.resolvePayerId.then() callback` (L92-L98) - Function
  - `src.modules.payments.service.resolvePayerId.catch() callback` (L99-L99) - Function
  - `src.modules.payments.service.createIntent` (L123-L154) - Class
  - `src.modules.payments.service.createIntent.then() callback` (L127-L154) - Function
  - `src.modules.payments.service.then() callback.then() callback` (L137-L142) - Function
  - `src.modules.payments.service.createIntent.then() callback.then() callback` (L144-L152) - Function
  - `src.modules.payments.service.confirmPayment` (L168-L271) - Class
  - `src.modules.payments.service.then() callback` (L176-L244) - Function
  - `src.modules.payments.service.confirmPayment.then() callback` (L245-L271) - Function
  - `src.modules.payments.service.confirmPayment.then() callback.declined` (L250-L251) - Class
  - `src.modules.payments.service.confirmPayment.then() callback.declined.result.errors.some() callback` (L251-L251) - Function
  - `src.modules.payments.service.getForOrder` (L279-L291) - Class
  - `src.modules.payments.service.getForOrder.then() callback` (L283-L291) - Function
  - `src.modules.payments.service.getForOrder.then() callback.then() callback` (L290-L290) - Function
  - `src.modules.payments.service.performRefund` (L329-L342) - Class
  - `src.modules.payments.service.performRefund.then() callback` (L332-L342) - Function
  - `src.modules.payments.service.performRefund.then() callback.then() callback` (L336-L341) - Function
  - `src.modules.payments.service.refundByOrder` (L354-L373) - Class
  - `src.modules.payments.service.refundByOrder.then() callback` (L358-L373) - Function
  - `src.modules.payments.service.refundByOrder.then() callback.then() callback` (L363-L371) - Function
  - `src.modules.payments.service.refundForOrder` (L385-L386) - Class
  - `src.modules.payments.service.refundForOrder.then() callback` (L386-L386) - Function
- `src/modules/products/model.ts`
  - `src.modules.products.model.title.error` (L76-L76) - Method
  - `src.modules.products.model.zodProductSchema.title.error` (L77-L77) - Method
  - `src.modules.products.model.price.error` (L80-L80) - Method
  - `src.modules.products.model.zodProductSchema.price.error` (L81-L81) - Method
- `src/modules/wishlist/repository.ts`
  - `src.modules.wishlist.repository.wishlistRepository` (L25-L106) - Class
  - `src.modules.wishlist.repository.wishlistRepository.findByUserId` (L40-L41) - Method
  - `src.modules.wishlist.repository.wishlistRepository.addLine` (L61-L68) - Method
  - `src.modules.wishlist.repository.wishlistRepository.removeLine` (L75-L82) - Method
  - `src.modules.wishlist.repository.wishlistRepository.deleteByUserId` (L88-L94) - Method
  - `src.modules.wishlist.repository.wishlistRepository.deleteByUserId.then() callback` (L92-L94) - Function
  - `src.modules.wishlist.repository.wishlistRepository.removeProductFromAll` (L99-L105) - Method
- `src/modules/wishlist/service.ts`
  - `src.modules.wishlist.service.wishlistGet` (L38-L39) - Class
  - `src.modules.wishlist.service.wishlistGet.then() callback` (L39-L39) - Function
  - `src.modules.wishlist.service.wishlistMoveToCart.then() callback.saved` (L107-L107) - Class
  - `src.modules.wishlist.service.wishlistMoveToCart.then() callback.saved.wishlist.items.some() callback` (L107-L107) - Function

### User Credential Store & JWT Session Lifecycle
The user aggregate's persistence plus the token/session machinery that depends on it. userRepository owns the credential fields (password, tokens) that are select: false by default, exposing the only sanctioned credential reads and the atomic token spend/touch/remove operations. account.session.jwt builds on that store to issue and verify access/refresh tokens, persist refresh tokens onto the user document, and stamp usage — the full session lifecycle. The UserMethods model layer carries the document-level token operations these two call into.

**Related Classes/Methods**:

- `src.modules.users.repository.userRepository`:27-223
- `src.modules.users.model.UserMethods`:98-105
- `src.modules.account.session.jwt.createRefreshToken`:76-102
- `src.modules.account.session.jwt.verifyRefreshToken`:50-68
- `src.modules.account.session.jwt.recordRefreshTokenUse`:121-125

**Source Files:**

- `src/modules/account/session/jwt.ts`
  - `src.modules.account.session.jwt.TokenData` (L22-L24) - Interface
  - `src.modules.account.session.jwt.verifyAccessToken` (L33-L42) - Class
  - `src.modules.account.session.jwt.verifyAccessToken.<function>` (L34-L42) - Function
  - `src.modules.account.session.jwt.verifyAccessToken.<function>.verify() callback` (L35-L41) - Function
  - `src.modules.account.session.jwt.verifyRefreshToken` (L50-L68) - Class
  - `src.modules.account.session.jwt.verifyRefreshToken.<function>` (L51-L68) - Function
  - `src.modules.account.session.jwt.verifyRefreshToken.<function>.verify() callback` (L52-L67) - Function
  - `src.modules.account.session.jwt.verifyRefreshToken.<function>.verify() callback.then() callback` (L59-L65) - Function
  - `src.modules.account.session.jwt.verifyRefreshToken.<function>.verify() callback.catch() callback` (L66-L66) - Function
  - `src.modules.account.session.jwt.createRefreshToken` (L76-L102) - Class
  - `src.modules.account.session.jwt.createRefreshToken.then() callback` (L80-L102) - Function
  - `src.modules.account.session.jwt.recordRefreshTokenUse` (L121-L125) - Class
  - `src.modules.account.session.jwt.recordRefreshTokenUse.then() callback` (L124-L124) - Function
  - `src.modules.account.session.jwt.recordRefreshTokenUse.catch() callback` (L125-L125) - Function
  - `src.modules.account.session.jwt.createAccessToken` (L132-L138) - Class
  - `src.modules.account.session.jwt.createAccessToken.then() callback` (L133-L137) - Function
- `src/modules/users/model.ts`
  - `src.modules.users.model.UserMethods` (L98-L105) - Interface
- `src/modules/users/repository.ts`
  - `src.modules.users.repository.userRepository` (L27-L223) - Class
  - `src.modules.users.repository.userRepository.updateMany` (L63-L64) - Method
  - `src.modules.users.repository.userRepository.findByIdWithCredentials` (L69-L70) - Method
  - `src.modules.users.repository.userRepository.findOneWithCredentials` (L75-L76) - Method
  - `src.modules.users.repository.userRepository.findByToken` (L96-L100) - Method
  - `src.modules.users.repository.userRepository.tokenRemove` (L116-L125) - Method
  - `src.modules.users.repository.userRepository.tokenRemoveByValue` (L141-L148) - Method
  - `src.modules.users.repository.userRepository.tokenRemoveExpired` (L161-L171) - Method
  - `src.modules.users.repository.userRepository.tokenRemoveExpired.then() callback` (L170-L170) - Function
  - `src.modules.users.repository.userRepository.findByTokenValue` (L182-L182) - Method
  - `src.modules.users.repository.userRepository.tokenTouch` (L193-L200) - Method
  - `src.modules.users.repository.userRepository.sessionRemove` (L215-L222) - Method

### Account Address Book & One-Time Token Rule
The account module's two non-credential aggregates: the address book and the one-time-token rule. addressBookRepository owns the 'exactly one default' invariant across the whole address array via read-modify-write, and the address services expose the book as the contract's AddressesResponse (including addressForCheckout for the cart). The token service centralizes the 'a token is live if it exists, matches its type, and has not expired' rule — split into findLiveToken (read) and spendLiveToken (atomic spend) — so reset/verification/delete flows all ask for the same rule by name.

**Related Classes/Methods**:

- `src.modules.account.services.tokens.findLiveToken`:62-74

**Source Files:**

- `src/modules/account/repository.ts`
  - `src.modules.account.repository.addressBookRepository.removeEntry.entry` (L99-L99) - Class
  - `src.modules.account.repository.addressBookRepository.removeEntry.entry.book.items.find() callback` (L99-L99) - Function
- `src/modules/account/services/profile.ts`
  - `src.modules.account.services.profile.validatePasswordChange.parseResult` (L51-L69) - Class
  - `src.modules.account.services.profile.validatePasswordChange.parseResult.superRefine() callback` (L58-L65) - Function
  - `src.modules.account.services.profile.updateProfile.outcome` (L247-L261) - Class
  - `src.modules.account.services.profile.updateProfile.outcome.catch() callback` (L260-L260) - Function
  - `src.modules.account.services.profile.updateProfile.outcome.then() callback` (L263-L272) - Function
- `src/modules/account/services/tokens.ts`
  - `src.modules.account.services.tokens.findLiveToken` (L62-L74) - Class
  - `src.modules.account.services.tokens.findLiveToken.then() callback` (L66-L74) - Function
  - `src.modules.account.services.tokens.then() callback.sessions` (L128-L130) - Class
