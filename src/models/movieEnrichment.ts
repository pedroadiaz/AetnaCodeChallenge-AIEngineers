export interface MovieEnrichment {
  movieId: number;
  awardPotential: string;
  popularityQualityIndex: number;
  emotionalGenres: string;
  productionCompanyRollingROI: number | null;
  productionEffectivenessScore: number;
}