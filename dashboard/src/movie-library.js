const SORTERS = {
  newest: (a, b) => String(b.created_at || b.updated_at || "").localeCompare(String(a.created_at || a.updated_at || "")),
  oldest: (a, b) => String(a.created_at || a.updated_at || "").localeCompare(String(b.created_at || b.updated_at || "")),
  rating: (a, b) => (Number(b.rating) || -1) - (Number(a.rating) || -1),
  title: (a, b) => String(a.title || "").localeCompare(String(b.title || ""), undefined, { sensitivity: "base" })
};

export function filterAndSortMovies(movies, filters = {}) {
  const {
    search = "", mediaType = "all", year = "all",
    genre = "all", status = "all", sort = "newest"
  } = filters;
  const term = String(search).trim().toLocaleLowerCase();
  return (movies || [])
    .filter((item) => {
      if (mediaType !== "all" && item.media_type !== mediaType) return false;
      if (year !== "all" && String(item.release_year || "") !== String(year)) return false;
      if (genre !== "all" && !(item.genres || []).includes(genre)) return false;
      if (status !== "all" && item.status !== status) return false;
      if (term && ![item.title, item.original_title].some((value) => String(value || "").toLocaleLowerCase().includes(term))) return false;
      return true;
    })
    .sort(SORTERS[sort] || SORTERS.newest);
}

export function paginateMovies(items, requestedPage = 1, pageSize = 20) {
  const total = (items || []).length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const numericPage = Number(requestedPage);
  const page = Math.min(pageCount, Math.max(1, Number.isInteger(numericPage) ? numericPage : 1));
  const startIndex = (page - 1) * pageSize;
  const pageItems = (items || []).slice(startIndex, startIndex + pageSize);
  return {
    items: pageItems,
    page,
    pageCount,
    total,
    start: total ? startIndex + 1 : 0,
    end: startIndex + pageItems.length
  };
}

export function getMovieGenreNames(movies) {
  return [...new Set((movies || []).flatMap((item) => item.genres || []).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}
