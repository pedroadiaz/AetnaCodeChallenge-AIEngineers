import { Movie } from "./movie";

export interface EnrichmentInput {
  movie: Movie;
  avgRating: number;
  ratingCount: number;
  companyROI: number | null;
}