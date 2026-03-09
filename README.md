# Instructions
 - Create .env file using the example
 - Create database and link it using .env variables
 - Link to services using .env variables (es: email responders are a different kind of server)
 - Cron job needed to clean expired tokens in the table "tokens" (or in the users data if nosql)
 - Optional: use docker/podman to run the app


# TODO
- Test PUPPETEER (new createPDF)
- Check Dredd for automated contract tests (Spec conformance tests, Consumer-driven contract tests)
- Separate controllers & services

# AI TODO
 - Create/complete tests
 - Create documentation
 - From import type { Request, Response, NextFunction } from "express"; to import type { RequestHandler } from "express";




### TODO IMPORTANT ###
Update ZOD
post-reset-confirm.ts => POST /account/reset/{token}
get-reset-database is there a better way?
Added page size to item lists (users, products and orders)
pagination changed in item lists
orders list filter ProductParams
- Check all controller routes, the openapi update created new routes (+ add JSON restapi only routes)
- update insomnia for new openapi.yaml + create a test server? I don't remember the software name for reverse insomnia