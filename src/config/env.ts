import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  moviesDbPath: path.resolve(process.env.MOVIES_DB_PATH || './db/movies.db'),
  ratingsDbPath: path.resolve(process.env.RATINGS_DB_PATH || './db/ratings.db'),
  openaiApiKey: process.env.OPENAI_API_KEY || '',
};

// Validate required environment variables
if (!config.openaiApiKey) {
  throw new Error('OPENAI_API_KEY is required');
}
