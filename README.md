# Instructions
 - Create .env file using the example
 - Create database and link it using .env variables
 - Link to services using .env variables (es: email responders are a different kind of server)
 - Cron job needed to clean expired tokens in the table "tokens" (or in the users data if nosql)
 - FOUC (Flash of Unstyled Content) and minor problems are expected, will resolve (if needed) in the future.

# TODO
- Better security (csurf deprecated)
- complete the tests