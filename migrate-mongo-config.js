require('dotenv').config();

module.exports = {
    mongodb: {
        url: process.env.NODE_DB_URI
    },
    migrationsDir: 'db/migrations',
    changelogCollectionName: 'migrations_changelog',
    migrationFileExtension: '.js',
    useFileHash: false,
    moduleSystem: 'commonjs'
};
