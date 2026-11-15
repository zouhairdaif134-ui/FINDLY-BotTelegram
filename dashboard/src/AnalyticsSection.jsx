import { useEffect, useMemo, useState } from "react";
import "./analytics-section.css";

const number = (value) => new Intl.NumberFormat("en-US").format(Number(value || 0));
const periodOptions = [
  { value: "7d", label: "آخر 7 أيام", days: 7 },
  { value: "30d", label: "آخر 30 يوماً", days: 30 },
  { value: "90d", label: "آخر 90 يوماً", days: 90 },
  { value: "all", label: "منذ بداية التتبع", days: null }
];

function Metric({ label, value, note, tone = "" }) {
  return (
    <article className={"analytics-kpi " + tone}>
      <span className="analytics-kpi-label">{label}</span>
      <strong>{number(value)}</strong>
      {note && <small>{note}</small>}
    </article>
  );
}

function ProviderCard({ title, data }) {
  const provider = data || {};
  return (
    <article className="analytics-provider-card">
      <div className="analytics-provider-title">
        <strong>{title}</strong>
        <span>تتبع SDK</span>
      </div>
      <div className="analytics-provider-stats">
        <div><strong>{number(provider.requests)}</strong><small>طلبات العرض</small></div>
        <div><strong>{number(provider.resolved)}</strong><small>SDK resolved</small></div>
        <div><strong>{number(provider.failed)}</strong><small>فشل SDK</small></div>
      </div>
    </article>
  );
}

export default function AnalyticsSection({ fetchApi }) {
  const [overview, setOverview] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("30d");

  async function loadAnalytics() {
    try {
      setLoading(true);
      setError("");
      const selected = periodOptions.find((item) => item.value === period) || periodOptions[1];
      const to = new Date();
      const from = selected.days === null
        ? new Date("2000-01-01T00:00:00.000Z")
        : new Date(to.getTime() - selected.days * 24 * 60 * 60 * 1000);
      const query = "?from=" + encodeURIComponent(from.toISOString()) + "&to=" + encodeURIComponent(to.toISOString());
      const [overviewResult, referralsResult] = await Promise.allSettled([
        fetchApi("/api/analytics/overview" + query),
        fetchApi("/api/analytics/movie-referrals")
      ]);
      if (overviewResult.status === "fulfilled") {
        setOverview(overviewResult.value || null);
      } else {
        throw overviewResult.reason;
      }
      if (referralsResult.status === "fulfilled") {
        setRows(Array.isArray(referralsResult.value) ? referralsResult.value : []);
      }
    } catch (err) {
      setError(err?.message || "تعذر تحميل إحصائيات FINDLY.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAnalytics();
  }, [period]);

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

  const users = overview?.users || {};
  const miniapp = overview?.miniapp || {};
  const activity = overview?.activity || {};
  const providers = Object.fromEntries((overview?.ad_providers || []).map((item) => [item.provider, item]));
  const botMetrics = Object.fromEntries((overview?.bots || []).map((item) => [item.slug, item]));
  const selectedPeriod = periodOptions.find((item) => item.value === period)?.label || periodOptions[1].label;

  return (
    <section className="analytics-page">
      <div className="analytics-heading">
        <div>
          <span className="analytics-eyebrow">FINDLY · PLATFORM INSIGHTS</span>
          <h2>إحصائيات FINDLY الشاملة</h2>
          <p>مؤشرات المستخدمين، نشاط البوتات، زيارات Mini App وأحداث منصات الإعلانات.</p>
        </div>
        <div className="analytics-toolbar">
          <select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="الفترة الزمنية">
            {periodOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <button className="analytics-refresh" type="button" onClick={loadAnalytics} disabled={loading}>
            {loading ? "جارٍ التحديث..." : "↻ تحديث البيانات"}
          </button>
        </div>
      </div>

      <div className="analytics-period">
        <span>الفترة: {selectedPeriod}</span>
        <span>الهوية: Telegram User ID واحد = مستخدم واحد عبر Master وWatch</span>
        <span>آخر تحديث: {overview?.generated_at ? new Date(overview.generated_at).toLocaleString() : "—"}</span>
      </div>

      {error && <div className="analytics-error">{error}</div>}
      {loading && !overview && <div className="analytics-loading">جارٍ تحميل الإحصائيات الحقيقية...</div>}

      <section className="analytics-block">
        <div className="analytics-block-heading">
          <div><h3>المستخدمون</h3><p>الاحتساب موحد على مستوى FINDLY، مع تفصيل كل بوت على حدة.</p></div>
        </div>
        <div className="analytics-kpis analytics-kpis-four">
          <Metric label="المستخدمون الفريدون" value={users.total} note="كل شخص يحتسب مرة واحدة" />
          <Metric label="مستخدمون جدد" value={users.new} note="أول تسجيل خلال الفترة" tone="tone-blue" />
          <Metric label="مستخدمون نشطون" value={users.active} note="لديهم أحداث مسجلة خلال الفترة" tone="tone-green" />
          <Metric label="غير نشطين" value={users.inactive} note="لا تفاعل مسجل خلال الفترة، وليس دليلاً على المغادرة" tone="tone-muted" />
        </div>
        <div className="analytics-bot-grid">
          <article className="analytics-bot-card">
            <span>Master Bot</span><strong>{number(users.master)}</strong><small>{number(botMetrics.findly?.active_users)} نشط · {number(botMetrics.findly?.events)} حدث خلال الفترة</small>
          </article>
          <article className="analytics-bot-card">
            <span>Watch Bot</span><strong>{number(users.watch)}</strong><small>{number(botMetrics.movies?.active_users)} نشط · {number(botMetrics.movies?.events)} حدث خلال الفترة</small>
          </article>
          <article className="analytics-bot-card">
            <span>المشتركون بين البوتين</span><strong>{number(users.shared)}</strong><small>نفس المستخدم استعمل البوتين</small>
          </article>
        </div>
      </section>

      <section className="analytics-block">
        <div className="analytics-block-heading">
          <div><h3>زيارات Mini App</h3><p>تسجيل فتح التطبيق بدأ مع تفعيل نظام التتبع؛ لا يشمل الزيارات القديمة.</p></div>
        </div>
        <div className="analytics-kpis analytics-kpis-two">
          <Metric label="زوار Mini App" value={miniapp.unique_visitors} note="مستخدمون فريدون خلال الفترة" />
          <Metric label="جلسات Mini App" value={miniapp.sessions} note="كل فتح جديد للتطبيق يُسجل كجلسة" />
        </div>
      </section>

      <section className="analytics-block">
        <div className="analytics-block-heading">
          <div><h3>نشاط المنصة</h3><p>الأحداث المسجلة من Telegram وMini App خلال الفترة المحددة.</p></div>
        </div>
        <div className="analytics-kpis analytics-kpis-four">
          <Metric label="رسائل Telegram" value={activity.telegram_messages} />
          <Metric label="تفاعلات الأزرار" value={activity.telegram_callbacks} />
          <Metric label="عمليات البحث" value={activity.movie_searches} />
          <Metric label="فتح تفاصيل العناوين" value={activity.movie_detail_views} />
          <Metric label="ضغطات المشاهدة" value={activity.movie_watch_clicks} />
          <Metric label="مشاركات الأفلام" value={activity.movie_shares} />
          <Metric label="عرض القائمة الرئيسية" value={activity.master_menu_views} />
          <Metric label="اختيارات القوائم" value={activity.menu_item_clicks} />
        </div>
      </section>

      <section className="analytics-block">
        <div className="analytics-block-heading">
          <div><h3>أداء منصات الإعلانات</h3><p>هذه بيانات طلبات SDK ونتائجها داخل التطبيق، وليست تأكيداً لمرات الظهور المدفوعة.</p></div>
        </div>
        <div className="analytics-provider-grid">
          <ProviderCard title="Monetag" data={providers.monetag} />
          <ProviderCard title="AdsGram" data={providers.adsgram} />
        </div>
        <div className="analytics-revenue-note">
          <strong>الإيرادات غير متاحة حالياً</strong>
          <p>لم يتم ربط تقارير الإيرادات الرسمية من Monetag وAdsGram. لن نعرض مبالغ تقديرية على أنها أرباح فعلية.</p>
        </div>
      </section>

      <section className="analytics-block">
        <div className="analytics-block-heading">
          <div><h3>إحالات مشاركة الأفلام</h3><p>بدايات البوت القادمة من روابط Facebook وInstagram الموسومة.</p></div>
        </div>
        <div className="analytics-kpis analytics-kpis-three">
          <Metric label="إجمالي البدايات" value={totals.all} note="من روابط المشاركة فقط" />
          <Metric label="Facebook" value={totals.facebook} note="بدايات من روابط Facebook" tone="tone-blue" />
          <Metric label="Instagram" value={totals.instagram} note="بدايات من روابط Instagram" tone="tone-pink" />
        </div>
        <div className="analytics-table-card">
          <div className="analytics-table-heading">
            <div><h3>الأداء حسب الفيلم</h3><p>المستخدم الفريد هو حساب Telegram واحد داخل كل منصة.</p></div>
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="بحث باسم الفيلم أو السنة..." aria-label="بحث باسم الفيلم أو السنة" />
          </div>
          <div className="analytics-table-wrap">
            <table className="analytics-table">
              <thead><tr><th>الفيلم</th><th>Facebook Starts</th><th>Facebook Unique</th><th>Instagram Starts</th><th>Instagram Unique</th><th>الإجمالي Unique</th></tr></thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.title_id}>
                    <td><strong>{row.title}</strong><small>{row.release_year || "—"} · {row.media_type === "series" ? "مسلسل" : "فيلم"}</small></td>
                    <td>{number(row.facebook_starts)}</td><td>{number(row.facebook_unique_users)}</td>
                    <td>{number(row.instagram_starts)}</td><td>{number(row.instagram_unique_users)}</td>
                    <td><strong>{number(row.total_unique_users)}</strong></td>
                  </tr>
                ))}
                {!loading && filteredRows.length === 0 && <tr><td className="analytics-empty" colSpan="6">ما كايناش نتائج مطابقة للبحث.</td></tr>}
              </tbody>
            </table>
          </div>
          {loading && <div className="analytics-loading">جارٍ تحميل الإحصائيات...</div>}
        </div>
      </section>

      <div className="analytics-note">
        <strong>ملاحظات دقة البيانات</strong>
        <p>عدد المستخدمين يعتمد على السجلات الموجودة في قاعدة البيانات، وليس قائمة شاملة من Telegram. لا يمكن الجزم بأن المستخدم حذف المحادثة أو حظر البوت؛ لذلك نستعمل «غير نشط» فقط. كما أن إحصائيات Mini App والإعلانات تبدأ من لحظة تفعيل التتبع، ونتيجة SDK لا تعني بالضرورة ظهور إعلان مدفوع أو تحقق إيراد.</p>
      </div>
    </section>
  );
}
