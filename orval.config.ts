import { defineConfig } from 'orval';

/**
 * Orval configuration: generates typed models + Zod validators from openapi.yaml.
 *
 * Full output reference: https://orval.dev/docs/reference/configuration/output
 *
 * This project only consumes generated TS types (@api/models, e.g. src/types/index.ts)
 * and Zod validators (@api/schemas.zod, e.g. src/services/auth.ts) - there's no in-repo
 * consumer of an HTTP-calling client (fetch/axios/react-query/...), so 'zod' is the only
 * client generated. `schemas` still produces the raw model interfaces regardless of
 * client choice, so a single block covers both needs.
 */
export default defineConfig({
    zodSchemas: {
        input: './openapi.yaml',
        output: {
            // How operations are split across files. One of:
            // 'single'      - everything in one file (current choice)
            // 'split'       - one file's worth of impl + a separate schemas file
            // 'tags'        - one file per OpenAPI tag
            // 'tags-split'  - a folder per tag, each further split into impl/schemas
            mode: 'single',
            target: './api/schemas.zod.ts',
            schemas: './api/models',
            // Which HTTP-client flavor to generate operation functions for. One of:
            // 'fetch' / 'axios' / 'axios-functions' - typed callers of this API -
            //     only useful if something in-repo consumes them; nothing here does
            // 'react-query' / 'vue-query' / 'svelte-query' / 'swr' / 'angular' - same, plus frontend data-fetching hooks - N/A for a backend
            // 'zod'   - schemas/types only, no call functions (current choice) - matches how this project actually uses generated api code
            // 'hono'  - generates server-side route-handler scaffolding - requires the Hono framework, not Express
            // 'mcp'   - generates an MCP server exposing these endpoints as tools for LLM agents
            client: 'zod'
        }
    }
});
