import Database from '../config/database';
import { EnrichmentService } from '../services/enrichmentService';
import { config } from '../config/env';

async function main() {
  console.log('=== Movie Enrichment Script ===\n');

  // Initialize database
  const db = new Database(config.moviesDbPath, config.ratingsDbPath);

  try {
    // Create enrichment service
    const enrichmentService = new EnrichmentService(db);

    // Enrich 75 movies (between 50-100 as specified)
    const enrichments = await enrichmentService.enrichMovies(75);

    console.log('\n=== Enrichment Summary ===');
    console.log(`Total movies enriched: ${enrichments.length}`);

    // Show sample results
    console.log('\n=== Sample Results (first 3) ===');
    const sampleMovies = await db.getEnrichedMoviesWithDetails();

    for (let i = 0; i < Math.min(3, sampleMovies.length); i++) {
      const m = sampleMovies[i];
      console.log(`\n${i + 1}. ${m.title} (${m.movieId})`);
      console.log(`   Award Potential: ${m.awardPotential}`);
      console.log(`   Popularity-Quality Index: ${m.popularityQualityIndex}`);
      console.log(`   Emotional Genres: ${m.emotionalGenres}`);
      console.log(`   Company Rolling ROI: ${m.productionCompanyRollingROI?.toFixed(2) || 'N/A'}%`);
      console.log(`   Production Effectiveness: ${m.productionEffectivenessScore.toFixed(2)}`);
    }

    console.log('\n✓ Enrichment complete! Data saved to movie_enrichments table.');
  } catch (error) {
    console.error('Error during enrichment:', error);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
