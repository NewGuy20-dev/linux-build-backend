import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Linux Builder Engine API',
      version: '1.0.0',
      description: 'API for generating custom Linux OS builds',
    },
    servers: [
      {
        url: '/api',
        description: 'API server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
        },
        apiKeyHeader: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
        },
      },
    },
    security: [
      { bearerAuth: [] },
      { apiKeyHeader: [] },
    ],
  },
  apis: ['./src/api/*.routes.ts'],
};

const spec = swaggerJsdoc(options);

export const setupSwagger = (app: Express) => {
  app.use('/api-docs', ...swaggerUi.serve, swaggerUi.setup(spec));
  app.get('/api-docs.json', (_, res) => res.json(spec));
};
