import { Router, Request, Response } from 'express';
import Database from '../config/database';
import { RecommendationService } from '../services/recommendationService';
import { config } from '../config/env';

const router = Router();
const db = new Database(config.moviesDbPath, config.ratingsDbPath);
const recommendationService = new RecommendationService(db);

/**
 * GET /api/users/:userId/preferences
 * Analyze and return user preferences
 */
router.get('/users/:userId/preferences', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId, 10);

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const preferences = await recommendationService.analyzeUserPreferences(userId);

    res.json({
      success: true,
      preferences
    });
  } catch (error: any) {
    console.error('Get preferences error:', error);
    res.status(500).json({
      error: 'Failed to analyze user preferences',
      details: error.message
    });
  }
});

/**
 * GET /api/users/:userId/recommendations
 * Get personalized movie recommendations for a user
 */
router.get('/users/:userId/recommendations', async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const count = parseInt(req.query.count as string || '10', 10);
    const filters = req.query.filters as string | undefined;

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    if (count < 1 || count > 50) {
      return res.status(400).json({ error: 'Count must be between 1 and 50' });
    }

    const recommendations = await recommendationService.getRecommendations(
      userId,
      count,
      filters
    );

    res.json({
      success: true,
      userId,
      count: recommendations.length,
      recommendations
    });
  } catch (error: any) {
    console.error('Get recommendations error:', error);
    res.status(500).json({
      error: 'Failed to generate recommendations',
      details: error.message
    });
  }
});

/**
 * POST /api/query
 * Natural language query interface
 */
router.post('/query', async (req: Request, res: Response) => {
  try {
    const { query, userId } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query string is required' });
    }

    const result = await recommendationService.naturalLanguageQuery(
      query,
      userId ? parseInt(userId, 10) : undefined
    );

    res.json({
      success: true,
      query,
      result
    });
  } catch (error: any) {
    console.error('Query error:', error);
    res.status(500).json({
      error: 'Failed to process query',
      details: error.message
    });
  }
});

/**
 * POST /api/compare
 * Compare multiple movies
 */
router.post('/compare', async (req: Request, res: Response) => {
  try {
    const { movieIds, userId } = req.body;

    if (!Array.isArray(movieIds) || movieIds.length < 2) {
      return res.status(400).json({
        error: 'movieIds array with at least 2 movie IDs is required'
      });
    }

    const comparison = await recommendationService.compareMovies(
      movieIds,
      userId ? parseInt(userId, 10) : undefined
    );

    res.json({
      success: true,
      comparison
    });
  } catch (error: any) {
    console.error('Compare error:', error);
    res.status(500).json({
      error: 'Failed to compare movies',
      details: error.message
    });
  }
});

/**
 * GET /api/users
 * Get list of all available user IDs
 */
router.get('/users', async (req: Request, res: Response) => {
  try {
    const userIds = await db.getAllUsers();

    res.json({
      success: true,
      count: userIds.length,
      userIds: userIds.slice(0, 100) // Return first 100 for testing
    });
  } catch (error: any) {
    console.error('Get users error:', error);
    res.status(500).json({
      error: 'Failed to retrieve users',
      details: error.message
    });
  }
});

export default router;
