import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';

export interface Movie {
  movieId: number;
  imdbId: string;
  title: string;
  overview: string;
  productionCompanies: string;
  releaseDate: string;
  budget: number;
  revenue: number;
  runtime: number;
  language: string;
  genres: string;
  status: string;
}

export interface Rating {
  ratingId: number;
  userId: number;
  movieId: number;
  rating: number;
  timestamp: number;
}

export interface MovieEnrichment {
  movieId: number;
  awardPotential: string;
  popularityQualityIndex: number;
  emotionalGenres: string;
  productionCompanyRollingROI: number | null;
  productionEffectivenessScore: number;
}

class Database {
  private moviesDb: sqlite3.Database;
  private ratingsDb: sqlite3.Database;

  constructor(moviesDbPath: string, ratingsDbPath: string) {
    this.moviesDb = new sqlite3.Database(moviesDbPath);
    this.ratingsDb = new sqlite3.Database(ratingsDbPath);
  }

  // Helper to promisify database operations
  private runQuery<T>(db: sqlite3.Database, query: string, params: any[] = []): Promise<T[]> {
    return new Promise((resolve, reject) => {
      db.all(query, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows as T[]);
      });
    });
  }

  private runStatement(db: sqlite3.Database, query: string, params: any[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
      db.run(query, params, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  // Movies DB queries
  async getMovies(limit?: number, offset?: number): Promise<Movie[]> {
    let query = 'SELECT * FROM movies';
    const params: any[] = [];

    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);

      if (offset) {
        query += ' OFFSET ?';
        params.push(offset);
      }
    }

    return this.runQuery<Movie>(this.moviesDb, query, params);
  }

  async getMovieById(movieId: number): Promise<Movie | null> {
    const movies = await this.runQuery<Movie>(
      this.moviesDb,
      'SELECT * FROM movies WHERE movieId = ?',
      [movieId]
    );
    return movies[0] || null;
  }

  async getMoviesByIds(movieIds: number[]): Promise<Movie[]> {
    const placeholders = movieIds.map(() => '?').join(',');
    return this.runQuery<Movie>(
      this.moviesDb,
      `SELECT * FROM movies WHERE movieId IN (${placeholders})`,
      movieIds
    );
  }

  // Ratings DB queries
  async getRatingsByUserId(userId: number): Promise<Rating[]> {
    return this.runQuery<Rating>(
      this.ratingsDb,
      'SELECT * FROM ratings WHERE userId = ? ORDER BY timestamp DESC',
      [userId]
    );
  }

  async getRatingsByMovieId(movieId: number): Promise<Rating[]> {
    return this.runQuery<Rating>(
      this.ratingsDb,
      'SELECT * FROM ratings WHERE movieId = ?',
      [movieId]
    );
  }

  async getAverageRatingForMovie(movieId: number): Promise<{ avgRating: number; count: number } | null> {
    const result = await this.runQuery<{ avgRating: number; count: number }>(
      this.ratingsDb,
      'SELECT AVG(rating) as avgRating, COUNT(*) as count FROM ratings WHERE movieId = ?',
      [movieId]
    );
    return result[0] || null;
  }

  async getAllUsers(): Promise<number[]> {
    const result = await this.runQuery<{ userId: number }>(
      this.ratingsDb,
      'SELECT DISTINCT userId FROM ratings ORDER BY userId'
    );
    return result.map(r => r.userId);
  }

  // Enrichment table operations
  async initializeEnrichmentTable(): Promise<void> {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS movie_enrichments (
        movieId INTEGER PRIMARY KEY,
        awardPotential TEXT,
        popularityQualityIndex REAL,
        emotionalGenres TEXT,
        productionCompanyRollingROI REAL,
        productionEffectivenessScore REAL
      )
    `;
    await this.runStatement(this.moviesDb, createTableQuery);
  }

  async saveEnrichment(enrichment: MovieEnrichment): Promise<void> {
    const query = `
      INSERT OR REPLACE INTO movie_enrichments
      (movieId, awardPotential, popularityQualityIndex, emotionalGenres, productionCompanyRollingROI, productionEffectivenessScore)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    await this.runStatement(this.moviesDb, query, [
      enrichment.movieId,
      enrichment.awardPotential,
      enrichment.popularityQualityIndex,
      enrichment.emotionalGenres,
      enrichment.productionCompanyRollingROI,
      enrichment.productionEffectivenessScore
    ]);
  }

  async getEnrichment(movieId: number): Promise<MovieEnrichment | null> {
    const enrichments = await this.runQuery<MovieEnrichment>(
      this.moviesDb,
      'SELECT * FROM movie_enrichments WHERE movieId = ?',
      [movieId]
    );
    return enrichments[0] || null;
  }

  async getAllEnrichments(): Promise<MovieEnrichment[]> {
    return this.runQuery<MovieEnrichment>(
      this.moviesDb,
      'SELECT * FROM movie_enrichments'
    );
  }

  async getEnrichedMoviesWithDetails(): Promise<(Movie & MovieEnrichment)[]> {
    const query = `
      SELECT m.*, e.awardPotential, e.popularityQualityIndex, e.emotionalGenres,
             e.productionCompanyRollingROI, e.productionEffectivenessScore
      FROM movies m
      INNER JOIN movie_enrichments e ON m.movieId = e.movieId
    `;
    return this.runQuery<Movie & MovieEnrichment>(this.moviesDb, query);
  }

  close(): void {
    this.moviesDb.close();
    this.ratingsDb.close();
  }
}

export default Database;
