const TELEGRAM_USERNAME_RE = /^[A-Za-z0-9_]{5,32}$/;
const DEFAULT_SHARE_ORIGIN = "https://findly-v3-api.berrchidcity99.workers.dev";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function trustedPosterUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (
      url.protocol !== "https:" ||
      url.hostname !== "image.tmdb.org" ||
      !url.pathname.startsWith("/t/p/")
    ) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function buildMovieShareContent(
  movie,
  username,
  platform,
  shareOrigin = DEFAULT_SHARE_ORIGIN
) {
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

  const origin = new URL(shareOrigin).origin;
  const telegramUrl = "https://t.me/" + botUsername + "?start=movie_" + id + "_" + platform;
  const sharePageUrl = origin + "/share/movie/" + id + "?source=" + platform;
  const posterDownloadUrl = origin + "/share/movie/" + id + "/poster";
  const title = String(movie.title || "فيلم").trim();
  const year = movie.release_year ? " · " + movie.release_year : "";
  const rating = movie.rating == null ? "" : "⭐ التقييم: " + Number(movie.rating).toFixed(1) + "/10";
  const runtime = movie.runtime_minutes ? "⏱️ " + movie.runtime_minutes + " دقيقة" : "";
  const genres = Array.isArray(movie.genres) && movie.genres.length
    ? "🎭 التصنيف: " + movie.genres.filter(Boolean).join("، ")
    : "";
  const overview = String(movie.overview || "اكتشف تفاصيل الفيلم وملخصه على FINDLY Movies.").trim();
  const caption = [
    "🎬 " + title + year,
    rating,
    runtime,
    genres,
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
    sharePageUrl,
    posterDownloadUrl,
    caption,
    posterUrl: trustedPosterUrl(movie.poster_path),
    facebookShareUrl: platform === "facebook"
      ? "https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(sharePageUrl)
      : null
  };
}

export function renderMovieSharePage(movie, username, platform, shareOrigin) {
  const share = buildMovieShareContent(movie, username, platform, shareOrigin);
  const title = String(movie.title || "FINDLY Movies").trim();
  const year = movie.release_year ? " · " + movie.release_year : "";
  const overview = String(movie.overview || "اكتشف تفاصيل الفيلم وملخصه على FINDLY Movies.").trim();
  const mediaLabel = movie.media_type === "series" ? "مسلسل" : "فيلم";
  const runtime = movie.runtime_minutes ? "المدة: " + movie.runtime_minutes + " دقيقة" : "";
  const genres = Array.isArray(movie.genres) && movie.genres.length
    ? "التصنيف: " + movie.genres.filter(Boolean).join("، ")
    : "";
  const description = [overview, movie.rating == null ? "" : "التقييم: " + Number(movie.rating).toFixed(1) + "/10", runtime, genres].filter(Boolean).join(" | ").slice(0, 300);
  const poster = share.posterUrl;
  const posterMarkup = poster
    ? '<img class="poster" src="' + escapeHtml(poster) + '" alt="' + escapeHtml(title) + ' poster">'
    : '<div class="poster-placeholder">FINDLY MOVIES</div>';
  const ratingMarkup = movie.rating == null ? "" : '<p class="rating">⭐ ' + escapeHtml(Number(movie.rating).toFixed(1)) + '/10</p>';
  const runtimeMarkup = runtime ? '<p class="rating">' + escapeHtml(runtime) + '</p>' : "";
  const genresMarkup = genres ? '<p class="rating">' + escapeHtml(genres) + '</p>' : "";
  return '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>' + escapeHtml(title + year + " | FINDLY Movies") + '</title>' +
    '<meta name="description" content="' + escapeHtml(description) + '">' +
    '<meta property="og:type" content="website"><meta property="og:site_name" content="FINDLY Movies">' +
    '<meta property="og:title" content="' + escapeHtml(title + year) + '">' +
    '<meta property="og:description" content="' + escapeHtml(description) + '">' +
    '<meta property="og:url" content="' + escapeHtml(share.sharePageUrl) + '">' +
    (poster ? '<meta property="og:image" content="' + escapeHtml(poster) + '"><meta property="og:image:secure_url" content="' + escapeHtml(poster) + '"><meta property="og:image:alt" content="' + escapeHtml(title) + '">' : '') +
    '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="' + escapeHtml(title + year) + '"><meta name="twitter:description" content="' + escapeHtml(description) + '">' +
    (poster ? '<meta name="twitter:image" content="' + escapeHtml(poster) + '">' : '') +
    '<style>*{box-sizing:border-box}body{margin:0;background:#f1f4f8;color:#10233f;font-family:Arial,sans-serif}.wrap{max-width:760px;margin:36px auto;padding:20px}.card{display:flex;gap:22px;align-items:flex-start;background:#fff;border:1px solid #e1e7ef;border-radius:18px;padding:22px;box-shadow:0 10px 35px #10233f10}.poster{width:190px;max-width:38%;height:auto;aspect-ratio:2/3;object-fit:cover;border-radius:12px}.poster-placeholder{width:190px;max-width:38%;aspect-ratio:2/3;display:grid;place-items:center;background:#e8edf4;border-radius:12px;font-weight:800}.details{flex:1;min-width:0}h1{font-size:25px;margin:8px 0 12px}.type{color:#8b7047;font-size:12px;font-weight:700}.rating{font-weight:700;color:#8b7047}.overview{line-height:1.9;color:#52627a;white-space:pre-line}.cta{display:inline-block;margin-top:12px;padding:13px 18px;border-radius:10px;background:#12345a;color:#fff;text-decoration:none;font-weight:700}.brand{margin-top:18px;color:#8a96a8;font-size:12px}@media(max-width:520px){.wrap{margin:12px auto;padding:10px}.card{gap:14px;padding:14px}.poster,.poster-placeholder{width:118px}h1{font-size:19px}}</style></head><body><main class="wrap"><article class="card">' +
    posterMarkup + '<div class="details"><span class="type">' + escapeHtml(mediaLabel) + '</span><h1>' + escapeHtml(title + year) + '</h1>' + ratingMarkup + runtimeMarkup + genresMarkup +
    '<p class="overview">' + escapeHtml(overview) + '</p><a class="cta" href="' + escapeHtml(share.telegramUrl) + '">افتح الفيلم في FINDLY Movies على Telegram</a><p class="brand">FINDLY MOVIES · اكتشف السينما معانا</p></div></article></main></body></html>';
}
