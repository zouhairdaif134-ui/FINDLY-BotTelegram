import { useEffect, useMemo, useState } from "react";
import "./analytics-section.css";

const number = (value) => new Intl.NumberFormat("en-US").format(Number(value || 0));

export default function AnalyticsSection({ fetchApi }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  async function loadAnalytics() {
    try {
      setLoading(true);
      setError("");
      const data = await fetchApi("/api/analytics/movie-referrals");
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err?.message || "تعذر تحميل إحصائيات المشاركة.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAnalytics();
  }, []);

  const totals = useMemo(() => rows.reduce((acc, row) => ({
    facebook: acc.facebook + Number(row.facebook_starts || 0),
    instagram: acc.instagram + Number(row.instagram_starts || 0),
    all: acc.all + Number(row.total_starts || 0)
  }), { facebook: 0, instagram: 0, all: 0 }), [rows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      String(row.title || "").toLowerCase().includes(term) ||
      String(row.release_year || "").includes(term)
    );
  }, [rows, search]);

  return (
    <section className="analytics-page">
      <div className="analytics-heading">
        <div>
          <span className="analytics-eyebrow">FINDLY · GROWTH</span>
          <h2>إحصائيات مشاركة الأفلام</h2>
          <p>تتبع بدايات البوت القادمة من روابط Facebook وInstagram، حسب كل فيلم.</p>
        </div>
        <button className="analytics-refresh" type="button" onClick={loadAnalytics} disabled={loading}>
          {loading ? "جارٍ التحديث..." : "↻ تحديث البيانات"}
        </button>
      </div>

      <div className="analytics-period">
        <span>الفترة: منذ بداية التتبع</span>
        <span>المصدر: روابط المشاركة الخاصة بـ FINDLY</span>
      </div>

      {error && <div className="analytics-error">{error}</div>}

      <div className="analytics-kpis">
        <article className="analytics-kpi">
          <span className="analytics-kpi-label">إجمالي البدايات</span>
          <strong>{number(totals.all)}</strong>
          <small>مرات بدء البوت من روابط المشاركة</small>
        </article>
        <article className="analytics-kpi facebook">
          <span className="analytics-kpi-label">Facebook</span>
          <strong>{number(totals.facebook)}</strong>
          <small>بدايات من روابط Facebook</small>
        </article>
        <article className="analytics-kpi instagram">
          <span className="analytics-kpi-label">Instagram</span>
          <strong>{number(totals.instagram)}</strong>
          <small>بدايات من روابط Instagram</small>
        </article>
      </div>

      <div className="analytics-table-card">
        <div className="analytics-table-heading">
          <div>
            <h3>الأداء حسب الفيلم</h3>
            <p>المستخدم الفريد هو حساب Telegram واحد، حتى لو بدأ البوت أكثر من مرة.</p>
          </div>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="بحث باسم الفيلم أو السنة..."
            aria-label="بحث باسم الفيلم أو السنة"
          />
        </div>

        <div className="analytics-table-wrap">
          <table className="analytics-table">
            <thead>
              <tr>
                <th>الفيلم</th>
                <th>Facebook<br />Starts</th>
                <th>Facebook<br />Unique</th>
                <th>Instagram<br />Starts</th>
                <th>Instagram<br />Unique</th>
                <th>الإجمالي<br />Unique</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.title_id}>
                  <td>
                    <strong>{row.title}</strong>
                    <small>{row.release_year || "—"} · {row.media_type === "series" ? "مسلسل" : "فيلم"}</small>
                  </td>
                  <td>{number(row.facebook_starts)}</td>
                  <td>{number(row.facebook_unique_users)}</td>
                  <td>{number(row.instagram_starts)}</td>
                  <td>{number(row.instagram_unique_users)}</td>
                  <td><strong>{number(row.total_unique_users)}</strong></td>
                </tr>
              ))}
              {!loading && filteredRows.length === 0 && (
                <tr><td className="analytics-empty" colSpan="6">ما كايناش نتائج مطابقة للبحث.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {loading && <div className="analytics-loading">جارٍ تحميل الإحصائيات...</div>}
      </div>

      <div className="analytics-note">
        <strong>ملاحظة حول دقة الأرقام</strong>
        <p>هذه الإحصائيات تقيس من ضغط رابط المشاركة ووصل فعلياً إلى بدء البوت عبر Telegram. لا تقيس عدد النقرات داخل Facebook أو Instagram. التتبع يبدأ من الروابط الموسومة الخاصة بالحملات؛ الزيارات القديمة أو روابط /start العادية لا يمكن نسبتها إلى منصة معينة.</p>
      </div>
    </section>
  );
}
