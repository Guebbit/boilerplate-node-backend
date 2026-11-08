---
tags:
  - 2brain
  - 2brain/index
  - project/boilerplate-node-backend
type: index
modules: 30
updated: 2026-11-08T10:55:01.355501+00:00
---

# boilerplate-node-backend

`boilerplate-node-backend` is a Node.js backend scaffolded around a modular domain architecture. Feature logic lives under `src/modules/`, organized into bounded domains such as orders, payments, cart, inventory, products, users, and webhooks, with many modules further split into `controllers/` and `services/` subdirectories. Cross-cutting concerns are placed in `src/infrastructure/` (including adapters) and `shared/`, while operational tooling—Docker definitions, utility scripts, contract files, and test scenarios—is kept in the top-level `docker/`, `scripts/`, and `scenarios/` directories.

## Module map
```mermaid
flowchart LR
    m_docker["docker/<br/>37 files"]
    m_scenarios["scenarios/<br/>49 files"]
    m_scripts["scripts/<br/>98 files"]
    m_scripts_contracts["scripts/contracts/<br/>35 files"]
    m_shared["shared/<br/>47 files"]
    m_src["src/<br/>40 files"]
    m_src_infrastructure["src/infrastructure/<br/>126 files"]
    m_src_infrastructure_adapters["src/infrastructure/adapters/<br/>34 files"]
    m_src_modules["src/modules/<br/>194 files"]
    m_src_modules_account["src/modules/account/<br/>157 files"]
    m_src_modules_account_controllers["src/modules/account/controllers/<br/>43 files"]
    m_src_modules_account_services["src/modules/account/services/<br/>35 files"]
    m_src_modules_cart["src/modules/cart/<br/>72 files"]
    m_src_modules_delivery["src/modules/delivery/<br/>65 files"]
    m_src_modules_delivery_services["src/modules/delivery/services/<br/>32 files"]
    m_src_modules_example["src/modules/example/<br/>50 files"]
    m_src_modules_inventory["src/modules/inventory/<br/>60 files"]
    m_src_modules_invoicing["src/modules/invoicing/<br/>50 files"]
    m_src_modules_locales["src/modules/locales/<br/>52 files"]
    m_src_modules_notifications["src/modules/notifications/<br/>36 files"]
    m_src_modules_observability["src/modules/observability/<br/>40 files"]
    m_src_modules_orders["src/modules/orders/<br/>137 files"]
    m_src_modules_payments["src/modules/payments/<br/>105 files"]
    m_src_modules_products["src/modules/products/<br/>69 files"]
    m_src_modules_returns["src/modules/returns/<br/>81 files"]
    m_src_modules_shop_tasks["src/modules/shop-tasks/<br/>31 files"]
    m_src_modules_tasks["src/modules/tasks/<br/>58 files"]
    m_src_modules_users["src/modules/users/<br/>78 files"]
    m_src_modules_webhooks["src/modules/webhooks/<br/>64 files"]
    m_root["/ (repository root)<br/>502 files"]
    m_scenarios --- m_src
    m_scenarios --- m_src_infrastructure
    m_scenarios --- m_src_infrastructure_adapters
    m_scenarios --- m_src_modules
    m_scenarios --- m_src_modules_account
    m_scenarios --- m_src_modules_users
    m_scripts --- m_src_infrastructure
    m_scripts --- m_src_infrastructure_adapters
    m_shared --- m_src_infrastructure_adapters
    m_src --- m_src_infrastructure
    m_src --- m_src_infrastructure_adapters
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
    m_src --- m_src_modules_shop_tasks
    m_src --- m_src_modules_users
    m_src_infrastructure --- m_src_infrastructure_adapters
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
    m_src_infrastructure --- m_src_modules_shop_tasks
    m_src_infrastructure --- m_src_modules_users
    m_src_infrastructure_adapters --- m_src_modules
    m_src_infrastructure_adapters --- m_src_modules_account
    m_src_infrastructure_adapters --- m_src_modules_cart
    m_src_infrastructure_adapters --- m_src_modules_delivery
    m_src_infrastructure_adapters --- m_src_modules_inventory
    m_src_infrastructure_adapters --- m_src_modules_invoicing
    m_src_infrastructure_adapters --- m_src_modules_notifications
    m_src_infrastructure_adapters --- m_src_modules_orders
    m_src_infrastructure_adapters --- m_src_modules_payments
    m_src_infrastructure_adapters --- m_src_modules_products
    m_src_infrastructure_adapters --- m_src_modules_returns
    m_src_infrastructure_adapters --- m_src_modules_shop_tasks
    m_src_infrastructure_adapters --- m_src_modules_users
    m_src_modules --- m_src_modules_account
    m_src_modules --- m_src_modules_cart
    m_src_modules --- m_src_modules_delivery
    m_src_modules --- m_src_modules_invoicing
    m_src_modules --- m_src_modules_orders
    m_src_modules --- m_src_modules_payments
    m_src_modules --- m_src_modules_products
    m_src_modules --- m_src_modules_users
    m_src_modules_account --- m_src_modules_cart
    m_src_modules_account --- m_src_modules_delivery
    m_src_modules_account --- m_src_modules_invoicing
    m_src_modules_account --- m_src_modules_orders
    m_src_modules_account --- m_src_modules_products
    m_src_modules_account --- m_src_modules_users
    m_src_modules_cart --- m_src_modules_users
    m_src_modules_delivery --- m_src_modules_users
    m_src_modules_invoicing --- m_src_modules_users
    m_src_modules_orders --- m_src_modules_users
    m_src_modules_payments --- m_src_modules_users
    m_src_modules_products --- m_src_modules_users
    m_src_modules_shop_tasks --- m_src_modules_users
```

_148 lower-traffic connection(s) hidden to keep the diagram readable._

## Modules
- [[boilerplate-node-backend_docker|docker/]] — 37 files, 1 connected module
- [[boilerplate-node-backend_scenarios|scenarios/]] — 49 files, 20 connected modules
- [[boilerplate-node-backend_scripts|scripts/]] — 98 files, 13 connected modules
- [[boilerplate-node-backend_scripts_contracts|scripts/contracts/]] — 35 files, 7 connected modules
- [[boilerplate-node-backend_shared|shared/]] — 47 files, 14 connected modules
- [[boilerplate-node-backend_src|src/]] — 40 files, 26 connected modules
- [[boilerplate-node-backend_src_infrastructure|src/infrastructure/]] — 126 files, 27 connected modules
- [[boilerplate-node-backend_src_infrastructure_adapters|src/infrastructure/adapters/]] — 34 files, 28 connected modules
- [[boilerplate-node-backend_src_modules|src/modules/]] — 194 files, 24 connected modules
- [[boilerplate-node-backend_src_modules_account|src/modules/account/]] — 157 files, 23 connected modules
- [[boilerplate-node-backend_src_modules_account_controllers|src/modules/account/controllers/]] — 43 files, 7 connected modules
- [[boilerplate-node-backend_src_modules_account_services|src/modules/account/services/]] — 35 files, 12 connected modules
- [[boilerplate-node-backend_src_modules_cart|src/modules/cart/]] — 72 files, 18 connected modules
- [[boilerplate-node-backend_src_modules_delivery|src/modules/delivery/]] — 65 files, 18 connected modules
- [[boilerplate-node-backend_src_modules_delivery_services|src/modules/delivery/services/]] — 32 files, 12 connected modules
- [[boilerplate-node-backend_src_modules_example|src/modules/example/]] — 50 files, 11 connected modules
- [[boilerplate-node-backend_src_modules_inventory|src/modules/inventory/]] — 60 files, 15 connected modules
- [[boilerplate-node-backend_src_modules_invoicing|src/modules/invoicing/]] — 50 files, 19 connected modules
- [[boilerplate-node-backend_src_modules_locales|src/modules/locales/]] — 52 files, 12 connected modules
- [[boilerplate-node-backend_src_modules_notifications|src/modules/notifications/]] — 36 files, 13 connected modules
- [[boilerplate-node-backend_src_modules_observability|src/modules/observability/]] — 40 files, 11 connected modules
- [[boilerplate-node-backend_src_modules_orders|src/modules/orders/]] — 137 files, 19 connected modules
- [[boilerplate-node-backend_src_modules_payments|src/modules/payments/]] — 105 files, 17 connected modules
- [[boilerplate-node-backend_src_modules_products|src/modules/products/]] — 69 files, 19 connected modules
- [[boilerplate-node-backend_src_modules_returns|src/modules/returns/]] — 81 files, 15 connected modules
- [[boilerplate-node-backend_src_modules_shop-tasks|src/modules/shop-tasks/]] — 31 files, 16 connected modules
- [[boilerplate-node-backend_src_modules_tasks|src/modules/tasks/]] — 58 files, 11 connected modules
- [[boilerplate-node-backend_src_modules_users|src/modules/users/]] — 78 files, 25 connected modules
- [[boilerplate-node-backend_src_modules_webhooks|src/modules/webhooks/]] — 64 files, 11 connected modules
- [[boilerplate-node-backend_ROOT|/ (repository root)]] — 502 files, 28 connected modules
