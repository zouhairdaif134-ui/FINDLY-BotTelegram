const MAX_QUERY_LENGTH = 80;
const MAX_RESULTS = 5;
const MAX_SIMILAR_CANDIDATES = 100;

export const AI_CATALOG_TOOLS = [
  {
    type: "function",
    function: {
      name: "search_catalog",
      description: "Search FINDLY's published movie and series catalog. Use this for a title the user mentions. Return only active catalog records.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string", minLength: 1, maxLength: 80 },
          media_type: { type: "string", enum: ["movie", "series"] }
        },
        required: ["query"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "recommend_catalog_titles",
      description: "Recommend published titles from FINDLY's catalog. Optionally filter by a genre or media type. Use top_rated unless the user asks for new or recent titles.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          genre: { type: "string", maxLength: 40 },
          media_type: { type: "string", enum: ["movie", "series"] },
          sort: { type: "string", enum: ["top_rated", "newest"] },
          limit: { type: "integer", minimum: 1, maximum: 5 }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "find_similar_titles",
      description: "Find published FINDLY titles similar to a movie or series by shared catalog genres. Use when the user asks for titles like, similar to, or related to a named title.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", minLength: 1, maxLength: 80 },
          media_type: { type: "string", enum: ["movie", "series"] },
          limit: { type: "integer", minimum: 1, maximum: 5 }
        },
        required: ["title"]
      }
    }
  }
];

function cleanQuery(value, maxLength = MAX_QUERY_LENGTH) {
  if (typeof value !== "string") return "";
  return value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[%_*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function safeText(value, maxLength) {
  return typeof value === "string" ? value.slice(0, maxLength) : null;
}

function normalizeTitle(row, genres = []) {
  return {
    id: row.id,
    title: safeText(row.title, 200) || "Untitled",
    original_title: safeText(row.original_title, 200),
    media_type: row.media_type,
    release_year: row.release_year || null,
    release_date: row.release_date || null,
    rating: row.rating == null ? null : Number(row.rating),
    runtime_minutes: row.runtime_minutes || null,
    overview: safeText(row.overview, 700),
    genres: genres.slice(0, 10).map((name) => String(name).slice(0, 60))
  };
}

async function attachGenres(supabase, rows) {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const { data, error } = await supabase
    .from("movie_title_genres")
    .select("title_id,movie_genres(name)")
    .in("title_id", ids)
    .limit(50);
  if (error) throw error;
  const byTitle = new Map();
  for (const relation of data || []) {
    const name = relation?.movie_genres?.name;
    if (!name) continue;
    const current = byTitle.get(relation.title_id) || [];
    if (!current.includes(name)) current.push(name);
    byTitle.set(relation.title_id, current);
  }
  return rows.map((row) => normalizeTitle(row, byTitle.get(row.id) || []));
}

function relevanceScore(row, query) {
  const needle = query.toLocaleLowerCase();
  const title = String(row.title || "").toLocaleLowerCase();
  const original = String(row.original_title || "").toLocaleLowerCase();
  if (title === needle) return 0;
  if (title.startsWith(needle)) return 1;
  if (title.includes(needle)) return 2;
  if (original === needle) return 3;
  if (original.startsWith(needle)) return 4;
  if (original.includes(needle)) return 5;
  return 6;
}

export async function searchCatalog(supabase, input = {}) {
  const query = cleanQuery(input.query);
  if (!query) return [];
  const mediaType = ["movie", "series"].includes(input.media_type) ? input.media_type : null;
  const columns = "id,title,original_title,media_type,release_year,release_date,rating,runtime_minutes,overview";
  const searches = await Promise.all(["title", "original_title"].map(async (column) => {
    let request = supabase
      .from("movie_titles")
      .select(columns)
      .eq("status", "active")
      .ilike(column, "%" + query + "%")
      .order("release_date", { ascending: false, nullsFirst: false })
      .limit(MAX_RESULTS);
    if (mediaType) request = request.eq("media_type", mediaType);
    const { data, error } = await request;
    if (error) throw error;
    return data || [];
  }));
  const unique = new Map();
  for (const row of searches.flat()) unique.set(row.id, row);
  const rows = [...unique.values()]
    .sort((a, b) =>
      relevanceScore(a, query) - relevanceScore(b, query) ||
      (Number(b.rating) || 0) - (Number(a.rating) || 0) ||
      String(b.release_date || "").localeCompare(String(a.release_date || ""))
    )
    .slice(0, MAX_RESULTS);
  return attachGenres(supabase, rows);
}

export async function recommendCatalogTitles(supabase, input = {}) {
  const limit = Number.isInteger(input.limit) ? Math.min(MAX_RESULTS, Math.max(1, input.limit)) : 5;
  const sort = input.sort === "newest" ? "newest" : "top_rated";
  const mediaType = ["movie", "series"].includes(input.media_type) ? input.media_type : null;
  let titleIds = null;
  const genre = cleanQuery(input.genre, 40);
  if (genre) {
    const { data: genres, error: genreError } = await supabase
      .from("movie_genres")
      .select("id,name")
      .ilike("name", "%" + genre + "%")
      .limit(5);
    if (genreError) throw genreError;
    if (!genres?.length) return [];
    const { data: relations, error: relationError } = await supabase
      .from("movie_title_genres")
      .select("title_id")
      .in("genre_id", genres.map((item) => item.id))
      .limit(200);
    if (relationError) throw relationError;
    titleIds = [...new Set((relations || []).map((item) => item.title_id))];
    if (!titleIds.length) return [];
  }

  const columns = "id,title,original_title,media_type,release_year,release_date,rating,runtime_minutes,overview";
  let request = supabase
    .from("movie_titles")
    .select(columns)
    .eq("status", "active");
  if (mediaType) request = request.eq("media_type", mediaType);
  if (titleIds) request = request.in("id", titleIds);
  if (sort === "newest") {
    request = request
      .order("release_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
  } else {
    request = request
      .not("rating", "is", null)
      .order("rating", { ascending: false })
      .order("release_date", { ascending: false, nullsFirst: false });
  }
  const { data, error } = await request.limit(limit);
  if (error) throw error;
  return attachGenres(supabase, data || []);
}

export async function findSimilarCatalogTitles(supabase, input = {}) {
  const titleQuery = cleanQuery(input.title);
  if (!titleQuery) return [];
  const limit = Number.isInteger(input.limit) ? Math.min(MAX_RESULTS, Math.max(1, input.limit)) : 5;
  const mediaType = ["movie", "series"].includes(input.media_type) ? input.media_type : null;
  const matches = await searchCatalog(supabase, { query: titleQuery, media_type: mediaType || undefined });
  const reference = matches[0];
  if (!reference) return [];

  const { data: referenceGenres, error: referenceGenreError } = await supabase
    .from("movie_title_genres")
    .select("genre_id")
    .eq("title_id", reference.id)
    .limit(10);
  if (referenceGenreError) throw referenceGenreError;
  const genreIds = [...new Set((referenceGenres || []).map((item) => item.genre_id).filter(Boolean))];
  if (!genreIds.length) return [];

  const { data: relations, error: relationError } = await supabase
    .from("movie_title_genres")
    .select("title_id,genre_id")
    .in("genre_id", genreIds)
    .limit(200);
  if (relationError) throw relationError;

  const overlap = new Map();
  for (const relation of relations || []) {
    if (!relation?.title_id || relation.title_id === reference.id) continue;
    overlap.set(relation.title_id, (overlap.get(relation.title_id) || 0) + 1);
  }
  const candidateIds = [...overlap.keys()]
    .sort((a, b) => (overlap.get(b) || 0) - (overlap.get(a) || 0))
    .slice(0, MAX_SIMILAR_CANDIDATES);
  if (!candidateIds.length) return [];

  let request = supabase
    .from("movie_titles")
    .select("id,title,original_title,media_type,release_year,release_date,rating,runtime_minutes,overview")
    .eq("status", "active")
    .in("id", candidateIds);
  if (mediaType) request = request.eq("media_type", mediaType);
  const { data, error } = await request.limit(MAX_SIMILAR_CANDIDATES);
  if (error) throw error;

  const ranked = (data || []).sort((a, b) =>
    (overlap.get(b.id) || 0) - (overlap.get(a.id) || 0) ||
    (Number(b.rating) || 0) - (Number(a.rating) || 0) ||
    String(b.release_date || "").localeCompare(String(a.release_date || ""))
  ).slice(0, limit);
  return attachGenres(supabase, ranked);
}

export async function executeCatalogTool(supabase, name, rawArguments) {
  let args;
  try {
    args = typeof rawArguments === "string" ? JSON.parse(rawArguments) : rawArguments;
  } catch {
    return { error: "Invalid tool arguments." };
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return { error: "Invalid tool arguments." };
  }
  try {
    if (name === "search_catalog") {
      const results = await searchCatalog(supabase, args);
      return { count: results.length, results };
    }
    if (name === "recommend_catalog_titles") {
      const results = await recommendCatalogTitles(supabase, args);
      return { count: results.length, results };
    }
    if (name === "find_similar_titles") {
      const results = await findSimilarCatalogTitles(supabase, args);
      return { count: results.length, results };
    }
    return { error: "Unsupported catalog tool." };
  } catch {
    return { error: "Catalog lookup is temporarily unavailable." };
  }
}
