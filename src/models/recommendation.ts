import { Movie } from "./movie";
import { MovieEnrichment } from "./movieEnrichment";

export interface Recommendation {
  movie: Movie & Partial<MovieEnrichment>;
  score: number;
  reasoning: string;
}
