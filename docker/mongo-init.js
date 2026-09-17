// Runs once, only against an EMPTY data directory — mongo's own convention for every *.js
// file under docker-entrypoint-initdb.d, executed via mongosh already authenticated as
// MONGO_INITDB_ROOT_*. https://hub.docker.com/_/mongo (Initializing a fresh instance)
//
// Creates a `readWrite` user scoped to this app's own database, so the application
// authenticates as it rather than as the instance's root account — a leaked connection
// string then grants only what the app could already read, never `dropDatabase` on another
// database or `admin.system.users`.
//
// First-run only, same as any docker-entrypoint-initdb.d script: changing MONGO_APP_PASSWORD
// later does not reset it on an existing volume — drop the volume, or update the password
// from `mongosh` yourself.
db = db.getSiblingDB(process.env.MONGO_INITDB_DATABASE);

db.createUser({
    user: process.env.MONGO_APP_USER,
    pwd: process.env.MONGO_APP_PASSWORD,
    roles: [{ role: 'readWrite', db: process.env.MONGO_INITDB_DATABASE }]
});
