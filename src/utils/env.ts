const REQUIRED_ENV_KEYS = [
    'NODE_DB_URI',
    'NODE_ACCESS_TOKEN_SECRET',
    'NODE_REFRESH_TOKEN_SECRET'
] as const;

export const validateRequiredEnv = () => {
    const missing = REQUIRED_ENV_KEYS.filter((key) => {
        const value = process.env[key];
        return !value || value.trim() === '';
    });

    if (missing.length > 0)
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
};
