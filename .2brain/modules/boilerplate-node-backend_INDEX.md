---
tags:
  - 2brain
  - 2brain/index
  - project/boilerplate-node-backend
type: index
modules: 30
updated: 2026-10-15T13:42:50.396007+00:00
---

# boilerplate-node-backend

`boilerplate-node-backend` is a Node.js backend starter built around an e-commerce and platform domain, with business logic split into per-feature modules under `src/modules/` (account, orders, payments, products, cart, inventory, delivery, invoicing, and others) and shared technical concerns isolated in `src/infrastructure/` (HTTP layer and external adapters). Each domain module follows a conventional sub-structure of controllers, services, and supporting files. Supporting material lives in `scenarios/` for integration-level test flows and `scripts/` for build and tooling automation.

## Module map
```mermaid
flowchart LR
    m_scenarios["scenarios/<br/>42 files"]
    m_scripts["scripts/<br/>122 files"]
    m_src["src/<br/>35 files"]
    m_src_infrastructure["src/infrastructure/<br/>70 files"]
    m_src_infrastructure_adapters["src/infrastructure/adapters/<br/>34 files"]
    m_src_infrastructure_http["src/infrastructure/http/<br/>29 files"]
    m_src_modules["src/modules/<br/>59 files"]
    m_src_modules_account["src/modules/account/<br/>132 files"]
    m_src_modules_account_controllers["src/modules/account/controllers/<br/>43 files"]
    m_src_modules_account_services["src/modules/account/services/<br/>31 files"]
    m_src_modules_addresses["src/modules/addresses/<br/>26 files"]
    m_src_modules_api_keys["src/modules/api-keys/<br/>25 files"]
    m_src_modules_cart["src/modules/cart/<br/>62 files"]
    m_src_modules_delivery["src/modules/delivery/<br/>43 files"]
    m_src_modules_delivery_services["src/modules/delivery/services/<br/>26 files"]
    m_src_modules_example["src/modules/example/<br/>39 files"]
    m_src_modules_feedback["src/modules/feedback/<br/>30 files"]
    m_src_modules_inventory["src/modules/inventory/<br/>44 files"]
    m_src_modules_invoicing["src/modules/invoicing/<br/>37 files"]
    m_src_modules_locales["src/modules/locales/<br/>44 files"]
    m_src_modules_notifications["src/modules/notifications/<br/>25 files"]
    m_src_modules_observability["src/modules/observability/<br/>36 files"]
    m_src_modules_orders["src/modules/orders/<br/>115 files"]
    m_src_modules_payments["src/modules/payments/<br/>75 files"]
    m_src_modules_products["src/modules/products/<br/>62 files"]
    m_src_modules_returns["src/modules/returns/<br/>55 files"]
    m_src_modules_users["src/modules/users/<br/>54 files"]
    m_src_modules_webhooks["src/modules/webhooks/<br/>54 files"]
    m_src_modules_wishlist["src/modules/wishlist/<br/>25 files"]
    m_root["/ (repository root)<br/>434 files"]
    m_scenarios --- m_src
    m_scenarios --- m_src_infrastructure
    m_scenarios --- m_src_infrastructure_adapters
    m_scenarios --- m_src_infrastructure_http
    m_scenarios --- m_src_modules_account
    m_scenarios --- m_src_modules_orders
    m_scenarios --- m_src_modules_products
    m_scenarios --- m_src_modules_users
    m_scripts --- m_src
    m_scripts --- m_src_infrastructure
    m_scripts --- m_src_infrastructure_adapters
    m_scripts --- m_src_infrastructure_http
    m_src --- m_src_infrastructure
    m_src --- m_src_infrastructure_adapters
    m_src --- m_src_infrastructure_http
    m_src --- m_src_modules
    m_src --- m_src_modules_account
    m_src --- m_src_modules_cart
    m_src --- m_src_modules_delivery
    m_src --- m_src_modules_inventory
    m_src --- m_src_modules_invoicing
    m_src --- m_src_modules_orders
    m_src --- m_src_modules_payments
    m_src --- m_src_modules_products
    m_src --- m_src_modules_returns
    m_src --- m_src_modules_users
    m_src_infrastructure --- m_src_infrastructure_adapters
    m_src_infrastructure --- m_src_infrastructure_http
    m_src_infrastructure --- m_src_modules
    m_src_infrastructure --- m_src_modules_account
    m_src_infrastructure --- m_src_modules_cart
    m_src_infrastructure --- m_src_modules_delivery
    m_src_infrastructure --- m_src_modules_inventory
    m_src_infrastructure --- m_src_modules_invoicing
    m_src_infrastructure --- m_src_modules_orders
    m_src_infrastructure --- m_src_modules_payments
    m_src_infrastructure --- m_src_modules_products
    m_src_infrastructure --- m_src_modules_returns
    m_src_infrastructure --- m_src_modules_users
    m_src_infrastructure_adapters --- m_src_infrastructure_http
    m_src_infrastructure_adapters --- m_src_modules
    m_src_infrastructure_adapters --- m_src_modules_account
    m_src_infrastructure_adapters --- m_src_modules_cart
    m_src_infrastructure_adapters --- m_src_modules_delivery
    m_src_infrastructure_adapters --- m_src_modules_invoicing
    m_src_infrastructure_adapters --- m_src_modules_orders
    m_src_infrastructure_adapters --- m_src_modules_payments
    m_src_infrastructure_adapters --- m_src_modules_products
    m_src_infrastructure_adapters --- m_src_modules_returns
    m_src_infrastructure_adapters --- m_src_modules_users
    m_src_infrastructure_http --- m_src_modules
    m_src_infrastructure_http --- m_src_modules_account
    m_src_infrastructure_http --- m_src_modules_cart
    m_src_infrastructure_http --- m_src_modules_delivery
    m_src_infrastructure_http --- m_src_modules_inventory
    m_src_infrastructure_http --- m_src_modules_invoicing
    m_src_infrastructure_http --- m_src_modules_orders
    m_src_infrastructure_http --- m_src_modules_payments
    m_src_infrastructure_http --- m_src_modules_products
    m_src_infrastructure_http --- m_src_modules_returns
    m_src_infrastructure_http --- m_src_modules_users
    m_src_modules --- m_src_modules_account
    m_src_modules --- m_src_modules_users
    m_src_modules_account --- m_src_modules_cart
    m_src_modules_account --- m_src_modules_orders
    m_src_modules_account --- m_src_modules_products
    m_src_modules_account --- m_src_modules_users
    m_src_modules_cart --- m_src_modules_users
    m_src_modules_orders --- m_src_modules_users
    m_src_modules_products --- m_src_modules_users
```

_153 lower-traffic connection(s) hidden to keep the diagram readable._

## Modules
- [[boilerplate-node-backend_scenarios|scenarios/]] — 42 files, 21 connected modules
- [[boilerplate-node-backend_scripts|scripts/]] — 122 files, 18 connected modules
- [[boilerplate-node-backend_src|src/]] — 35 files, 29 connected modules
- [[boilerplate-node-backend_src_infrastructure|src/infrastructure/]] — 70 files, 29 connected modules
- [[boilerplate-node-backend_src_infrastructure_adapters|src/infrastructure/adapters/]] — 34 files, 26 connected modules
- [[boilerplate-node-backend_src_infrastructure_http|src/infrastructure/http/]] — 29 files, 29 connected modules
- [[boilerplate-node-backend_src_modules|src/modules/]] — 59 files, 20 connected modules
- [[boilerplate-node-backend_src_modules_account|src/modules/account/]] — 132 files, 23 connected modules
- [[boilerplate-node-backend_src_modules_account_controllers|src/modules/account/controllers/]] — 43 files, 8 connected modules
- [[boilerplate-node-backend_src_modules_account_services|src/modules/account/services/]] — 31 files, 10 connected modules
- [[boilerplate-node-backend_src_modules_addresses|src/modules/addresses/]] — 26 files, 10 connected modules
- [[boilerplate-node-backend_src_modules_api-keys|src/modules/api-keys/]] — 25 files, 9 connected modules
- [[boilerplate-node-backend_src_modules_cart|src/modules/cart/]] — 62 files, 20 connected modules
- [[boilerplate-node-backend_src_modules_delivery|src/modules/delivery/]] — 43 files, 18 connected modules
- [[boilerplate-node-backend_src_modules_delivery_services|src/modules/delivery/services/]] — 26 files, 10 connected modules
- [[boilerplate-node-backend_src_modules_example|src/modules/example/]] — 39 files, 8 connected modules
- [[boilerplate-node-backend_src_modules_feedback|src/modules/feedback/]] — 30 files, 6 connected modules
- [[boilerplate-node-backend_src_modules_inventory|src/modules/inventory/]] — 44 files, 15 connected modules
- [[boilerplate-node-backend_src_modules_invoicing|src/modules/invoicing/]] — 37 files, 16 connected modules
- [[boilerplate-node-backend_src_modules_locales|src/modules/locales/]] — 44 files, 8 connected modules
- [[boilerplate-node-backend_src_modules_notifications|src/modules/notifications/]] — 25 files, 10 connected modules
- [[boilerplate-node-backend_src_modules_observability|src/modules/observability/]] — 36 files, 10 connected modules
- [[boilerplate-node-backend_src_modules_orders|src/modules/orders/]] — 115 files, 21 connected modules
- [[boilerplate-node-backend_src_modules_payments|src/modules/payments/]] — 75 files, 17 connected modules
- [[boilerplate-node-backend_src_modules_products|src/modules/products/]] — 62 files, 21 connected modules
- [[boilerplate-node-backend_src_modules_returns|src/modules/returns/]] — 55 files, 17 connected modules
- [[boilerplate-node-backend_src_modules_users|src/modules/users/]] — 54 files, 24 connected modules
- [[boilerplate-node-backend_src_modules_webhooks|src/modules/webhooks/]] — 54 files, 9 connected modules
- [[boilerplate-node-backend_src_modules_wishlist|src/modules/wishlist/]] — 25 files, 12 connected modules
- [[boilerplate-node-backend_ROOT|/ (repository root)]] — 434 files, 28 connected modules
