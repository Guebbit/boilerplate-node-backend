---
tags:
  - 2repo
  - 2repo/index
  - project/boilerplate-node-backend
type: index
modules: 30
updated: 2026-09-02T18:37:28.252262+00:00
---

# boilerplate-node-backend

boilerplate-node-backend is a Node.js backend scaffold structured around a modular e-commerce domain, with business logic split into per-feature modules (account, cart, orders, payments, products, inventory, delivery, wishlist, users, feedback) under `src/modules/` and shared concerns isolated in `src/infrastructure/`, including a set of external adapters. The repository pairs that source tree with a `db/` layer, a `scripts/` directory for operational tooling, and a substantial `docs/` section covering architecture theory, module reference, and tooling guides. Testing is layered across unit, infrastructure, and cross-cutting suites in `tests/`, with additional module-level tests co-located alongside their code where present.

## Module map
```mermaid
flowchart LR
    m_db["db/<br/>22 files"]
    m_docs["docs/<br/>27 files"]
    m_docs_modules["docs/modules/<br/>18 files"]
    m_docs_theory["docs/theory/<br/>16 files"]
    m_docs_tools["docs/tools/<br/>40 files"]
    m_scripts["scripts/<br/>25 files"]
    m_src["src/<br/>22 files"]
    m_src_infrastructure["src/infrastructure/<br/>43 files"]
    m_src_infrastructure_adapters["src/infrastructure/adapters/<br/>15 files"]
    m_src_modules["src/modules/<br/>20 files"]
    m_src_modules_account["src/modules/account/<br/>28 files"]
    m_src_modules_account_controllers["src/modules/account/controllers/<br/>26 files"]
    m_src_modules_account_tests["src/modules/account/tests/<br/>20 files"]
    m_src_modules_cart["src/modules/cart/<br/>38 files"]
    m_src_modules_delivery["src/modules/delivery/<br/>20 files"]
    m_src_modules_feedback["src/modules/feedback/<br/>21 files"]
    m_src_modules_inventory["src/modules/inventory/<br/>24 files"]
    m_src_modules_locales["src/modules/locales/<br/>32 files"]
    m_src_modules_orders["src/modules/orders/<br/>26 files"]
    m_src_modules_orders_tests["src/modules/orders/tests/<br/>21 files"]
    m_src_modules_payments["src/modules/payments/<br/>24 files"]
    m_src_modules_products["src/modules/products/<br/>31 files"]
    m_src_modules_users["src/modules/users/<br/>31 files"]
    m_src_modules_wishlist["src/modules/wishlist/<br/>21 files"]
    m_tests["tests/<br/>36 files"]
    m_tests_cross_cutting["tests/cross-cutting/<br/>30 files"]
    m_tests_support["tests/support/<br/>21 files"]
    m_tests_unit_infrastructure["tests/unit/infrastructure/<br/>27 files"]
    m_tests_unit_infrastructure_adapters["tests/unit/infrastructure/adapters/<br/>17 files"]
    m_root["/ (repository root)<br/>46 files"]
    m_root --- m_src
    m_root --- m_src_infrastructure_adapters
    m_root --- m_src_modules_account
    m_root --- m_src_modules_cart
    m_root --- m_src_modules_orders
    m_root --- m_src_modules_products
    m_root --- m_src_modules_users
    m_root --- m_tests_cross_cutting
    m_root --- m_tests_support
    m_scripts --- m_src_infrastructure
    m_src --- m_src_infrastructure
    m_src --- m_src_infrastructure_adapters
    m_src --- m_src_modules_account
    m_src --- m_src_modules_cart
    m_src --- m_src_modules_delivery
    m_src --- m_src_modules_orders
    m_src --- m_src_modules_payments
    m_src --- m_src_modules_products
    m_src --- m_src_modules_users
    m_src --- m_tests
    m_src --- m_tests_cross_cutting
    m_src --- m_tests_support
    m_src_infrastructure --- m_src_infrastructure_adapters
    m_src_infrastructure --- m_src_modules_account
    m_src_infrastructure --- m_src_modules_cart
    m_src_infrastructure --- m_src_modules_delivery
    m_src_infrastructure --- m_src_modules_inventory
    m_src_infrastructure --- m_src_modules_orders
    m_src_infrastructure --- m_src_modules_orders_tests
    m_src_infrastructure --- m_src_modules_payments
    m_src_infrastructure --- m_src_modules_products
    m_src_infrastructure --- m_src_modules_users
    m_src_infrastructure --- m_tests
    m_src_infrastructure --- m_tests_cross_cutting
    m_src_infrastructure --- m_tests_support
    m_src_infrastructure_adapters --- m_src_modules_account
    m_src_infrastructure_adapters --- m_src_modules_cart
    m_src_infrastructure_adapters --- m_src_modules_delivery
    m_src_infrastructure_adapters --- m_src_modules_inventory
    m_src_infrastructure_adapters --- m_src_modules_orders
    m_src_infrastructure_adapters --- m_src_modules_payments
    m_src_infrastructure_adapters --- m_src_modules_products
    m_src_infrastructure_adapters --- m_src_modules_users
    m_src_infrastructure_adapters --- m_tests
    m_src_infrastructure_adapters --- m_tests_cross_cutting
    m_src_infrastructure_adapters --- m_tests_support
    m_src_modules_account --- m_src_modules_cart
    m_src_modules_account --- m_src_modules_delivery
    m_src_modules_account --- m_src_modules_orders
    m_src_modules_account --- m_src_modules_products
    m_src_modules_account --- m_src_modules_users
    m_src_modules_account --- m_tests
    m_src_modules_account --- m_tests_cross_cutting
    m_src_modules_cart --- m_src_modules_orders
    m_src_modules_cart --- m_src_modules_products
    m_src_modules_cart --- m_src_modules_users
    m_src_modules_cart --- m_tests_cross_cutting
    m_src_modules_cart --- m_tests_support
    m_src_modules_delivery --- m_tests_cross_cutting
    m_src_modules_delivery --- m_tests_support
    m_src_modules_orders --- m_src_modules_products
    m_src_modules_orders --- m_src_modules_users
    m_src_modules_orders --- m_tests_cross_cutting
    m_src_modules_products --- m_src_modules_users
    m_src_modules_products --- m_tests_cross_cutting
    m_src_modules_products --- m_tests_support
    m_src_modules_users --- m_tests_cross_cutting
    m_src_modules_users --- m_tests_support
    m_tests --- m_tests_cross_cutting
    m_tests_cross_cutting --- m_tests_support
```

_129 lower-traffic connection(s) hidden to keep the diagram readable._

## Modules
- [[boilerplate-node-backend_db|db/]] — 22 files, 7 connected modules
- [[boilerplate-node-backend_docs|docs/]] — 27 files, 4 connected modules
- [[boilerplate-node-backend_docs_modules|docs/modules/]] — 18 files, 3 connected modules
- [[boilerplate-node-backend_docs_theory|docs/theory/]] — 16 files, 4 connected modules
- [[boilerplate-node-backend_docs_tools|docs/tools/]] — 40 files, 4 connected modules
- [[boilerplate-node-backend_scripts|scripts/]] — 25 files, 12 connected modules
- [[boilerplate-node-backend_src|src/]] — 22 files, 22 connected modules
- [[boilerplate-node-backend_src_infrastructure|src/infrastructure/]] — 43 files, 24 connected modules
- [[boilerplate-node-backend_src_infrastructure_adapters|src/infrastructure/adapters/]] — 15 files, 23 connected modules
- [[boilerplate-node-backend_src_modules|src/modules/]] — 20 files, 9 connected modules
- [[boilerplate-node-backend_src_modules_account|src/modules/account/]] — 28 files, 21 connected modules
- [[boilerplate-node-backend_src_modules_account_controllers|src/modules/account/controllers/]] — 26 files, 6 connected modules
- [[boilerplate-node-backend_src_modules_account_tests|src/modules/account/tests/]] — 20 files, 10 connected modules
- [[boilerplate-node-backend_src_modules_cart|src/modules/cart/]] — 38 files, 20 connected modules
- [[boilerplate-node-backend_src_modules_delivery|src/modules/delivery/]] — 20 files, 15 connected modules
- [[boilerplate-node-backend_src_modules_feedback|src/modules/feedback/]] — 21 files, 9 connected modules
- [[boilerplate-node-backend_src_modules_inventory|src/modules/inventory/]] — 24 files, 13 connected modules
- [[boilerplate-node-backend_src_modules_locales|src/modules/locales/]] — 32 files, 6 connected modules
- [[boilerplate-node-backend_src_modules_orders|src/modules/orders/]] — 26 files, 19 connected modules
- [[boilerplate-node-backend_src_modules_orders_tests|src/modules/orders/tests/]] — 21 files, 12 connected modules
- [[boilerplate-node-backend_src_modules_payments|src/modules/payments/]] — 24 files, 14 connected modules
- [[boilerplate-node-backend_src_modules_products|src/modules/products/]] — 31 files, 19 connected modules
- [[boilerplate-node-backend_src_modules_users|src/modules/users/]] — 31 files, 18 connected modules
- [[boilerplate-node-backend_src_modules_wishlist|src/modules/wishlist/]] — 21 files, 11 connected modules
- [[boilerplate-node-backend_tests|tests/]] — 36 files, 15 connected modules
- [[boilerplate-node-backend_tests_cross-cutting|tests/cross-cutting/]] — 30 files, 21 connected modules
- [[boilerplate-node-backend_tests_support|tests/support/]] — 21 files, 21 connected modules
- [[boilerplate-node-backend_tests_unit_infrastructure|tests/unit/infrastructure/]] — 27 files, 8 connected modules
- [[boilerplate-node-backend_tests_unit_infrastructure_adapters|tests/unit/infrastructure/adapters/]] — 17 files, 8 connected modules
- [[boilerplate-node-backend_ROOT|/ (repository root)]] — 46 files, 20 connected modules
