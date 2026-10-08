// When reviews may be shown (FTC 16 CFR 465): only real, verified purchase reviews, and only once there are at least
// `min` of them; below that, neither the reviews nor a rating appear anywhere.
export const verifiedReviews = (reviews = []) =>
  reviews.filter((review) => review?.verified === true && Number.isFinite(review.rating));

export function reviewsToShow(reviews, min) {
  const verified = verifiedReviews(reviews);
  return verified.length >= min ? verified : [];
}

export const averageRating = (reviews) => reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
