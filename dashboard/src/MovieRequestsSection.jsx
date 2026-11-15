import { useEffect, useState } from "react";

const statusLabels = {
  pending: "جديد",
  reviewing: "قيد المراجعة",
  approved: "مقبول",
  added: "تمت الإضافة",
  rejected: "مرفوض"
};
const statusOptions = ["pending", "reviewing", "approved", "added", "rejected"];

export default function MovieRequestsSection({ fetchApi, onPendingCountChange }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingCount, setPendingCount] = useState(0);

  async function refresh(nextFilter = filter) {
    setLoading(true);
    setError("");
    try {
      const data = await fetchApi("/api/movie-requests?status=" + encodeURIComponent(nextFilter));
      setItems(data.items || []);
      setPendingCount(Number(data.pending_count || 0));
      onPendingCountChange?.(Number(data.pending_count || 0));
    } catch (err) {
      setError(err.message || "تعذر تحميل طلبات المستخدمين");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh("all"); }, []);

  async function updateStatus(item, status) {
    if (savingId) return;
    setSavingId(item.id);
    setError("");
    setNotice("");
    try {
      await fetchApi("/api/movie-requests/" + item.id, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      setNotice("تحدّثت حالة الطلب.");
      await refresh(filter);
    } catch (err) {
      setError(err.message || "تعذر تحديث حالة الطلب");
    } finally {
      setSavingId("");
    }
  }

  async function changeFilter(value) {
    setFilter(value);
    await refresh(value);
  }

  return (
    <section className="panel movie-requests-panel">
      <header className="panel-header">
        <div>
          <h2>طلبات المستخدمين</h2>
          <p>العناوين التي طلبها المستخدمون من TMDB. الطلب لا يضيف الفيلم إلى المكتبة تلقائياً.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => refresh()} disabled={loading}>تحديث</button>
      </header>

      <div className="movie-requests-toolbar">
        <label>
          <span>حالة الطلب</span>
          <select className="toolbar-select" value={filter} onChange={event => changeFilter(event.target.value)}>
            <option value="all">جميع الطلبات</option>
            {statusOptions.map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}
          </select>
        </label>
        <div className="movie-requests-pending"><strong>{pendingCount}</strong><span>طلبات جديدة</span></div>
      </div>

      {error && <div className="auth-error" role="alert">{error}</div>}
      {notice && <div className="success-message" role="status">{notice}</div>}
      {loading ? <div className="empty">جارٍ تحميل الطلبات...</div> : items.length === 0 ? (
        <div className="empty">ما كاين حتى طلب فهاد الحالة.</div>
      ) : (
        <div className="movie-requests-list">
          {items.map(item => (
            <article className="movie-request-row" key={item.id}>
              {item.poster_path ? <img src={item.poster_path} alt="" loading="lazy" /> : <div className="movie-request-poster-fallback">F</div>}
              <div className="movie-request-main">
                <div className="movie-request-title-line">
                  <h3>{item.title}</h3>
                  <span className={"movies-status status-" + item.status}>{statusLabels[item.status] || item.status}</span>
                </div>
                <p>{item.release_year || "سنة غير محددة"} · {item.media_type === "series" ? "مسلسل" : "فيلم"}{item.rating != null ? " · ★ " + Number(item.rating).toFixed(1) : ""}</p>
                <p className="movie-request-overview">{item.overview || "لا يتوفر ملخص."}</p>
                <div className="movie-request-meta">
                  <strong>{item.request_count} طلب</strong>
                  <a href={item.tmdb_url} target="_blank" rel="noopener noreferrer">فتح صفحة TMDB</a>
                </div>
              </div>
              <label className="movie-request-status-control">
                <span>تغيير الحالة</span>
                <select className="toolbar-select" value={item.status} disabled={savingId === item.id} onChange={event => updateStatus(item, event.target.value)}>
                  {statusOptions.map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}
                </select>
              </label>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
