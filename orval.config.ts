import { defineConfig } from 'orval';

export default defineConfig({
    api: {
        input: {
            target: './openapi.yaml'
        },
        output: {
            target: './api/index.ts',
            schemas: './api/models',
            client: 'fetch',
            mode: 'single',
            override: {
                mutator: {
                    path: './src/api-mutator.ts',
                    name: 'customFetch'
                }
            }
        }
    },

    zodSchemas: {
        input: './openapi.yaml',
        output: {
            mode: 'single',
            target: './api/schemas.zod.ts',
            client: 'zod'
        }
    }
});
