import openai from '../config/openai';
import Database, { Movie, MovieEnrichment } from '../config/database';

interface EnrichmentInput {
  movie: Movie;
  avgRating: number;
  ratingCount: number;
  companyROI: number | null;
}

export class EnrichmentService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Main method to enrich a batch of movies
   */
  async enrichMovies(movieCount: number = 75): Promise<MovieEnrichment[]> {
    console.log(`Starting enrichment process for ${movieCount} movies...`);

    // Get movies that have ratings
    const movies = await this.selectMoviesWithRatings(movieCount);
    console.log(`Selected ${movies.length} movies with ratings`);

    // Initialize enrichment table
    await this.db.initializeEnrichmentTable();

    const enrichments: MovieEnrichment[] = [];

    for (let i = 0; i < movies.length; i++) {
      const movie = movies[i];
      console.log(`\nEnriching ${i + 1}/${movies.length}: ${movie.title} (${movie.movieId})`);

      try {
        const enrichment = await this.enrichSingleMovie(movie);
        await this.db.saveEnrichment(enrichment);
        enrichments.push(enrichment);
        console.log(`✓ Completed: ${movie.title}`);

        // Add small delay to avoid rate limiting
        if (i < movies.length - 1) {
          await this.delay(500);
        }
      } catch (error) {
        console.error(`✗ Error enriching ${movie.title}:`, error);
      }
    }

    console.log(`\nEnrichment complete! Processed ${enrichments.length} movies`);
    return enrichments;
  }

  /**
   * Select movies that have ratings (to ensure we can compute popularity metrics)
   */
  private async selectMoviesWithRatings(limit: number): Promise<Movie[]> {
    // Get movies with ratings, prioritize diverse selection
    const movies = await this.db.getMovies();
    const moviesWithRatings: Movie[] = [];

    for (const movie of movies) {
      if (moviesWithRatings.length >= limit) break;

      const ratingStats = await this.db.getAverageRatingForMovie(movie.movieId);
      if (ratingStats && ratingStats.count > 0) {
        moviesWithRatings.push(movie);
      }
    }

    return moviesWithRatings;
  }

  /**
   * Enrich a single movie with all 5 attributes
   */
  private async enrichSingleMovie(movie: Movie): Promise<MovieEnrichment> {
    // Get rating statistics
    const ratingStats = await this.db.getAverageRatingForMovie(movie.movieId);
    const avgRating = ratingStats?.avgRating || 0;
    const ratingCount = ratingStats?.count || 0;

    // Calculate production company rolling ROI
    const companyROI = await this.calculateCompanyROI(movie);

    const input: EnrichmentInput = {
      movie,
      avgRating,
      ratingCount,
      companyROI
    };

    // Use LLM to generate enrichments
    const llmEnrichments = await this.getLLMEnrichments(input);

    // Calculate production effectiveness score (formula-based)
    const productionEffectivenessScore = this.calculateProductionEffectiveness(
      movie,
      avgRating
    );

    return {
      movieId: movie.movieId,
      awardPotential: llmEnrichments.awardPotential,
      popularityQualityIndex: llmEnrichments.popularityQualityIndex,
      emotionalGenres: llmEnrichments.emotionalGenres,
      productionCompanyRollingROI: companyROI,
      productionEffectivenessScore
    };
  }

  /**
   * Use OpenAI to generate Award Potential, Popularity-Quality Index, and Emotional Genres
   */
  private async getLLMEnrichments(input: EnrichmentInput): Promise<{
    awardPotential: string;
    popularityQualityIndex: number;
    emotionalGenres: string;
  }> {
    const { movie, avgRating, ratingCount } = input;

    const prompt = `Analyze the following movie and provide three specific attributes:

Movie Information:
- Title: ${movie.title}
- Overview: ${movie.overview}
- Runtime: ${movie.runtime} minutes
- Budget: $${movie.budget.toLocaleString()}
- Revenue: $${movie.revenue.toLocaleString()}
- Release Date: ${movie.releaseDate}
- Genres: ${movie.genres}
- Average Rating: ${avgRating.toFixed(2)}/5.0
- Number of Ratings: ${ratingCount}

Please provide the following analyses:

1. **Award Potential** (Category: High/Medium/Low)
   - Consider: Does the overview sound like "award-bait" (prestige, critical tone)?
   - Runtime factor: Longer dramas (>120min) often correlate with awards
   - Budget/Revenue ratio: Modest budget with acclaim suggests prestige
   - Year-normalized rating quality

2. **Popularity-Quality Index** (Numeric score 0-100)
   - Combine rating count × average rating (weighted)
   - Sentiment of overview (emotional appeal)
   - Correlation with revenue (does popularity translate to box office?)

3. **Emotional Genre Classification** (Multiple categories allowed)
   - Classify into nuanced emotional categories beyond standard genres
   - Options: fast-paced, emotional, spectacle, contemplative, intense, uplifting, dark, whimsical, gritty, romantic
   - Provide 1-3 categories that best describe the movie's emotional tone

Respond ONLY with valid JSON in this exact format (no markdown, no extra text):
{
  "awardPotential": "High|Medium|Low",
  "popularityQualityIndex": 0-100,
  "emotionalGenres": "category1, category2"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a film industry analyst expert at evaluating movies for awards, popularity, and emotional resonance. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 500
    });

    const content = response.choices[0].message.content?.trim() || '{}';

    try {
      const parsed = JSON.parse(content);
      return {
        awardPotential: parsed.awardPotential || 'Medium',
        popularityQualityIndex: parsed.popularityQualityIndex || 50,
        emotionalGenres: parsed.emotionalGenres || 'emotional'
      };
    } catch (error) {
      console.error('Error parsing LLM response:', content);
      return {
        awardPotential: 'Medium',
        popularityQualityIndex: 50,
        emotionalGenres: 'emotional'
      };
    }
  }

  /**
   * Calculate rolling ROI for the movie's production company
   */
  private async calculateCompanyROI(movie: Movie): Promise<number | null> {
    if (!movie.productionCompanies || movie.productionCompanies.trim() === '') {
      return null;
    }

    // Parse production companies (stored as JSON array)
    let companies: string[] = [];
    try {
      const parsed = JSON.parse(movie.productionCompanies);
      companies = parsed.map((c: any) => c.name || '').filter((n: string) => n !== '');
    } catch {
      return null;
    }

    if (companies.length === 0) return null;

    // Use the first production company
    const primaryCompany = companies[0];

    // Get all movies from this company, ordered by release date
    const allMovies = await this.db.getMovies();
    const companyMovies = allMovies.filter(m => {
      try {
        const mCompanies = JSON.parse(m.productionCompanies || '[]');
        return mCompanies.some((c: any) => c.name === primaryCompany);
      } catch {
        return false;
      }
    })
    .filter(m => m.releaseDate && m.releaseDate < movie.releaseDate)
    .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));

    // Take last 5-10 movies before this one
    const previousMovies = companyMovies.slice(-10);

    if (previousMovies.length === 0) return null;

    // Calculate average ROI
    let totalROI = 0;
    let validCount = 0;

    for (const m of previousMovies) {
      if (m.budget > 0 && m.revenue > 0) {
        const roi = ((m.revenue - m.budget) / m.budget) * 100;
        totalROI += roi;
        validCount++;
      }
    }

    return validCount > 0 ? totalROI / validCount : null;
  }

  /**
   * Calculate Production Effectiveness Score
   * Combines rating, budget efficiency, and revenue performance
   */
  private calculateProductionEffectiveness(movie: Movie, avgRating: number): number {
    // Normalize components to 0-100 scale
    const ratingScore = (avgRating / 5.0) * 100; // Rating out of 5

    // ROI score (capped at reasonable values)
    let roiScore = 0;
    if (movie.budget > 0 && movie.revenue > 0) {
      const roi = ((movie.revenue - movie.budget) / movie.budget) * 100;
      roiScore = Math.min(100, Math.max(0, (roi + 50) / 2)); // Normalize around 0-100
    }

    // Revenue tier score (log scale for fairness)
    let revenueScore = 0;
    if (movie.revenue > 0) {
      revenueScore = Math.min(100, (Math.log10(movie.revenue) / 9) * 100); // 10^9 = 1B
    }

    // Weighted average
    const weights = {
      rating: 0.4,
      roi: 0.35,
      revenue: 0.25
    };

    return Number((
      ratingScore * weights.rating +
      roiScore * weights.roi +
      revenueScore * weights.revenue
    ).toFixed(2));
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
