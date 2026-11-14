import { tmdbImageUrl } from "/tmdb-image-url.js?v=20261114-2";
(() => {
  const tg = window.Telegram?.WebApp;
  const app = document.getElementById("app");
  const toast = document.getElementById("toast");
  const state = { titles: [], genres: [], favoriteIds: new Set(), tab: "home", query: "", genre: "", activeTitle: null, details: null, showFullPlot: false, loading: true };
  const initData = tg?.initData || "";

  if (tg) {
    tg.ready();
    tg.expand();
    try { tg.setHeaderColor("#090a0d"); tg.setBackgroundColor("#090a0d"); } catch {}
  }

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[char]));
  const poster = (title) => tmdbImageUrl(title.poster_path, "w342");
  const backdrop = (title) => tmdbImageUrl(title.backdrop_path, "w1280") || tmdbImageUrl(title.poster_path, "w500");
  const notify = (message) => {
    toast.textContent = message; toast.classList.add("show");
    clearTimeout(notify.timer); notify.timer = setTimeout(() => toast.classList.remove("show"), 2200);
  };
  async function api(endpoint, payload = {}) {
    const response = await fetch("/api/miniapp/" + endpoint, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...payload, init_data: initData })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || "تعذر الاتصال بالخدمة");
    return data;
  }
  const meta = (title) => [title.release_year || "", title.media_type === "series" ? "مسلسل" : "فيلم", title.runtime_minutes ? title.runtime_minutes + " دقيقة" : ""].filter(Boolean).join(" · ");
  function card(title) {
    const src = poster(title);
    const rating = title.rating != null ? '<span class="poster-rating">★ ' + Number(title.rating).toFixed(1) + '</span>' : "";
    return '<button class="poster-card" data-open="' + esc(title.id) + '">' +
      '<div class="poster">' + (src ? '<img loading="lazy" src="' + esc(src) + '" alt="' + esc(title.title) + '">' : '<span class="poster-fallback">' + esc(title.title) + '</span>') + rating + '</div>' +
      '<div class="poster-title">' + esc(title.title) + '</div><div class="poster-sub">' + esc(meta(title)) + '</div></button>';
  }
  function shelf(title, rows, key) {
    if (!rows?.length) return "";
    return '<section class="shelf"><div class="shelf-head"><h2>' + title + '</h2><button data-view="' + key + '">عرض الكل <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></button></div><div class="poster-row">' + rows.map(card).join("") + '</div></section>';
  }
  function hero(title) {
    if (!title) return '<section class="empty-state"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m10 9 5 3-5 3z"/></svg><strong>المكتبة قيد الإعداد</strong>لا توجد عناوين منشورة حالياً.</section>';
    const image = backdrop(title);
    return '<section class="hero" style="--hero-image:url(&quot;' + esc(image) + '&quot;)"><div class="hero-content"><div class="eyebrow">اختيار FINDLY</div><h1>' + esc(title.title) + '</h1><div class="meta"><span>' + esc(title.release_year || "") + '</span><span>' + (title.media_type === "series" ? "مسلسل" : "فيلم") + '</span>' + (title.rating != null ? '<span class="rating">★ ' + Number(title.rating).toFixed(1) + '</span>' : "") + '</div><p>' + esc(title.overview || "اكتشف تفاصيل هذا العمل السينمائي.") + '</p><div class="actions">' + (title.watch_available ? '<button class="primary-btn" data-watch="' + esc(title.id) + '"><svg viewBox="0 0 24 24"><path d="m8 5 12 7-12 7z" fill="currentColor" stroke="none"/></svg>مشاهدة</button>' : "") + '<button class="secondary-btn" data-open="' + esc(title.id) + '"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg>تفاصيل</button></div></div></section>';
  }
  function renderHome() {
    const latest = [...state.titles].sort((a,b) => String(b.release_date || b.created_at).localeCompare(String(a.release_date || a.created_at))).slice(0,12);
    const top = [...state.titles].filter(x => x.rating != null).sort((a,b) => Number(b.rating)-Number(a.rating)).slice(0,12);
    const movies = state.titles.filter(x => x.media_type === "movie").slice(0,12);
    const series = state.titles.filter(x => x.media_type === "series").slice(0,12);
    const feature = top[0] || latest[0];
    app.innerHTML = hero(feature) +
      '<div class="category-strip"><button class="chip ' + (!state.genre ? "active" : "") + '">الكل</button>' + state.genres.slice(0,18).map(g => '<button class="chip ' + (state.genre === g.slug ? "active" : "") + '" data-genre="' + esc(g.slug) + '">' + esc(g.name) + '</button>').join("") + '</div>' +
      shelf("أضيف حديثاً", latest, "latest") + shelf("الأعلى تقييماً", top, "top") + shelf("الأفلام", movies, "movie") + shelf("المسلسلات", series, "series");
  }
  function renderGrid(title, rows) {
    app.innerHTML = '<div class="page-heading"><h1>' + esc(title) + '</h1><p>' + rows.length + ' عنوان في المكتبة</p></div>' +
      (rows.length ? '<div class="catalog-grid">' + rows.map(card).join("") + '</div>' : '<div class="empty-state"><svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg><strong>' + (title === "مكتبتي" ? "قائمتك فارغة" : "لا توجد نتائج") + '</strong>جرّب اختياراً آخر أو بحثاً مختلفاً.</div>');
  }
  function renderSearch() {
    const rows = state.titles.filter(t => (t.title + " " + (t.original_title || "")).toLocaleLowerCase().includes(state.query.toLocaleLowerCase()));
    app.innerHTML = '<div class="page-heading"><h1>البحث في FINDLY</h1><p>ابحث عن فيلم أو مسلسل</p></div><div class="search-wrap"><input id="search-input" class="search-input" placeholder="ابحث عن فيلم أو مسلسل" value="' + esc(state.query) + '" autocomplete="off"></div>' +
      (state.query ? (rows.length ? '<div class="catalog-grid">' + rows.map(card).join("") + '</div>' : '<div class="empty-state"><svg viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg><strong>لا توجد نتائج</strong>جرّب عنواناً آخر.</div>') : '<div class="empty-state">ابدأ بكتابة اسم الفيلم أو المسلسل.</div>');
    const input = document.getElementById("search-input");
    input?.addEventListener("input", (event) => { state.query = event.target.value; const start = event.target.selectionStart; renderSearch(); const next = document.getElementById("search-input"); next?.focus(); next?.setSelectionRange(start,start); });
  }
  function render() {
    document.querySelectorAll(".bottom-nav button").forEach(button => button.classList.toggle("active", button.dataset.tab === state.tab));
    if (state.loading) { app.innerHTML = '<section class="loading-state"><div class="skeleton skeleton-hero"></div><div class="skeleton-heading"></div><div class="skeleton-row"><i></i><i></i><i></i><i></i></div></section>'; return; }
    if (state.activeTitle) { renderDetails(); return; }
    if (state.tab === "home") renderHome();
    else if (state.tab === "search") renderSearch();
    else if (state.tab === "movie") renderGrid("الأفلام", state.titles.filter(x => x.media_type === "movie"));
    else if (state.tab === "series") renderGrid("المسلسلات", state.titles.filter(x => x.media_type === "series"));
    else if (state.tab === "favorites") renderGrid("مكتبتي", state.titles.filter(x => state.favoriteIds.has(x.id)));
    else if (state.tab === "latest") renderGrid("أضيف حديثاً", [...state.titles].sort((a,b) => String(b.created_at).localeCompare(String(a.created_at))));
    else if (state.tab === "top") renderGrid("الأعلى تقييماً", [...state.titles].sort((a,b) => Number(b.rating || 0)-Number(a.rating || 0)));
    else if (state.tab === "genre") renderGrid("حسب التصنيف", state.titles.filter(x => (x.genres || []).includes(state.genreName)));
  }
  async function openDetails(id) {
    try { state.activeTitle = id; state.showFullPlot = false; tg?.BackButton?.show(); render(); state.details = await api("details", { title_id: id }); render(); }
    catch (error) { state.activeTitle = null; notify(error.message); render(); }
  }
  function renderDetails() {
    if (!state.details?.title) { app.innerHTML = '<section class="detail"><div class="loading-state"><div class="skeleton skeleton-hero"></div><div class="skeleton-heading"></div></div></section>'; return; }
    const t = state.details.title;
    const image = backdrop(t);
    const favorite = state.favoriteIds.has(t.id);
    const providers = (t.providers || []).map(p => '<a class="provider" href="' + esc(p.provider_url) + '" target="_blank" rel="noopener noreferrer">' + esc(p.provider) + ' · ' + esc(p.availability_type) + ' · ' + esc(p.region_code) + '</a>').join("");
    const seasons = (state.details.seasons || []).map(s => '<details class="season"><summary>' + esc(s.name || ("الموسم " + s.season_number)) + '</summary><div class="season-content">' + (s.episodes || []).map(e => '<div class="episode">' + esc("الحلقة " + e.episode_number + " — " + (e.name || "بدون عنوان")) + '</div>').join("") + '</div></details>').join("");
    app.innerHTML = '<section class="detail"><div class="detail-hero" style="background-image:url(&quot;' + esc(image) + '&quot;)"><button class="detail-close" data-close aria-label="إغلاق"><svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div><div class="detail-body">' + (poster(t) ? '<img class="detail-poster" src="' + esc(poster(t)) + '" alt="' + esc(t.title) + '">' : "") + '<div class="eyebrow">' + (t.media_type === "series" ? "FINDLY SERIES" : "FINDLY MOVIE") + '</div><h1>' + esc(t.title) + '</h1><div class="meta"><span>' + esc(meta(t)) + '</span>' + (t.rating != null ? '<span class="rating">★ ' + Number(t.rating).toFixed(1) + '/10</span>' : "") + '</div><p class="description">' + esc(t.overview || "لا يتوفر ملخص قصير لهذا العنوان حالياً.") + '</p><div class="detail-actions">' + (t.watch_url ? '<button class="primary-btn" data-watch="' + esc(t.id) + '"><svg viewBox="0 0 24 24"><path d="m8 5 12 7-12 7z" fill="currentColor" stroke="none"/></svg>مشاهدة</button>' : '<button class="secondary-btn" disabled>المشاهدة غير متاحة حالياً</button>') + '<button class="favorite-round" data-favorite="' + esc(t.id) + '" aria-label="' + (favorite ? "إزالة من قائمتي" : "إضافة إلى قائمتي") + '"><svg viewBox="0 0 24 24"><path d="M20.8 8.7c0 5.1-8.8 11-8.8 11s-8.8-5.9-8.8-11A4.7 4.7 0 0 1 12 6.1a4.7 4.7 0 0 1 8.8 2.6Z" ' + (favorite ? 'fill="currentColor"' : '') + '/></svg></button></div>' +
      (t.has_full_plot_summary ? '<section class="detail-section"><button class="plot-toggle" data-plot>' + (state.showFullPlot ? "أقل" : "المزيد") + (state.showFullPlot ? " −" : " +") + '</button>' + (t.full_plot_summary ? '<p id="full-plot" class="description" ' + (state.showFullPlot ? '' : 'hidden') + '>' + esc(t.full_plot_summary) + '</p>' : '') + '</section>' : "") +
      (t.genres?.length ? '<section class="detail-section"><h3>التصنيفات</h3><div class="meta">' + t.genres.map(esc).join(" · ") + '</div></section>' : "") +
      (seasons ? '<section class="detail-section"><h3>المواسم والحلقات</h3>' + seasons + '</section>' : "") +
      (providers ? '<section class="detail-section"><h3>مصادر المشاهدة المتاحة</h3>' + providers + '</section>' : "") + '</div></section>';
  }
  async function toggleFavorite(id) {
    const add = !state.favoriteIds.has(id);
    try { await api("favorite", { title_id: id, action: add ? "add" : "remove" }); if (add) state.favoriteIds.add(id); else state.favoriteIds.delete(id); if (state.details?.title?.id === id) state.details.title.is_favorite = add; notify(add ? "تمت الإضافة إلى مكتبتي" : "تمت الإزالة من مكتبتي"); render(); }
    catch (error) { notify(error.message); }
  }
  function goTab(tab) { state.activeTitle = null; state.details = null; state.showFullPlot = false; tg?.BackButton?.hide(); state.tab = tab; render(); }
  app.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.open) return openDetails(button.dataset.open);
    if (button.dataset.watch) { const title = state.details?.title; const url = title?.watch_url || state.titles.find(t => t.id === button.dataset.watch)?.watch_url; if (url) tg?.openTelegramLink ? tg.openTelegramLink(url) : window.open(url, "_blank", "noopener"); else return openDetails(button.dataset.watch); return; }
    if (button.dataset.favorite) return toggleFavorite(button.dataset.favorite);
    if (button.dataset.close !== undefined) { state.activeTitle = null; state.details = null; state.showFullPlot = false; tg?.BackButton?.hide(); render(); return; }
    if (button.dataset.plot !== undefined) {
      if (!state.details?.title?.full_plot_summary) {
        try {
          state.details = await api("details", { title_id: state.activeTitle, include_full_plot: true });
          state.showFullPlot = true;
          render();
        } catch (error) { notify(error.message); }
      } else {
        state.showFullPlot = !state.showFullPlot;
        render();
      }
      return;
    }
    if (button.dataset.view) return goTab(button.dataset.view);
    if (button.dataset.genre) { state.genre = button.dataset.genre; state.genreName = state.genres.find(g => g.slug === state.genre)?.name || ""; state.tab = "genre"; render(); return; }
  });
  document.querySelector(".bottom-nav").addEventListener("click", event => { const button = event.target.closest("button[data-tab]"); if (button) goTab(button.dataset.tab); });
  document.getElementById("search-open").addEventListener("click", () => { state.tab = "search"; render(); document.getElementById("search-input")?.focus(); });

  async function start() {
    if (!initData) {
      state.loading = false;
      app.innerHTML = '<section class="error-state"><strong>افتح مكتبة FINDLY من Telegram</strong>هاد الصفحة كتحتاج جلسة Telegram موثّقة. رجع لبوت FINDLY واضغط على زر فتح المكتبة.</section>';
      document.querySelector(".bottom-nav").hidden = true;
      return;
    }
    try {
      const data = await api("catalog");
      state.titles = data.titles || [];
      state.genres = data.genres || [];
      state.favoriteIds = new Set(data.favorite_ids || []);
      state.loading = false;
      render();
    } catch (error) {
      state.loading = false;
      app.innerHTML = '<section class="error-state"><strong>تعذر فتح المكتبة</strong>' + esc(error.message) + '<p>سدّ النافذة وعاود فتح FINDLY من Telegram.</p></section>';
    }
  }
  if (tg?.BackButton) {
    tg.BackButton.onClick(() => { if (state.activeTitle) { state.activeTitle = null; state.details = null; state.showFullPlot = false; render(); tg.BackButton.hide(); } else { goTab("home"); } });
  }
  start();
})();
