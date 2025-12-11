import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Linux Builder Engine API',
      version: '1.0.0',
      description: 'API for generating custom Linux OS builds with Docker and ISO output formats',
      contact: { name: 'API Support' },
      license: { name: 'ISC' },
    },
    servers: [
      { url: '/api', description: 'API server' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'API key as Bearer token',
        },
        apiKeyHeader: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key in header',
        },
      },
      schemas: {
        BuildSpec: {
          type: 'object',
          required: ['base'],
          properties: {
            base: { type: 'string', enum: ['arch', 'debian', 'ubuntu', 'alpine', 'fedora', 'opensuse', 'void', 'gentoo'] },
            packages: { type: 'object', description: 'Packages to install' },
            kernel: { type: 'object', properties: { version: { type: 'string' } } },
            init: { type: 'string', enum: ['systemd', 'openrc', 'runit', 's6'] },
          },
        },
        BuildResponse: {
          type: 'object',
          properties: {
            buildId: { type: 'string' },
            spec: { $ref: '#/components/schemas/BuildSpec' },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            details: { type: 'string' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }, { apiKeyHeader: [] }],
  },
  apis: ['./src/api/*.routes.ts'],
};

const spec = swaggerJsdoc(options);

export const setupSwagger = (app: Express) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));
  app.get('/api-docs.json', (_, res) => res.json(spec));
};
