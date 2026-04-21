import 'dotenv/config';

const getDatabaseUri = () => {
    if (process.env.NODE_DB_URI) return process.env.NODE_DB_URI;

    const host = process.env.NODE_MONGODB_HOST ?? '127.0.0.1';
    const port = process.env.NODE_MONGODB_PORT ?? '27017';
    const databaseName = process.env.NODE_MONGODB_NAME ?? 'boilerplate-node-backend';
    return `mongodb://${host}:${port}/${databaseName}`;
};

export default {
    mongodb: {
        url: getDatabaseUri()
    },
    migrationsDir: 'db/migrations',
    changelogCollectionName: 'migrations_changelog',
    migrationFileExtension: '.ts',
    useFileHash: false,
    moduleSystem: 'esm'
};
