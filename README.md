# Instructions
- Create .env file using the example
- Create database and link it using .env variables
- Link to services using .env variables (es: email responders are a different kind of server)
- Cron job needed to clean expired tokens in the table "tokens" (or in the users data if nosql)

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
- complete the tests