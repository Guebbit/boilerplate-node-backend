# WARNING: The MVC version is flawed because the true focus is in the restAPI versions

# Instructions

- Create .env file using the example
- Create database and link it using .env variables
- Link to services using .env variables (es: email responders are a different kind of server)
- Optional: use docker/podman to run the app
- IMPORTANT: Remove the controllers/_development and routes/_development

# Mock instructions

- Use the openapi.yaml on Bruno to create a mock FE that consume the API, this will be useful for testing the API
    - left sidebar -> + -> import collection
    - Change enviroments variable "baseUrl" to httop://localhost:3001 (mockoon default)
    - Top right -> no enviroment to "local"
- Use the openapi.yaml on Mockooon to create a mock API that return fake data
    - Top menu -> import/export -> Import Swagger V2

# TODO
- Add products quantity to conrollers/products/page-all-products.ts
- Complete .dev enviroment (Bruno, Mockoon, Insomnia (update))
- Create a mysql sequelize version

# TODO NOW
- ALL: check the controllers (FIRST), then the services, repositories and models to be similar 
  - MVC VS API - Mancano:
    - AAAAAAAAAAAAAAAAAAA