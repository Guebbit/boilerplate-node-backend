# Instructions
- Create .env file using the example
- Create database and link it using .env variables
- Link to services using .env variables (es: email responders are a different kind of server)
- Cron job needed to clean expired tokens in the table "tokens" (or in the users data if nosql)
- Optional: use docker/podman to run the app


# Useful info
- https://sequelize.org/docs/v6/core-concepts/model-basics/
- https://sequelize.org/docs/v6/other-topics/typescript/
- https://sequelize.org/docs/v6/other-topics/hooks/
- https://stackoverflow.com/questions/22958683/how-to-implement-many-to-many-association-in-sequelize
- https://github.com/melardev/ApiEcomSequelizeExpress/blob/master/models/product.model.js


# TODO
- Connect-flash could show messages after a reload, there is an async problem in some cases
  - https://github.com/mweibel/connect-session-sequelize/issues/20
  - https://github.com/mweibel/connect-session-sequelize/issues/7
- Hard delete of products or their edits change the orders history, must use OrderItems to hard save the necessary product data at the time of the order
- Correct sequelize's difficulties with inferred types and remove @ts-expect-error
- Test PUPPETEER (new createPDF)
- Check Dredd for automated contract tests (Spec conformance tests, Consumer-driven contract tests)


# AI TODO
- Create/complete tests
- Create documentation
- From import type { Request, Response, NextFunction } from "express"; to import type { RequestHandler } from "express";


### TODO IMPORTANT ###
Update ZOD
post-reset-confirm.ts => POST /account/reset/{token}
get-reset-database is there a better way?
Added page size to list users, list products and list orders
- ALL "path" parameters are now "query", also now I added JSON only responses
- update insomnia for new openapi.yaml + create a test server? I don't remember the software name for reverse insomnia