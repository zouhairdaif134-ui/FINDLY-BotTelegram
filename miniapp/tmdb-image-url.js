const ALLOWED_SIZES = new Set(["w92", "w154", "w185", "w342", "w500", "w780", "w1280", "original"]);

export function tmdbImageUrl(value, size = "w342") {
  if (!ALLOWED_SIZES.has(size)) return "";
  const raw = String(value || "").trim();
  if (!raw) return "";
  let pathname;
  try {
    if (raw.startsWith("https://")) {
      const parsed = new URL(raw);
      if (parsed.hostname !== "image.tmdb.org" || parsed.protocol !== "https:") return "";
      pathname = parsed.pathname;
    } else {
      if (!raw.startsWith("/") || raw.startsWith("//")) return "";
      pathname = raw;
    }
  } catch { return ""; }
  const sizedPath = pathname.match(/^\/t\/p\/(?:w\d+|original)\/(.+)$/);
  const imagePath = sizedPath ? sizedPath[1] : pathname.replace(/^\/+/, "");
  if (!imagePath || imagePath.includes("..") || imagePath.includes("\\")) return "";
  return "https://image.tmdb.org/t/p/" + size + "/" + imagePath;
}
