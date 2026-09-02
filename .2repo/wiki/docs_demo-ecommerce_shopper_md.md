# docs/demo-ecommerce/shopper.md

## Purpose

A narrative walkthrough of the complete customer journey in the demo pet-supplies shop, from browsing through to post-purchase actions. It exists as a single mental model that ties the individual backend modules (cart, inventory, payments, etc.) together from the shopper's point of view, so a reader does not need to stitch the pieces from module docs alone.

## Key elements

- **Journey flowchart** – Mermaid diagram showing the happy path (browse → basket → checkout → stock check → set-aside → pay → ship → delivered) and the two refusal branches (out-of-stock, card declined).
- **Browsing rules** – No account required; out-of-stock items remain visible (the Heavy-Duty Cat Scratching Post is the standing example); basket is server-side; wishlist is a separate "maybe later" store.
- **Checkout invariant** – Prices, address, delivery cost, and stock are validated simultaneously; any single failure refuses the entire checkout with all problem lines listed at once (all-or-nothing).
- **30-minute reservation** – Successful checkout sets goods aside for 30 minutes; expiry or cancellation returns stock and cancels the order.
- **Payment behavior** – All test card numbers are accepted except `4000000000000002` (deliberate refusal); a refused card leaves the order unpaid and the reservation intact; a successful payment atomically marks the order paid and goods sold.
- **Post-purchase actions** – View own orders, download PDF invoice, cancel (with automatic refund if paid), one-click re-order, parcel tracking.
- **Account lifecycle** – Sign-up, email verification, password reset/change, multi-device session listing with "log out everywhere", address book with a default address, two-step account deletion that cascades to basket, wishlist, and address book.
- **Glossary table** – Plain-language definitions of *set aside*, *checkout*, *order*, *invoice*, and *session*.

## Relationships

- **`docs/demo-ecommerce/index.md`** – Parent index for the demo-ecommerce documentation set.
- **`docs/modules/cart.md`** – The server-side basket; wishlist items are moved into the basket and leave the wishlist.
- **`docs/modules/wishlist.md`** – The "maybe later" store feeding the basket.
- **`docs/modules/inventory.md`** – Stock availability checks at checkout; the set-aside / sold / back-on-shelf lifecycle.
- **`docs/modules/inventory-reservations.md`** – Detailed mechanics of the 30-minute hold referenced in the "The 30-minute hold" section.
- **`docs/modules/payments.md`** – Card validation, the deliberate-refusal test number, and the atomic paid + sold transition.
- **`docs/modules/orders.md`** – Order history visibility, cancellation with refund, and one-click re-order.
- **`docs/modules/delivery.md`** – Parcel tracking once the order ships.
- **`docs/modules/account.md`** – Authentication, session management, address book, and cascading account deletion.

## Notes

- This file is a **narrative** document, not a technical spec. It deliberately uses plain language and mermaid diagrams rather than API or schema descriptions.
- Out-of-stock items are **intentionally visible** in the shop; this is a stated design choice, not a bug.
- The only card number that is always refused is `4000000000000002`; every other made-up number is accepted. This is the sole mechanism for demonstrating a payment failure.
- Account deletion is **two-step** and cascades: basket, wishlist, and address book are all removed.
