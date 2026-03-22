# WARNING: The MVC version is flawed because the true focus is in the restAPI versions

# Instructions
 - Create .env file using the example
 - Create database and link it using .env variables
 - Link to services using .env variables (es: email responders are a different kind of server)
 - Cron job needed to clean expired tokens in the table "tokens" (or in the users data if nosql)
 - Optional: use docker/podman to run the app

# Mock instructions
 - Use the openapi.yaml on Bruno to create a mock FE that consume the API, this will be useful for testing the API
   - left sidebar -> + -> import collection
   - Change enviroments variable "baseUrl" to httop://localhost:3001 (mockoon default)
   - Top right -> no enviroment to "local"
 - Use the openapi.yaml on Mockooon to create a mock API that return fake data
   - Top menu -> import/export -> Import Swagger V2


# TODO
- Test PUPPETEER (new createPDF)
- Check Dredd for automated contract tests (Spec conformance tests, Consumer-driven contract tests)
- Separate controllers & services
- Complete .dev enviroment (Bruno, Mockoon, Insomnia (update))
- Add products in cart to products list
- global.d.ts from types/ to root

# AI TODO
 - Create/complete tests
 - Create documentation
 - From import type { Request, Response, NextFunction } from "express"; to import type { RequestHandler } from "express";
- Create routes:
   - Create /auth/get-accounts (use /account from openapi
   - Create /cart/get-cart (use page-cart but json only)
   - Create /cart/get-checkout (use page-checkout but json only)
   - TODO


### TODO IMPORTANT ###
 - Update ZOD
 - post-reset-confirm.ts => POST /account/reset/{token}
 - get-reset-database is there a better way?
 - [Added page size to item]() lists (users, products and orders)
 - pagination changed in item lists
 - ALL "path" parameters are now "query", also now I added JSON only responses
 - orders list filter ProductParams
 - Check all controller routes, the openapi update created new routes (+ add JSON restapi only routes)
 - update insomnia for new openapi.yaml + create a test server? I don't remember the software name for reverse insomnia