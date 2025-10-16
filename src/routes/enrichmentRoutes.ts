import { Router, Request, Response } from 'express';
import Database from '../config/database';
import { EnrichmentService } from '../services/enrichmentService';
import { config } from '../config/env';

const router = Router();
const db = new Database(config.moviesDbPath, config.ratingsDbPath);
const enrichmentService = new EnrichmentService(db);

/**
 * POST /api/enrich
 * Trigger enrichment process for N movies
 */
router.post('/enrich', async (req: Request, res: Response) => {
  try {
    const count = parseInt(req.body.count || '75', 10);

    if (count < 1 || count > 200) {
      return res.status(400).json({
        error: 'Count must be between 1 and 200'
      });
    }

    const enrichments = await enrichmentService.enrichMovies(count);

    res.json({
      success: true,
      message: `Enriched ${enrichments.length} movies`,
      count: enrichments.length,
      sample: enrichments.slice(0, 5)
    });
  } catch (error: any) {
    console.error('Enrichment error:', error);
    res.status(500).json({
      error: 'Failed to enrich movies',
      details: error.message
    });
  }
});

/**
 * GET /api/enrichments
 * Get all enriched movies
 */
router.get('/enrichments', async (req: Request, res: Response) => {
  try {
    const enrichedMovies = await db.getEnrichedMoviesWithDetails();

    res.json({
      success: true,
      count: enrichedMovies.length,
      movies: enrichedMovies
    });
  } catch (error: any) {
    console.error('Get enrichments error:', error);
    res.status(500).json({
      error: 'Failed to retrieve enrichments',
      details: error.message
    });
  }
});

/**
 * GET /api/enrichments/:movieId
 * Get enrichment for a specific movie
 */
router.get('/enrichments/:movieId', async (req: Request, res: Response) => {
  try {
    const movieId = parseInt(req.params.movieId, 10);

    const movie = await db.getMovieById(movieId);
    if (!movie) {
      return res.status(404).json({ error: 'Movie not found' });
    }

    const enrichment = await db.getEnrichment(movieId);
    if (!enrichment) {
      return res.status(404).json({ error: 'Enrichment not found for this movie' });
    }

    res.json({
      success: true,
      movie,
      enrichment
    });
  } catch (error: any) {
    console.error('Get enrichment error:', error);
    res.status(500).json({
      error: 'Failed to retrieve enrichment',
      details: error.message
    });
  }
});

export default router;
