import { useEffect, useState } from "react";

const labels = {
  pending: "في الانتظار",
  processing: "قيد المعالجة",
  resolving: "جاري اختيار النتيجة",
  needs_review: "اختيار النتيجة",
  ready_for_review: "مسودة جاهزة للمراجعة",
  already_in_catalog: "موجود مسبقاً فالمكتبة",
  failed: "فشل",
  rejected: "مرفوض",
  published: "منشور"
};

export default function MovieQueueSection({ fetchApi }) {
  const [titles, setTitles] = useState("");
  const [mediaType, setMediaType] = useState("movie");\n  const [duplicateItems, setDuplicateItems] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tmdbProcessingEnabled, setTmdbProcessingEnabled] = useState(false);
  const [tmdbMode, setTmdbMode] = useState("disabled");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const [queueItems, queueStatus] = await Promise.all([
        fetchApi("/api/movies/queue"),
        fetchApi("/api/movies/queue/status")
      ]);
      setItems(queueItems);
      setTmdbProcessingEnabled(queueStatus.tmdb_processing_enabled === true);
      setTmdbMode(queueStatus.tmdb_mode || "disabled");
    } catch (err) {
      setError(err.message || "تعذر تحميل لائحة الأفلام");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function addTitles(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await fetchApi("/api/movies/queue", {
        method: "POST",
        body: JSON.stringify({ titles_text: titles, media_type: mediaType })
      });
      setDuplicateItems(result.duplicates || []);\n      setNotice(`تزادو ${result.inserted?.length || 0} عنوان. المكرر: ${result.duplicates?.length || 0}.`);
      setTitles("");
      await refresh();
    } catch (err) {
      setError(err.message || "تعذر إضافة العناوين");
    } finally {
      setSaving(false);
    }
  }

  async function action(id, name, body) {
    setError("");
    setNotice("");
    try {
      await fetchApi(`/api/movies/queue/${id}/${name}`, {
        method: "POST",
        ...(body ? { body: JSON.stringify(body) } : {})
      });
      setNotice("تحدّثت حالة العنصر.");
      await refresh();
    } catch (err) {
      setError(err.message || "تعذر تنفيذ العملية");
    }
  }

  return (
    <section className="panel movie-queue-panel">
      <header className="panel-header">
        <div>
          <h2>طابور الأفلام</h2>
          <p>أضف لائحة أفلام أو مسلسلات أو لائحة مختلطة. FINDLY يعالج عنواناً واحداً في كل ساعة ويحفظه كمسودة فقط.</p>
        </div>
        <button className="secondary-button" type="button" onClick={refresh} disabled={loading}>تحديث</button>
      </header>

      <form className="movies-card" onSubmit={addTitles}>
        <div className="movies-card-heading">
          <div><h3>إضافة عناوين</h3><p>كل سطر كيمثل فيلماً أو مسلسلاً واحداً. الحد الأقصى 100 عنوان في العملية.</p></div>
        </div>
        <div className="movies-form-grid">
          <label className="movies-field">
            <span>النوع</span>
            <select className="toolbar-select" value={mediaType} onChange={(event) => setMediaType(event.target.value)}>
              <option value="movie">أفلام</option>
              <option value="series">مسلسلات</option>\n              <option value="mixed">مختلط (MOVIE / TV)</option>
            </select>
          </label>
          <label className="movies-field movies-field-wide">
            <span>لائحة العناوين</span>
            <textarea rows={7} maxLength={20000} value={titles} onChange={(event) => setTitles(event.target.value)} placeholder={"Interstellar\nInception\nThe Dark Knight"} />
          </label>
        </div>
        <div className="movies-form-actions">
          <button className="primary-button" disabled={saving || !titles.trim()}>{saving ? "كنضيف..." : "إضافة للطابور"}</button>
        </div>
      </form>

      {!tmdbProcessingEnabled && <div className="auth-error" role="status">المعالجة التلقائية متوقفة. فعّل وضع التطوير غير التجاري أو الترخيص التجاري من إعدادات Worker.</div>}
      {tmdbMode === "noncommercial_development" && <div className="auth-success" role="status">وضع التطوير غير التجاري مفعّل. استخدم بيانات TMDB للاختبار غير التجاري فقط؛ لا تستخدم هذا الوضع عند تشغيل خدمة تجارية.</div>}
      {tmdbMode === "commercial" && <div className="auth-success" role="status">مصدر البيانات مفعّل بترخيص تجاري.</div>}
      {error && <div className="auth-error" role="alert">{error}</div>}
      {notice && <div className="auth-success" role="status">{notice}</div>}\n      {duplicateItems.length > 0 && <div className="auth-error" role="status"><strong>العناوين الموجودة مسبقاً:</strong><ul>{duplicateItems.map((item, index) => <li key={item.existing_id || index}>{item.title} — موجود باسم: {item.existing_title || item.title} ({item.media_type === "series" ? "مسلسل" : "فيلم"}) — الحالة: {labels[item.status] || item.status}</li>)}</ul></div>}

      <div className="movies-card movies-catalog-card">
        <div className="movies-catalog-toolbar">
          <div><h3>لائحة المعالجة</h3><p>المعالجة لا تعني النشر. النشر يبقى بقرار يدوي منك.</p></div>
          <strong>{items.length} عنوان</strong>
        </div>
        <div className="table-wrap movies-table-wrap">
          <table className="movies-table">
            <thead><tr><th>العنوان</th><th>النوع</th><th>الحالة</th><th>المحاولات</th><th>الإجراء</th></tr></thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.submitted_title}</strong>{item.last_error_message && <small>{item.last_error_message}</small>}</td>
                  <td>{item.media_type === "series" ? "مسلسل" : "فيلم"}</td>
                  <td><span className={"movies-status status-" + (item.status === "ready_for_review" ? "draft" : item.status)}>{labels[item.status] || item.status}</span></td>
                  <td>{item.attempt_count}</td>
                  <td>
                    <div className="movies-row-actions">
                      {item.status === "needs_review" && (item.tmdb_candidates || []).map((candidate) => (
                        <button key={candidate.tmdb_id} className="secondary-button" type="button" onClick={() => action(item.id, "resolve", { tmdb_id: candidate.tmdb_id })}>
                          اختيار: {candidate.title} {candidate.release_year ? `(${candidate.release_year})` : ""}
                        </button>
                      ))}
                      {item.status === "failed" && <button className="secondary-button" type="button" onClick={() => action(item.id, "retry")}>إعادة المحاولة</button>}
                      {["needs_review", "ready_for_review", "failed"].includes(item.status) && <button className="secondary-button" type="button" onClick={() => action(item.id, "reject")}>رفض</button>}
                      {item.status === "ready_for_review" && <small>راجع المسودة في قسم Movies</small>}
                      {["pending", "processing", "resolving", "already_in_catalog", "rejected", "published"].includes(item.status) && <small>—</small>}
                    </div>
                  </td>
                </tr>
              ))}
              {!items.length && <tr><td colSpan="5" className="movies-empty-state">{loading ? "كنحمّلو..." : "الطابور فارغ. زيد أول لائحة ديال الأفلام."}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
