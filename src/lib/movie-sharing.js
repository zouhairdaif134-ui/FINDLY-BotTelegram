const TELEGRAM_USERNAME_RE = /^[A-Za-z0-9_]{5,32}$/;

export function buildMovieShareContent(movie, username, platform) {
  if (!movie || movie.status !== "active") {
    throw new Error("Only published movies can be shared");
  }
  const botUsername = String(username || "").replace(/^@/, "").trim();
  if (!TELEGRAM_USERNAME_RE.test(botUsername)) {
    throw new Error("A valid FINDLY Movies bot username is required");
  }
  if (!["facebook", "instagram"].includes(platform)) {
    throw new Error("Unsupported sharing platform");
  }
  const id = String(movie.id || "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new Error("Invalid movie identifier");
  }
  const telegramUrl = "https://t.me/" + botUsername + "?start=movie_" + id + "_" + platform;
  const title = String(movie.title || "فيلم").trim();
  const year = movie.release_year ? " · " + movie.release_year : "";
  const rating = movie.rating == null ? "" : "⭐ التقييم: " + Number(movie.rating).toFixed(1) + "/10";
  const overview = String(movie.overview || "اكتشف تفاصيل الفيلم وملخصه على FINDLY Movies.").trim();
  const caption = [
    "🎬 " + title + year,
    rating,
    "",
    overview,
    "",
    "اكتشف تفاصيل الفيلم والملخص على FINDLY Movies عبر Telegram:",
    telegramUrl,
    "",
    "#FINDLYMovies #Cinema"
  ].filter((line, index) => line !== "" || (index > 0 && index < 5)).join("\n").trim();
  return {
    platform,
    telegramUrl,
    caption,
    posterUrl: movie.poster_path || null,
    facebookShareUrl: platform === "facebook"
      ? "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(telegramUrl) + "&quote=" + encodeURIComponent(caption)
      : null
  };
}
