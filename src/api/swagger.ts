import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Linux Builder API',
      version: '1.0.0',
      description: 'API for building custom Linux images',
    },
    servers: [{ url: '/api' }],
    components: {
      securitySchemes: {
        ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'x-api-key' },
      },
    },
    security: [{ ApiKeyAuth: [] }],
  },
  apis: ['./src/api/*.routes.ts'],
};

const spec = swaggerJsdoc(options);

export const setupSwagger = (app: Express) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(spec));
  app.get('/api-docs.json', (_, res) => res.json(spec));
};
