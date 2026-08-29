---
tags:
  - 2repo
  - 2repo/index
  - project/boilerplate-node-backend
type: index
modules: 30
updated: 2026-08-28T12:03:04.785917+00:00
---

# boilerplate-node-backend

`boilerplate-node-backend` is a Node.js backend project organized around an e-commerce domain, with business logic split into per-feature modules under `src/modules/` (account, cart, delivery, feedback, inventory, locales, orders, payments, products, users, wishlist). Shared concerns such as HTTP handling are isolated in `src/infrastructure/`, database code lives in a top-level `db/` directory, and project-level documentation is kept under `docs/`. The test suite is layered into unit, cross-cutting, and support suites under `tests/`, with additional co-located tests inside select feature modules.

## Module map
```mermaid
flowchart LR
    m_db["db/<br/>21 files"]
    m_docs["docs/<br/>34 files"]
    m_docs_modules["docs/modules/<br/>18 files"]
    m_docs_tools["docs/tools/<br/>38 files"]
    m_scripts["scripts/<br/>22 files"]
    m_src["src/<br/>22 files"]
    m_src_infrastructure["src/infrastructure/<br/>39 files"]
    m_src_infrastructure_http["src/infrastructure/http/<br/>14 files"]
    m_src_modules["src/modules/<br/>20 files"]
    m_src_modules_account["src/modules/account/<br/>23 files"]
    m_src_modules_account_controllers["src/modules/account/controllers/<br/>20 files"]
    m_src_modules_account_tests["src/modules/account/tests/<br/>19 files"]
    m_src_modules_cart["src/modules/cart/<br/>37 files"]
    m_src_modules_delivery["src/modules/delivery/<br/>20 files"]
    m_src_modules_feedback["src/modules/feedback/<br/>19 files"]
    m_src_modules_inventory["src/modules/inventory/<br/>24 files"]
    m_src_modules_locales["src/modules/locales/<br/>32 files"]
    m_src_modules_orders["src/modules/orders/<br/>26 files"]
    m_src_modules_orders_tests["src/modules/orders/tests/<br/>20 files"]
    m_src_modules_payments["src/modules/payments/<br/>22 files"]
    m_src_modules_products["src/modules/products/<br/>30 files"]
    m_src_modules_users["src/modules/users/<br/>30 files"]
    m_src_modules_wishlist["src/modules/wishlist/<br/>21 files"]
    m_tests["tests/<br/>19 files"]
    m_tests_cross_cutting["tests/cross-cutting/<br/>38 files"]
    m_tests_support["tests/support/<br/>20 files"]
    m_tests_unit["tests/unit/<br/>14 files"]
    m_tests_unit_infrastructure["tests/unit/infrastructure/<br/>27 files"]
    m_tests_unit_infrastructure_adapters["tests/unit/infrastructure/adapters/<br/>14 files"]
    m_root["/ (repository root)<br/>39 files"]
    m_root --- m_scripts
    m_root --- m_src
    m_root --- m_src_infrastructure
    m_root --- m_src_modules_account
    m_root --- m_src_modules_cart
    m_root --- m_src_modules_delivery
    m_root --- m_src_modules_orders
    m_root --- m_src_modules_payments
    m_root --- m_src_modules_products
    m_root --- m_src_modules_users
    m_root --- m_tests_support
    m_scripts --- m_src
    m_src --- m_src_infrastructure
    m_src --- m_src_infrastructure_http
    m_src --- m_src_modules_account
    m_src --- m_src_modules_cart
    m_src --- m_src_modules_delivery
    m_src --- m_src_modules_inventory
    m_src --- m_src_modules_orders
    m_src --- m_src_modules_orders_tests
    m_src --- m_src_modules_payments
    m_src --- m_src_modules_products
    m_src --- m_src_modules_users
    m_src --- m_src_modules_wishlist
    m_src --- m_tests
    m_src --- m_tests_cross_cutting
    m_src --- m_tests_support
    m_src_infrastructure --- m_src_infrastructure_http
    m_src_infrastructure --- m_src_modules
    m_src_infrastructure --- m_src_modules_account
    m_src_infrastructure --- m_src_modules_account_tests
    m_src_infrastructure --- m_src_modules_cart
    m_src_infrastructure --- m_src_modules_delivery
    m_src_infrastructure --- m_src_modules_inventory
    m_src_infrastructure --- m_src_modules_orders
    m_src_infrastructure --- m_src_modules_orders_tests
    m_src_infrastructure --- m_src_modules_payments
    m_src_infrastructure --- m_src_modules_products
    m_src_infrastructure --- m_src_modules_users
    m_src_infrastructure --- m_src_modules_wishlist
    m_src_infrastructure --- m_tests
    m_src_infrastructure --- m_tests_cross_cutting
    m_src_infrastructure --- m_tests_support
    m_src_infrastructure --- m_tests_unit
    m_src_infrastructure --- m_tests_unit_infrastructure
    m_src_infrastructure_http --- m_src_modules_account
    m_src_infrastructure_http --- m_src_modules_cart
    m_src_infrastructure_http --- m_src_modules_delivery
    m_src_infrastructure_http --- m_src_modules_inventory
    m_src_infrastructure_http --- m_src_modules_orders
    m_src_infrastructure_http --- m_src_modules_payments
    m_src_infrastructure_http --- m_src_modules_products
    m_src_infrastructure_http --- m_src_modules_users
    m_src_infrastructure_http --- m_tests
    m_src_infrastructure_http --- m_tests_support
    m_src_modules_account --- m_src_modules_cart
    m_src_modules_account --- m_src_modules_products
    m_src_modules_cart --- m_src_modules_orders
    m_src_modules_cart --- m_src_modules_payments
    m_src_modules_cart --- m_src_modules_products
    m_src_modules_cart --- m_src_modules_users
    m_src_modules_cart --- m_tests_support
    m_src_modules_delivery --- m_tests_support
    m_src_modules_inventory --- m_tests_support
    m_src_modules_orders --- m_src_modules_products
    m_src_modules_payments --- m_tests_support
    m_src_modules_products --- m_src_modules_users
    m_src_modules_products --- m_tests_support
    m_src_modules_users --- m_tests_support
    m_tests --- m_tests_support
```

_111 lower-traffic connection(s) hidden to keep the diagram readable._

## Modules
- [[boilerplate-node-backend_db|db/]] — 21 files, 7 connected modules
- [[boilerplate-node-backend_docs|docs/]] — 34 files, 3 connected modules
- [[boilerplate-node-backend_docs_modules|docs/modules/]] — 18 files, 2 connected modules
- [[boilerplate-node-backend_docs_tools|docs/tools/]] — 38 files, 3 connected modules
- [[boilerplate-node-backend_scripts|scripts/]] — 22 files, 13 connected modules
- [[boilerplate-node-backend_src|src/]] — 22 files, 23 connected modules
- [[boilerplate-node-backend_src_infrastructure|src/infrastructure/]] — 39 files, 25 connected modules
- [[boilerplate-node-backend_src_infrastructure_http|src/infrastructure/http/]] — 14 files, 21 connected modules
- [[boilerplate-node-backend_src_modules|src/modules/]] — 20 files, 9 connected modules
- [[boilerplate-node-backend_src_modules_account|src/modules/account/]] — 23 files, 15 connected modules
- [[boilerplate-node-backend_src_modules_account_controllers|src/modules/account/controllers/]] — 20 files, 6 connected modules
- [[boilerplate-node-backend_src_modules_account_tests|src/modules/account/tests/]] — 19 files, 8 connected modules
- [[boilerplate-node-backend_src_modules_cart|src/modules/cart/]] — 37 files, 19 connected modules
- [[boilerplate-node-backend_src_modules_delivery|src/modules/delivery/]] — 20 files, 13 connected modules
- [[boilerplate-node-backend_src_modules_feedback|src/modules/feedback/]] — 19 files, 7 connected modules
- [[boilerplate-node-backend_src_modules_inventory|src/modules/inventory/]] — 24 files, 12 connected modules
- [[boilerplate-node-backend_src_modules_locales|src/modules/locales/]] — 32 files, 5 connected modules
- [[boilerplate-node-backend_src_modules_orders|src/modules/orders/]] — 26 files, 15 connected modules
- [[boilerplate-node-backend_src_modules_orders_tests|src/modules/orders/tests/]] — 20 files, 11 connected modules
- [[boilerplate-node-backend_src_modules_payments|src/modules/payments/]] — 22 files, 14 connected modules
- [[boilerplate-node-backend_src_modules_products|src/modules/products/]] — 30 files, 18 connected modules
- [[boilerplate-node-backend_src_modules_users|src/modules/users/]] — 30 files, 16 connected modules
- [[boilerplate-node-backend_src_modules_wishlist|src/modules/wishlist/]] — 21 files, 10 connected modules
- [[boilerplate-node-backend_tests|tests/]] — 19 files, 12 connected modules
- [[boilerplate-node-backend_tests_cross-cutting|tests/cross-cutting/]] — 38 files, 10 connected modules
- [[boilerplate-node-backend_tests_support|tests/support/]] — 20 files, 21 connected modules
- [[boilerplate-node-backend_tests_unit|tests/unit/]] — 14 files, 9 connected modules
- [[boilerplate-node-backend_tests_unit_infrastructure|tests/unit/infrastructure/]] — 27 files, 8 connected modules
- [[boilerplate-node-backend_tests_unit_infrastructure_adapters|tests/unit/infrastructure/adapters/]] — 14 files, 7 connected modules
- [[boilerplate-node-backend_ROOT|/ (repository root)]] — 39 files, 20 connected modules
