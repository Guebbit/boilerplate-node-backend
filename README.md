# Instructions
- Create .env file using the example
- Create database and link it using .env variables
- Link to services using .env variables (es: email responders are a different kind of server)
- Cron job needed to clean expired tokens in the table "tokens" (or in the users data if nosql)
- FOUC and minor problems are expected, will resolve (if needed) in the future.

# Rules
- [admin scope]: defaultScope restrict to only active products. Admin can see all through unscope()

# Useful info
- https://sequelize.org/docs/v6/core-concepts/model-basics/
- https://sequelize.org/docs/v6/other-topics/typescript/
- https://sequelize.org/docs/v6/other-topics/hooks/
- https://stackoverflow.com/questions/22958683/how-to-implement-many-to-many-association-in-sequelize
- https://github.com/melardev/ApiEcomSequelizeExpress/blob/master/models/product.model.js

# TODO
- Better security (csurf deprecated)
- connect-flash sometimes not showing flash messages after redirect (SEQUELIZE ONLY)

#TODO mvc-sequelize-mysql
- update soft delete?
- better graphics