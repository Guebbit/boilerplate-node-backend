import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

export default withMermaid(
    defineConfig({
        title: 'Boilerplate Node Backend',
        description: 'ADHD-friendly docs for the Express + MongoDB + Mongoose REST boilerplate',
        themeConfig: {
            nav: [
                { text: 'Home', link: '/' },
                { text: 'Theory', link: '/theory/' },
                { text: 'Tools', link: '/tools/' },
                { text: 'API', link: '/api/' }
            ],
            sidebar: {
                '/theory/': [
                    {
                        text: 'Theory',
                        items: [
                            { text: 'Overview', link: '/theory/' },
                            { text: 'Architecture', link: '/theory/architecture' },
                            { text: 'Layers', link: '/theory/layers' },
                            { text: 'Request Flow', link: '/theory/request-flow' }
                        ]
                    }
                ],
                '/tools/': [
                    {
                        text: 'Tools',
                        items: [
                            { text: 'Overview', link: '/tools/' },
                            { text: 'Runtime', link: '/tools/runtime' },
                            { text: 'Security', link: '/tools/security' },
                            { text: 'MongoDB & Mongoose', link: '/tools/mongodb-mongoose' },
                            { text: 'Redis Cache', link: '/tools/redis-cache' },
                            { text: 'Winston & Audit Logs', link: '/tools/winston' },
                            { text: 'Prometheus', link: '/tools/prometheus' },
                            { text: 'OpenTelemetry', link: '/tools/opentelemetry' },
                            { text: 'Grafana', link: '/tools/grafana' },
                            { text: 'PostHog', link: '/tools/posthog' },
                            { text: 'Testing & Docs', link: '/tools/testing-and-docs' }
                        ]
                    }
                ],
                '/api/': [
                    {
                        text: 'API',
                        items: [
                            { text: 'Overview', link: '/api/' },
                            { text: 'OpenAPI Workflow', link: '/api/openapi-workflow' },
                            { text: 'REST Style', link: '/api/rest-style' }
                        ]
                    }
                ]
            },
            socialLinks: [
                {
                    icon: 'github',
                    link: 'https://github.com/Guebbit/boilerplate-node-backend'
                }
            ]
        },
        mermaid: {
            theme: 'neutral',
            useMaxWidth: true,
            htmlLabels: true,
            themeVariables: {
                primaryColor: '#ede9fe',
                primaryBorderColor: '#7c3aed',
                primaryTextColor: '#111827',
                secondaryColor: '#dbeafe',
                tertiaryColor: '#f8fafc',
                lineColor: '#64748b'
            }
        }
    })
);
