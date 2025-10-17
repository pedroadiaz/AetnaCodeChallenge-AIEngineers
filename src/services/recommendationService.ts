import openai from '../config/openai';
import Database from '../config/database';
import { UserPreferences } from '../models/userPreferences';
import { Recommendation } from '../models/recommendation';

export class RecommendationService {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  /**
   * Analyze a user's preferences based on their rating history
   */
  async analyzeUserPreferences(userId: number): Promise<UserPreferences> {
    console.log(`Analyzing preferences for user ${userId}`);

    // Get user's ratings
    const ratings = await this.db.getRatingsByUserId(userId);

    if (ratings.length === 0) {
      throw new Error(`User ${userId} has no ratings`);
    }

    // Get movies for rated items
    const movieIds = ratings.map(r => r.movieId);
    const movies = await this.db.getMoviesByIds(movieIds);

    // Build context for LLM
    const ratedMoviesContext = ratings
      .slice(0, 20) // Use top 20 for context
      .map(rating => {
        const movie = movies.find(m => m.movieId === rating.movieId);
        return movie ? {
          title: movie.title,
          genres: movie.genres,
          overview: movie.overview,
          rating: rating.rating,
          budget: movie.budget,
          revenue: movie.revenue
        } : null;
      })
      .filter(m => m !== null);

    // Calculate basic stats
    const avgRating = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;

    // Use LLM to analyze preferences
    const prompt = `Analyze this user's movie preferences based on their rating history:

User has rated ${ratings.length} movies with an average rating of ${avgRating.toFixed(2)}/5.0

Sample of rated movies (showing rating and details):
${JSON.stringify(ratedMoviesContext, null, 2)}

Please provide a comprehensive analysis including:
1. Favorite genres (top 3-5)
2. Preferred emotional tones (e.g., "emotional, fast-paced, dark")
3. Budget preference (High-budget blockbusters, Mid-budget, Indie/Low-budget, or Mixed)
4. A brief summary (2-3 sentences) of this user's taste in movies

Respond ONLY with valid JSON in this exact format:
{
  "favoriteGenres": ["genre1", "genre2", "genre3"],
  "preferredEmotionalTones": ["tone1", "tone2"],
  "budgetPreference": "High-budget|Mid-budget|Indie|Mixed",
  "summary": "2-3 sentence summary of user's preferences"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert at analyzing movie preferences and user behavior. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 800
    });

    const content = response.choices[0].message.content?.trim() || '{}';

    try {
      const parsed = JSON.parse(content);
      return {
        userId,
        favoriteGenres: parsed.favoriteGenres || [],
        averageRating: avgRating,
        preferredEmotionalTones: parsed.preferredEmotionalTones || [],
        budgetPreference: parsed.budgetPreference || 'Mixed',
        summary: parsed.summary || 'User preferences could not be determined'
      };
    } catch (error) {
      console.error('Error parsing LLM response:', content);
      throw new Error('Failed to analyze user preferences');
    }
  }

  /**
   * Generate personalized movie recommendations
   */
  async getRecommendations(
    userId: number,
    count: number = 10,
    filters?: string
  ): Promise<Recommendation[]> {
    console.log(`Generating ${count} recommendations for user ${userId}`);

    // Get user preferences
    const preferences = await this.analyzeUserPreferences(userId);

    // Get user's already-rated movies to exclude them
    const userRatings = await this.db.getRatingsByUserId(userId);
    const ratedMovieIds = new Set(userRatings.map(r => r.movieId));

    // Get enriched movies
    const enrichedMovies = await this.db.getEnrichedMoviesWithDetails();

    // Filter out already-rated movies
    const candidateMovies = enrichedMovies.filter(m => !ratedMovieIds.has(m.movieId));

    if (candidateMovies.length === 0) {
      throw new Error('No unrated movies available for recommendations');
    }

    // Use LLM to rank and select recommendations
    const prompt = `Generate ${count} personalized movie recommendations for a user with these preferences:

User Preferences:
${JSON.stringify(preferences, null, 2)}

Additional Filters: ${filters || 'None'}

Available Movies (showing enriched data):
${JSON.stringify(candidateMovies.slice(0, 50).map(m => ({
  movieId: m.movieId,
  title: m.title,
  genres: m.genres,
  overview: m.overview?.substring(0, 150),
  budget: m.budget,
  revenue: m.revenue,
  awardPotential: m.awardPotential,
  emotionalGenres: m.emotionalGenres,
  popularityQualityIndex: m.popularityQualityIndex,
  productionEffectivenessScore: m.productionEffectivenessScore
})), null, 2)}

Select ${count} movies that best match the user's preferences. Consider:
- Genre alignment
- Emotional tone match
- Budget preferences
- Award potential if user rates highly-rated films
- Production effectiveness and quality

Respond ONLY with valid JSON array of recommended movie IDs and reasoning:
[
  {
    "movieId": 123,
    "score": 95,
    "reasoning": "Brief explanation why this matches user preferences"
  }
]`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert movie recommendation system. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.5,
      max_tokens: 1500
    });

    const content = response.choices[0].message.content || '[]';

    try {
      const parsed = JSON.parse(content) as  { recommendations: Recommendation[] } ;

      const recommendations: Recommendation[] = [];
      parsed.recommendations.slice(0, count).forEach((rec: any) => {
        const movie = candidateMovies.find(m => m.movieId === rec.movieId);
        if (movie) {
          recommendations.push({
            movie,
            score: rec.score || 0,
            reasoning: rec.reasoning || 'Recommended based on your preferences'
          });
        }
      });

      return recommendations;
    } catch (error) {
      throw new Error('Failed to generate recommendations');
    }
  }

  /**
   * Natural language query interface
   */
  async naturalLanguageQuery(query: string, userId?: number): Promise<any> {
    console.log(`Processing natural language query: "${query}"`);

    // Get enriched movies for context
    const enrichedMovies = await this.db.getEnrichedMoviesWithDetails();

    // If userId provided, get their preferences
    let userContext = '';
    if (userId) {
      try {
        const preferences = await this.analyzeUserPreferences(userId);
        userContext = `\n\nUser Context (User ID: ${userId}):\n${JSON.stringify(preferences, null, 2)}`;
      } catch (error) {
        // Continue without user context
      }
    }

    const prompt = `You are a movie database assistant. Answer the following query using the available movie data.

Query: "${query}"
${userContext}

Available Movies Database (showing enriched attributes):
${JSON.stringify(enrichedMovies.slice(0, 100).map(m => ({
  movieId: m.movieId,
  title: m.title,
  genres: m.genres,
  overview: m.overview?.substring(0, 100),
  budget: m.budget,
  revenue: m.revenue,
  runtime: m.runtime,
  releaseDate: m.releaseDate,
  awardPotential: m.awardPotential,
  emotionalGenres: m.emotionalGenres,
  popularityQualityIndex: m.popularityQualityIndex,
  productionCompanyRollingROI: m.productionCompanyRollingROI,
  productionEffectivenessScore: m.productionEffectivenessScore
})), null, 2)}

Provide a helpful, detailed response to the query. You can:
- Recommend specific movies
- Compare movies
- Provide statistics or insights
- Answer questions about genres, budgets, etc.

Format your response in a clear, user-friendly way. You can return JSON or plain text, whichever is more appropriate for the query.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful movie database assistant. Provide clear, informative responses to user queries about movies.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 1500
    });

    const content = response.choices[0].message.content?.trim() || '';

    // Try to parse as JSON, otherwise return as text
    try {
      return JSON.parse(content);
    } catch {
      return { response: content };
    }
  }

  /**
   * Compare multiple movies
   */
  async compareMovies(movieIds: number[], userId?: number): Promise<any> {
    console.log(`Comparing movies: ${movieIds.join(', ')}`);

    if (movieIds.length < 2) {
      throw new Error('At least 2 movies are required for comparison');
    }

    // Get movies with enrichments
    const enrichedMovies = await this.db.getEnrichedMoviesWithDetails();
    const movies = enrichedMovies.filter(m => movieIds.includes(m.movieId));

    if (movies.length !== movieIds.length) {
      throw new Error('Some movies not found or not enriched');
    }

    // Get user context if provided
    let userContext = '';
    if (userId) {
      try {
        const preferences = await this.analyzeUserPreferences(userId);
        userContext = `\n\nUser Preferences (for personalized comparison):\n${JSON.stringify(preferences, null, 2)}`;
      } catch (error) {
        // Continue without user context
      }
    }

    const prompt = `Compare these movies in detail:

Movies to Compare:
${JSON.stringify(movies.map(m => ({
  movieId: m.movieId,
  title: m.title,
  genres: m.genres,
  overview: m.overview,
  budget: m.budget,
  revenue: m.revenue,
  runtime: m.runtime,
  releaseDate: m.releaseDate,
  awardPotential: m.awardPotential,
  emotionalGenres: m.emotionalGenres,
  popularityQualityIndex: m.popularityQualityIndex,
  productionCompanyRollingROI: m.productionCompanyRollingROI,
  productionEffectivenessScore: m.productionEffectivenessScore
})), null, 2)}
${userContext}

Provide a comprehensive comparison including:
1. Overview of each movie
2. Key similarities and differences
3. Budget and revenue comparison
4. Award potential comparison
5. Emotional tone differences
6. Which movie might appeal to different types of viewers
${userId ? '7. Which movie would best suit this specific user based on their preferences' : ''}

Respond with a detailed, structured comparison in JSON format:
{
  "summary": "Brief overall comparison",
  "movies": [
    {
      "movieId": 123,
      "title": "Movie Title",
      "strengths": ["strength1", "strength2"],
      "bestFor": "Type of viewer who would enjoy this"
    }
  ],
  "recommendation": "If user context provided, which movie to choose and why"
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert film critic and analyst. Provide detailed, insightful movie comparisons. Always respond with valid JSON.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.4,
      max_tokens: 2000
    });

    const content = response.choices[0].message.content?.trim() || '{}';

    try {
      return JSON.parse(content);
    } catch (error) {
      console.error('Error parsing LLM response:', content);
      throw new Error('Failed to compare movies');
    }
  }
}
