---
tags:
  - 2brain
  - 2brain/arch
  - project/boilerplate-node-backend
type: architecture
component: Flow_Driven_Module_Services
---

```mermaid
graph LR
    Cart_Composition_Checkout_Confirmation["Cart Composition & Checkout Confirmation"]
    Delivery_Fulfilment_Shipping_Resolution["Delivery Fulfilment & Shipping Resolution"]
    Order_Lifecycle_Status_Governance["Order Lifecycle & Status Governance"]
    Cart_Composition_Checkout_Confirmation -- "Resolves shipping method and price from the delivery rate table during checkout pricing" --> Delivery_Fulfilment_Shipping_Resolution
    Cart_Composition_Checkout_Confirmation -- "Commits the purchase-intent pipeline through the single order-write funnel" --> Order_Lifecycle_Status_Governance
    Delivery_Fulfilment_Shipping_Resolution -- "calls" --> Cart_Composition_Checkout_Confirmation
    Delivery_Fulfilment_Shipping_Resolution -- "Drives order status transitions and fulfilment side-effects through the orders service" --> Order_Lifecycle_Status_Governance
    Order_Lifecycle_Status_Governance -- "Emits user/product lifecycle events that cascade into cart cleanup (async, kernel event bus)" --> Cart_Composition_Checkout_Confirmation
    Order_Lifecycle_Status_Governance -- "Announces order lifecycle events that trigger fulfilment orchestration (async, outbox)" --> Delivery_Fulfilment_Shipping_Resolution
```

## Details

The module business services the flow runner drives after seeding to give the shop a past: cart item/merge/reorder/view services, the checkout service (orderConfirm, CheckoutChoices, ExpectedTotal), and the delivery service (startFulfilment, shipOrder, recordShipment, recordDelivery, moveAndStampDelivered, fulfillOrder). These are the read/write services that turn the seeded onHand: 0 catalogue into delivered orders, which backdateHistory then moves into the past. They are the 'living history' half of the scenario, downstream of the seed core.

### Cart Composition & Checkout Confirmation
This sub-component owns the purchase-intent phase of the flow. It provides the read/write services that build, inspect, and finalize a shopping cart, then confirm it into an order. The items service handles granular cart mutations (add, remove, update quantity, upsert), the view service projects the cart into a display-ready shape, the reorder service re-enters previously purchased lines back into the cart, and the checkout service is the terminal step that validates the cart against CheckoutChoices, computes the ExpectedTotal, and commits the order.

**Related Classes/Methods**:

- `src.modules.cart.services.checkout.orderConfirm`:605-634
- `src.modules.cart.services.items.cartGetForView`:50-57
- `src.modules.cart.services.reorder.reorderIntoCart`:111-156

**Source Files:**

- `src/modules/cart/services/checkout.ts`
  - `src.modules.cart.services.checkout.CheckoutChoices` (L80-L86) - Interface
  - `src.modules.cart.services.checkout.resolvePaymentMethod.methodInfo.find() callback` (L112-L112) - Function
  - `src.modules.cart.services.checkout.buildStockRefusal.details.lines.refusal.shortfalls.map() callback` (L305-L310) - Function
  - `src.modules.cart.services.checkout.ExpectedTotal` (L327-L332) - Interface
  - `src.modules.cart.services.checkout.runCheckout.details.productIds.overLimit.map() callback` (L484-L484) - Function
  - `src.modules.cart.services.checkout.orderConfirm` (L605-L634) - Class
  - `src.modules.cart.services.checkout.orderConfirm.catch() callback` (L611-L611) - Function
  - `src.modules.cart.services.checkout.orderConfirm.then() callback` (L612-L634) - Function
- `src/modules/cart/services/items.ts`
  - `src.modules.cart.services.items.cartViewOf` (L43-L44) - Class
  - `src.modules.cart.services.items.cartViewOf.then() callback` (L44-L44) - Function
  - `src.modules.cart.services.items.cartGetForView` (L50-L57) - Class
  - `src.modules.cart.services.items.cartGetForView.then() callback` (L51-L57) - Function
  - `src.modules.cart.services.items.upsertCartItem` (L76-L100) - Class
  - `src.modules.cart.services.items.upsertCartItem.then() callback` (L82-L100) - Function
  - `src.modules.cart.services.items.upsertCartItem.then() callback.then() callback` (L89-L99) - Function
  - `src.modules.cart.services.items.upsertCartItem.then() callback.then() callback.then() callback` (L96-L97) - Function
  - `src.modules.cart.services.items.cartItemAdd` (L151-L159) - Class
  - `src.modules.cart.services.items.cartItemAdd.then() callback` (L157-L158) - Function
  - `src.modules.cart.services.items.cartItemUpdateQuantity` (L165-L173) - Class
  - `src.modules.cart.services.items.cartItemUpdateQuantity.then() callback` (L171-L172) - Function
  - `src.modules.cart.services.items.cartItemRemoveById` (L192-L212) - Class
  - `src.modules.cart.services.items.cartItemRemoveById.then() callback` (L197-L212) - Function
  - `src.modules.cart.services.items.cartItemRemoveById.then() callback.then() callback` (L211-L211) - Function
  - `src.modules.cart.services.items.cartRemove` (L220-L230) - Class
  - `src.modules.cart.services.items.cartRemove.then() callback` (L221-L229) - Function
  - `src.modules.cart.services.items.cartRemove.then() callback.then() callback` (L222-L229) - Function
- `src/modules/cart/services/reorder.ts`
  - `src.modules.cart.services.reorder.ReorderLine` (L35-L40) - Interface
  - `src.modules.cart.services.reorder.resolveReorderLines` (L50-L64) - Class
  - `src.modules.cart.services.reorder.resolveReorderLines.then() callback` (L63-L63) - Function
  - `src.modules.cart.services.reorder.resolveReorderLines.then() callback.lines.filter() callback` (L63-L63) - Function
  - `src.modules.cart.services.reorder.reorderIntoCart` (L111-L156) - Class
  - `src.modules.cart.services.reorder.then() callback` (L120-L139) - Function
  - `src.modules.cart.services.reorder.reorderIntoCart.then() callback.then() callback` (L123-L138) - Function
  - `src.modules.cart.services.reorder.reorderIntoCart.then() callback.then() callback.then() callback` (L132-L136) - Function
  - `src.modules.cart.services.reorder.then() callback.then() callback.then() callback.then() callback` (L135-L135) - Function
  - `src.modules.cart.services.reorder.reorderIntoCart.then() callback.then() callback.then() callback.then() callback` (L136-L136) - Function
  - `src.modules.cart.services.reorder.reorderIntoCart.catch() callback` (L140-L140) - Function
  - `src.modules.cart.services.reorder.reorderIntoCart.then() callback` (L141-L155) - Function
- `src/modules/cart/services/view.ts`
  - `src.modules.cart.services.view.CartView` (L50-L62) - Interface
  - `src.modules.cart.services.view.shippingOptionsFor.options.SHIPPING_METHODS.filter() callback` (L125-L125) - Function
  - `src.modules.cart.services.view.shippingOptionsFor.options.map() callback` (L126-L131) - Function
  - `src.modules.cart.services.view.toCartView` (L198-L206) - Class
  - `src.modules.cart.services.view.toCartView.then() callback` (L199-L205) - Function
  - `src.modules.cart.services.view.toCartView.then() callback.lines.map() callback` (L202-L202) - Function
  - `src.modules.cart.services.view.toCartView.then() callback.then() callback` (L205-L205) - Function

### Delivery Fulfilment & Shipping Resolution
This sub-component owns the fulfilment-execution phase. Once orderConfirm has committed an order, the delivery service drives it through the physical lifecycle: startFulfilment transitions the order into the fulfilment pipeline, shipOrder records the shipment event, recordShipment persists carrier/tracking data, recordDelivery marks the package as delivered, and moveAndStampDelivered finalises the order status with a delivery timestamp. Supporting domain logic lives in the domain/ sub-package: rates.findShippingMethod resolves the applicable shipping method, tax computes tax obligations, rules enforces fulfilment invariants, and lifecycle models the state machine.

**Related Classes/Methods**:

- `src.modules.delivery.domain.rates.findShippingMethod`:48-49

**Source Files:**

- `src/modules/cart/services/items.ts`
  - `src.modules.cart.services.items.cartShippingMethodSet` (L245-L292) - Class
  - `src.modules.cart.services.items.cartShippingMethodSet.then() callback` (L266-L290) - Function
  - `src.modules.cart.services.items.cartShippingMethodSet.then() callback.then() callback` (L267-L290) - Function
  - `src.modules.cart.services.items.then() callback.then() callback.then() callback` (L288-L288) - Function
  - `src.modules.cart.services.items.cartShippingMethodSet.then() callback.then() callback.then() callback` (L289-L289) - Function
- `src/modules/cart/services/merge.ts`
  - `src.modules.cart.services.merge.cartMerge` (L188-L197) - Class
  - `src.modules.cart.services.merge.cartMerge.then() callback` (L193-L196) - Function
  - `src.modules.cart.services.merge.cartMerge.then() callback.then() callback` (L194-L195) - Function
  - `src.modules.cart.services.merge.cartMerge.then() callback.then() callback.then() callback` (L195-L195) - Function
- `src/modules/delivery/domain/rates.ts`
  - `src.modules.delivery.domain.rates.findShippingMethod` (L48-L49) - Class
  - `src.modules.delivery.domain.rates.findShippingMethod.SHIPPING_METHODS.find() callback` (L49-L49) - Function
- `src/modules/orders/domain/lifecycle.ts`
  - `src.modules.orders.domain.lifecycle.overridableTargetsFrom` (L181-L185) - Class
  - `src.modules.orders.domain.lifecycle.overridableTargetsFrom.OVERRIDABLE_SEQUENCE.filter() callback` (L185-L185) - Function
  - `src.modules.orders.domain.lifecycle.statusesReachableFrom` (L192-L196) - Class
  - `src.modules.orders.domain.lifecycle.statusesReachableFrom.filter() callback` (L196-L196) - Function
- `src/modules/orders/domain/rules.ts`
  - `src.modules.orders.domain.rules.isDigitalOnlyOrder` (L51-L52) - Class
  - `src.modules.orders.domain.rules.isDigitalOnlyOrder.lines.every() callback` (L52-L52) - Function
- `src/modules/orders/domain/tax.ts`
  - `src.modules.orders.domain.tax.orderTaxBreakdown.shippingWeights.items.map() callback` (L244-L245) - Function
  - `src.modules.orders.domain.tax.orderTaxBreakdown.shippingWeights` (L244-L246) - Class
- `src/modules/orders/domain/withdrawal.ts`
  - `src.modules.orders.domain.withdrawal.WithdrawableLine` (L80-L82) - Interface
  - `src.modules.orders.domain.withdrawal.WithdrawalCandidate` (L94-L100) - Interface
  - `src.modules.orders.domain.withdrawal.canWithdraw` (L108-L111) - Class
  - `src.modules.orders.domain.withdrawal.canWithdraw.order.items.some() callback` (L110-L110) - Function
- `src/modules/orders/services/scope.ts`
  - `src.modules.orders.services.scope.standingOn` (L362-L369) - Class
  - `src.modules.orders.services.scope.standingOn.then() callback` (L366-L369) - Function
  - `src.modules.orders.services.scope.withActions` (L407-L440) - Class
  - `src.modules.orders.services.scope.withActions.then() callback` (L416-L438) - Function

### Order Lifecycle & Status Governance
This sub-component owns the order-governance phase — the administrative operations that act on orders after they exist. cancelById handles order cancellation within a transaction, announcing the cancellation to subscribers. overrideStatus and forceMove allow an operator to force an order into a specific lifecycle state. update/updateById provide the standard read-modify-write path for order fields. remove handles hard deletion. scope enforces tenancy/visibility boundaries on all order queries. The emails module provides the withdrawal-case logic that determines whether a buyer can exercise a statutory withdrawal right.

**Related Classes/Methods**:

- `src.modules.orders.services.cancel.cancelById`:210-290
- `src.modules.orders.services.override.overrideStatus`:161-182
- `src.modules.orders.services.crud.updateById`:213-237
- `src.modules.orders.emails.withdrawalCase.withdrawable`

**Source Files:**

- `src/modules/orders/emails.ts`
  - `src.modules.orders.emails.withdrawalCase.withdrawable` (L89-L89) - Class
  - `src.modules.orders.emails.withdrawalCase.withdrawable.order.items.filter() callback` (L89-L89) - Function
  - `src.modules.orders.emails.withdrawalCase.withdrawable.some() callback` (L91-L91) - Function
  - `src.modules.orders.emails.withdrawalNotice.excluded` (L147-L147) - Class
  - `src.modules.orders.emails.withdrawalNotice.excluded.order.items.filter() callback` (L147-L147) - Function
- `src/modules/orders/services/cancel.ts`
  - `src.modules.orders.services.cancel.announceInTransaction() callback` (L88-L103) - Function
  - `src.modules.orders.services.cancel.afterCancel` (L123-L190) - Class
  - `src.modules.orders.services.cancel.mailBuyer() callback` (L155-L158) - Function
  - `src.modules.orders.services.cancel.afterCancel.mailBuyer() callback` (L167-L170) - Function
  - `src.modules.orders.services.cancel.cancelById` (L210-L290) - Class
  - `src.modules.orders.services.cancel.cancelById.rank.then() callback` (L244-L288) - Function
  - `src.modules.orders.services.cancel.cancelById.rank.then() callback.then() callback` (L264-L287) - Function
  - `src.modules.orders.services.cancel.cancelById.rank.then() callback.then() callback.then() callback` (L278-L286) - Function
- `src/modules/orders/services/crud.ts`
  - `src.modules.orders.services.crud.update` (L199-L206) - Class
  - `src.modules.orders.services.crud.update.then() callback` (L205-L205) - Function
  - `src.modules.orders.services.crud.updateById` (L213-L237) - Class
  - `src.modules.orders.services.crud.updateById.then() callback` (L218-L237) - Function
  - `src.modules.orders.services.crud.updateById.then() callback.then() callback` (L224-L235) - Function
  - `src.modules.orders.services.crud.updateById.then() callback.then() callback.then() callback` (L226-L235) - Function
- `src/modules/orders/services/override.ts`
  - `src.modules.orders.services.override.overrideStatus` (L161-L182) - Class
  - `src.modules.orders.services.override.overrideStatus.then() callback` (L167-L182) - Function
  - `src.modules.orders.services.override.overrideStatus.then() callback.then() callback` (L170-L181) - Function
  - `src.modules.orders.services.override.overrideStatus.then() callback.then() callback.then() callback` (L176-L179) - Function
- `src/modules/orders/services/remove.ts`
  - `src.modules.orders.services.remove.remove` (L81-L120) - Class
  - `src.modules.orders.services.remove.remove.then() callback` (L110-L119) - Function
  - `src.modules.orders.services.remove.restoreById` (L131-L152) - Class
  - `src.modules.orders.services.remove.restoreById.then() callback` (L135-L152) - Function
  - `src.modules.orders.services.remove.restoreById.then() callback.then() callback` (L138-L151) - Function
  - `src.modules.orders.services.remove.restoreById.then() callback.then() callback.then() callback` (L142-L150) - Function
  - `src.modules.orders.services.remove.removeById` (L162-L173) - Class
  - `src.modules.orders.services.remove.removeById.then() callback` (L167-L173) - Function
  - `src.modules.orders.services.remove.removeById.then() callback.then() callback` (L171-L171) - Function
- `src/modules/orders/services/scope.ts`
  - `src.modules.orders.services.scope.refusalOnOrderId` (L91-L100) - Class
  - `src.modules.orders.services.scope.refusalOnOrderId.then() callback` (L100-L100) - Function
  - `src.modules.orders.services.scope.reachesBuyerOf` (L310-L318) - Class
  - `src.modules.orders.services.scope.reachesBuyerOf.then() callback` (L317-L317) - Function
  - `src.modules.orders.services.scope.handlesMoneyOf` (L327-L333) - Class
  - `src.modules.orders.services.scope.handlesMoneyOf.then() callback` (L332-L332) - Function
  - `src.modules.orders.services.scope.handlesMoneyOfOrder` (L342-L350) - Class
  - `src.modules.orders.services.scope.handlesMoneyOfOrder.then() callback` (L349-L349) - Function
