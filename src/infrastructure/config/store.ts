/**
 * @module
 * The one place the process environment is read. Everything else asks a slice
 * (`defineConfig`), and a slice asks {@link currentEnvironment}.
 *
 * See: docs/tools/configuration.md
 */

/** A set of environment variables, as `process.env` shapes them. */
export type Environment = Readonly<Record<string, string | undefined>>;

/**
 * The environment every slice reads from right now.
 *
 * @returns the live process environment
 */
export const currentEnvironment = (): Environment => process.env;
