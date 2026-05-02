const REQUIRED_ENV_KEYS = [
    'NODE_ACCESS_TOKEN_SECRET',
    'NODE_REFRESH_TOKEN_SECRET'
] as const;

/**
 * Fail fast on missing mandatory configuration so runtime errors do not appear only after serving traffic.
 */
export const validateRequiredEnvironment = () => {
    const missing = REQUIRED_ENV_KEYS.filter((key) => {
        const value = process.env[key];
        return !value || value.trim() === '';
    });

    if (missing.length > 0)
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);

    const hasMongoUri = Boolean(process.env.NODE_DB_URI?.trim());
    const hasMongoPort = Boolean(process.env.NODE_MONGODB_PORT?.trim());

    if (!hasMongoUri && !hasMongoPort)
        throw new Error('Missing database configuration: set NODE_DB_URI or NODE_MONGODB_PORT');
};
