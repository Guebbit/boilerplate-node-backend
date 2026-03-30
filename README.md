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
- Complete .dev enviroment (Bruno, Mockoon, Insomnia (update))

# TODO NOW
 - api-mongoose-mongodb-2 - Check multer routes (add them)
 - 
 - ALL: check the controllers (FIRST), then the services, repositories and models to be similar