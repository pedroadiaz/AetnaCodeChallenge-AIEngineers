import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { config } from './config/env';
import enrichmentRoutes from './routes/enrichmentRoutes';
import recommendationRoutes from './routes/recommendationRoutes';

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api', enrichmentRoutes);
app.use('/api', recommendationRoutes);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Movie Recommendation System API',
    version: '1.0.0',
    endpoints: {
      enrichment: {
        'POST /api/enrich': 'Enrich movies with LLM-generated attributes',
        'GET /api/enrichments': 'Get all enriched movies',
        'GET /api/enrichments/:movieId': 'Get enrichment for specific movie'
      },
      recommendations: {
        'GET /api/users': 'Get list of available user IDs',
        'GET /api/users/:userId/preferences': 'Analyze user preferences',
        'GET /api/users/:userId/recommendations': 'Get personalized recommendations',
        'POST /api/query': 'Natural language query (body: { query: string, userId?: number })',
        'POST /api/compare': 'Compare movies (body: { movieIds: number[], userId?: number })'
      }
    },
    documentation: 'See README.md for detailed API documentation and examples'
  });
});

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Error handling
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    details: err.message
  });
});

// Start server
app.listen(config.port, () => {
  console.log('\n=================================');
  console.log('Movie Recommendation System API');
  console.log('=================================');
  console.log(`Server running on http://localhost:${config.port}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  GET  http://localhost:${config.port}/`);
  console.log(`  GET  http://localhost:${config.port}/health`);
  console.log(`\nEnrichment:`);
  console.log(`  POST http://localhost:${config.port}/api/enrich`);
  console.log(`  GET  http://localhost:${config.port}/api/enrichments`);
  console.log(`\nRecommendations:`);
  console.log(`  GET  http://localhost:${config.port}/api/users`);
  console.log(`  GET  http://localhost:${config.port}/api/users/:userId/preferences`);
  console.log(`  GET  http://localhost:${config.port}/api/users/:userId/recommendations`);
  console.log(`  POST http://localhost:${config.port}/api/query`);
  console.log(`  POST http://localhost:${config.port}/api/compare`);
  console.log('\n=================================\n');
});

export default app;
