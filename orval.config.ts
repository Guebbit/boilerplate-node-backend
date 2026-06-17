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
                enumSuffix: ''
            }
        }
    }
});
