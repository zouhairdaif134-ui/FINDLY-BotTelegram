import { useEffect, useMemo, useState } from "react";
import "./monetization-section.css";

const MODULES = [
  ["overview", "Overview"],
  ["plans", "Subscription Plans"],
  ["subscribers", "Subscribers"],
  ["providers", "Ad Providers"],
  ["campaigns", "Ad Campaigns"],
  ["transactions", "Transactions"]
];
const PAGE_OPTIONS = [
  ["home", "Home"],
  ["search", "Search / Results"],
  ["movie_details", "Movie / Series Details"],
  ["watch", "Watch"],
  ["all_interactions", "All Telegram interactions"],
  ["future", "Future page"]
];
const WEBSITE_FORMATS = ["banner", "native", "popup", "video"];
const TELEGRAM_FORMATS = ["telegram_text", "telegram_card"];

function money(value, currency = "MAD") {
  const amount = Number(value || 0);
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
}
function dateLabel(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}
function apiOptions(method, body) {
  return { method, body: JSON.stringify(body) };
}

export default function MonetizationSection({ fetchApi, bots = [], currentUserId }) {
  const [module, setModule] = useState("overview");
  const [channel, setChannel] = useState("website");
  const [overview, setOverview] = useState(null);
  const [providers, setProviders] = useState([]);
  const [zones, setZones] = useState([]);
  const [placements, setPlacements] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [transactions, setTransactions] = useState({ items: [], total: 0 });
  const [exclusions, setExclusions] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [campaignLinks, setCampaignLinks] = useState([]);
  const [compatibility, setCompatibility] = useState(null);
  const [selectedCampaign, setSelectedCampaign] = useState("");
  const [selectedPlacement, setSelectedPlacement] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [campaignEditId, setCampaignEditId] = useState("");
  const [placementEditId, setPlacementEditId] = useState("");

  const [providerForm, setProviderForm] = useState({
    slug: "monetag", name: "Monetag", site_domain: "", publisher_id: "", integration: ""
  });
  const [zoneForm, setZoneForm] = useState({
    provider_id: "", channel: "website", format: "banner", external_zone_id: "", site_domain: ""
  });
  const [placementForm, setPlacementForm] = useState({
    channel: "website", page_key: "home", slot_key: "home-top", position: "top",
    format: "banner", provider_zone_id: "", is_enabled: false, priority: 100
  });
  const [frequencyForm, setFrequencyForm] = useState({
    channel: "website", max_per_user: 3, cooldown_seconds: 3600,
    max_per_session: 1, rolling_window_minutes: 1440, is_enabled: true
  });
  const [campaignForm, setCampaignForm] = useState({
    bot_id: bots[0]?.id || "", provider_id: "", name: "", channel: "telegram",
    format: "telegram_text", target_url: "", title: "", body: "", image_url: "",
    telegram_file_id: "", cta_label: "اعرف المزيد", starts_at: "", ends_at: "",
    max_deliveries: "", budget: "", currency: "MAD", priority: 100
  });
  const [revenueForm, setRevenueForm] = useState({
    amount: "", currency: "MAD", event_type: "publisher_revenue", external_reference: "", campaign_id: ""
  });
  const [exclusionForm, setExclusionForm] = useState({ user_id: "", reason: "test", note: "" });

  async function loadAll() {
    setLoading(true);
    setError("");
    const jobs = [
      ["overview", "/api/monetization/overview", setOverview],
      ["providers", "/api/monetization/providers", setProviders],
      ["zones", "/api/monetization/provider-zones", setZones],
      ["placements", "/api/monetization/placements", setPlacements],
      ["policies", "/api/monetization/frequency-policies", setPolicies],
      ["campaigns", "/api/monetization/campaigns", setCampaigns],
      ["transactions", "/api/monetization/transactions?limit=50", setTransactions],
      ["exclusions", "/api/monetization/exclusions", setExclusions],
      ["compatibility", "/api/monetization/compatibility", setCompatibility]
    ];
    const results = await Promise.allSettled(jobs.map(([, url]) => fetchApi(url)));
    const failures = [];
    results.forEach((result, index) => {
      const [name, , setter] = jobs[index];
      if (result.status === "fulfilled") setter(result.value);
      else failures.push(name + ": " + (result.reason?.message || "request failed"));
    });
    if (failures.length === jobs.length) setError(failures.join(" · "));
    else if (failures.length) setNotice("بعض بيانات Monetization ما تحملاتش بسبب الصلاحيات أو اتصال API.");
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    if (!campaignForm.bot_id && bots[0]?.id) setCampaignForm((old) => ({ ...old, bot_id: bots[0].id }));
  }, [bots]);

  const activeZones = useMemo(() => zones.filter((zone) => zone.is_verified && zone.is_active), [zones]);
  const currentPolicy = policies.find((item) => item.channel === frequencyForm.channel && !item.campaign_id && !item.placement_id);

  useEffect(() => {
    if (!currentPolicy) return;
    setFrequencyForm((old) => ({
      ...old,
      max_per_user: currentPolicy.max_per_user,
      cooldown_seconds: currentPolicy.cooldown_seconds,
      max_per_session: currentPolicy.max_per_session,
      rolling_window_minutes: currentPolicy.rolling_window_minutes,
      is_enabled: currentPolicy.is_enabled
    }));
  }, [currentPolicy?.id, frequencyForm.channel]);

  async function runMutation(path, method, body, successMessage) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await fetchApi(path, apiOptions(method, body));
      setNotice(successMessage || "تم حفظ التغيير.");
      await loadAll();
      return result;
    } catch (err) {
      setError(err?.message || "تعذر تنفيذ العملية.");
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function saveProvider(event) {
    event.preventDefault();
    const settings = {};
    if (providerForm.site_domain.trim()) settings.site_domain = providerForm.site_domain.trim();
    if (providerForm.publisher_id.trim()) settings.publisher_id = providerForm.publisher_id.trim();
    if (providerForm.integration.trim()) settings.integration = providerForm.integration.trim();
    await runMutation("/api/monetization/providers", "POST", {
      slug: providerForm.slug, name: providerForm.name, provider_type: "external", settings
    }, "تم حفظ إعدادات مزود الإعلانات.");
  }

  async function saveZone(event) {
    event.preventDefault();
    const result = await runMutation("/api/monetization/provider-zones", "POST", {
      provider_id: zoneForm.provider_id, channel: zoneForm.channel, format: zoneForm.format,
      external_zone_id: zoneForm.external_zone_id, site_domain: zoneForm.site_domain || null
    }, "تمت إضافة Zone بحالة غير مفعّلة.");
    if (result) setZoneForm((old) => ({ ...old, external_zone_id: "" }));
  }

  async function savePlacement(event) {
    event.preventDefault();
    const body = {
      channel: placementForm.channel,
      page_key: placementForm.channel === "telegram" ? "all_interactions" : placementForm.page_key,
      slot_key: placementForm.slot_key, position: placementForm.channel === "telegram" ? "interaction_trigger" : placementForm.position,
      format: placementForm.format, provider_zone_id: placementForm.provider_zone_id || null,
      is_enabled: placementForm.is_enabled, priority: Number(placementForm.priority)
    };
    const path = placementEditId
      ? "/api/monetization/placements/" + placementEditId
      : "/api/monetization/placements";
    const result = await runMutation(path, placementEditId ? "PUT" : "POST", body, "تم حفظ Ad Placement.");
    if (result) {
      setPlacementEditId("");
      setPlacementForm((old) => ({ ...old, slot_key: "", is_enabled: false }));
    }
  }

  function editPlacement(item) {
    setPlacementEditId(item.id);
    setPlacementForm({
      channel: item.channel, page_key: item.page_key, slot_key: item.slot_key,
      position: item.position, format: item.format, provider_zone_id: item.provider_zone_id || "",
      is_enabled: item.is_enabled, priority: item.priority ?? 100
    });
    setChannel(item.channel);
  }

  async function saveFrequency(event) {
    event.preventDefault();
    await runMutation("/api/monetization/frequency-policies", "POST", {
      ...frequencyForm, max_per_user: Number(frequencyForm.max_per_user),
      cooldown_seconds: Number(frequencyForm.cooldown_seconds),
      max_per_session: Number(frequencyForm.max_per_session),
      rolling_window_minutes: Number(frequencyForm.rolling_window_minutes)
    }, "تم تحديث سياسة تكرار الإعلانات.");
  }

  function editCampaign(item) {
    setCampaignEditId(item.id);
    setCampaignForm({
      bot_id: item.bot_id, provider_id: item.provider_id, name: item.name,
      channel: item.channel, format: item.format, target_url: item.target_url || "",
      title: item.creative?.title || "", body: item.creative?.body || "",
      image_url: item.creative?.image_url || "", telegram_file_id: item.creative?.telegram_file_id || "",
      cta_label: item.creative?.cta_label || "اعرف المزيد",
      starts_at: item.starts_at ? item.starts_at.slice(0, 16) : "",
      ends_at: item.ends_at ? item.ends_at.slice(0, 16) : "",
      max_deliveries: item.max_deliveries ?? "", budget: item.budget ?? "",
      currency: item.currency || "MAD", priority: item.priority ?? 100
    });
  }

  async function saveCampaign(event) {
    event.preventDefault();
    const creative = {};
    if (campaignForm.title.trim()) creative.title = campaignForm.title.trim();
    if (campaignForm.body.trim()) creative.body = campaignForm.body.trim();
    if (campaignForm.image_url.trim()) creative.image_url = campaignForm.image_url.trim();
    if (campaignForm.telegram_file_id.trim()) creative.telegram_file_id = campaignForm.telegram_file_id.trim();
    if (campaignForm.cta_label.trim()) creative.cta_label = campaignForm.cta_label.trim();
    const body = {
      bot_id: campaignForm.bot_id, provider_id: campaignForm.provider_id,
      name: campaignForm.name, channel: campaignForm.channel, format: campaignForm.format,
      target_url: campaignForm.target_url || null, creative,
      starts_at: campaignForm.starts_at ? new Date(campaignForm.starts_at).toISOString() : null,
      ends_at: campaignForm.ends_at ? new Date(campaignForm.ends_at).toISOString() : null,
      max_deliveries: campaignForm.max_deliveries === "" ? null : Number(campaignForm.max_deliveries),
      budget: campaignForm.budget === "" ? null : campaignForm.budget,
      currency: campaignForm.currency, priority: Number(campaignForm.priority)
    };
    const path = campaignEditId ? "/api/monetization/campaigns/" + campaignEditId : "/api/monetization/campaigns";
    const result = await runMutation(path, campaignEditId ? "PUT" : "POST", body, "تم حفظ الحملة كـ Draft.");
    if (result) {
      setCampaignEditId("");
      setCampaignForm((old) => ({ ...old, name: "", target_url: "", title: "", body: "", image_url: "", telegram_file_id: "" }));
    }
  }

  async function loadCampaignPlacements(campaignId) {
    setSelectedCampaign(campaignId);
    try {
      setCampaignLinks(await fetchApi("/api/monetization/campaigns/" + campaignId + "/placements"));
    } catch (err) {
      setError(err?.message || "تعذر تحميل ربط الحملة بالمواضع.");
    }
  }

  async function linkPlacement() {
    if (!selectedCampaign || !selectedPlacement) return;
    const result = await runMutation(
      "/api/monetization/campaigns/" + selectedCampaign + "/placements",
      "POST", { placement_id: selectedPlacement }, "تم ربط Placement بالحملة."
    );
    if (result) await loadCampaignPlacements(selectedCampaign);
  }

  async function changeCampaignStatus(item, status) {
    if (status === "active" && !window.confirm("تأكيد تشغيل الحملة؟ لن تعمل إلا إذا كان Provider وZone وPlacement مفعّلين ومتحققاً منهم.")) return;
    await runMutation("/api/monetization/campaigns/" + item.id + "/status", "POST", { status }, "تم تحديث حالة الحملة.");
  }

  async function verifyZone(zone) {
    if (!window.confirm("واش اختبرتي هاد Zone فعلياً فحساب مزود الإعلانات؟ التأكيد خاصو يكون من Owner.")) return;
    await runMutation("/api/monetization/provider-zones/" + zone.id + "/verify", "POST", { confirmation: true }, "تم تسجيل تأكيد Owner للـ Zone.");
  }

  async function toggleZone(zone) {
    await runMutation("/api/monetization/provider-zones/" + zone.id + "/status", "POST", { enabled: !zone.is_active }, "تم تحديث حالة Zone.");
  }

  async function toggleProvider(provider) {
    await runMutation("/api/monetization/providers/" + provider.id + "/status", "POST", { enabled: !provider.is_active }, "تم تحديث حالة Provider.");
  }

  async function saveRevenue(event) {
    event.preventDefault();
    const result = await runMutation("/api/monetization/transactions", "POST", {
      amount: revenueForm.amount, currency: revenueForm.currency,
      revenue_source: "external_ad", event_type: revenueForm.event_type,
      external_reference: revenueForm.external_reference || null,
      campaign_id: revenueForm.campaign_id || null
    }, "تسجّل الإيراد اليدوي فالسجل.");
    if (result) setRevenueForm((old) => ({ ...old, amount: "", external_reference: "" }));
  }

  async function reverseTransaction(item) {
    const reason = window.prompt("سبب التصحيح / الإلغاء:");
    if (!reason?.trim()) return;
    await runMutation("/api/monetization/transactions/" + item.id + "/reversal", "POST", { reason: reason.trim() }, "تسجّل قيد عكسي جديد؛ السجل الأصلي لم يتغير.");
  }

  async function loadCandidates() {
    try {
      setCandidates(await fetchApi("/api/monetization/exclusions/candidates?limit=100&search=" + encodeURIComponent(candidateSearch)));
    } catch (err) { setError(err?.message || "تعذر تحميل المستخدمين."); }
  }

  async function excludeUser(event) {
    event.preventDefault();
    const result = await runMutation("/api/monetization/exclusions", "POST", exclusionForm, "تم استثناء المستخدم من MAU والإعلانات.");
    if (result) setExclusionForm({ user_id: "", reason: "test", note: "" });
  }

  async function includeUser(item) {
    if (!window.confirm("إزالة الاستثناء لهذا المستخدم؟")) return;
    await runMutation("/api/monetization/exclusions/" + item.user_id, "DELETE", {}, "تمت إزالة الاستثناء.");
  }

  const revenueTotalByCurrency = useMemo(() => {
    const totals = new Map();
    for (const item of overview?.revenue_30d || []) {
      totals.set(item.currency, (totals.get(item.currency) || 0) + Number(item.net_amount || 0));
    }
    return [...totals.entries()];
  }, [overview]);

  return (
    <section className="monetization-page">
      <header className="monetization-heading">
        <div>
          <span className="monetization-eyebrow">FINDLY REVENUE CONTROL</span>
          <h2>Monetization</h2>
          <p>تحكم فالإعلانات، القنوات، الحملات، التكرار والإيرادات من لوحة واحدة.</p>
        </div>
        <button className="monetization-refresh" type="button" onClick={loadAll} disabled={loading || saving}>↻ Refresh</button>
      </header>

      <nav className="monetization-tabs" aria-label="Monetization modules">
        {MODULES.map(([key, label]) => (
          <button key={key} type="button" className={module === key ? "active" : ""} onClick={() => setModule(key)}>{label}</button>
        ))}
      </nav>

      {notice && <div className="monetization-notice" role="status">{notice}</div>}
      {error && <div className="monetization-error" role="alert">{error}</div>}
      {loading ? <div className="monetization-empty">Loading Monetization data…</div> : (
        <>
          {module === "overview" && (
            <div className="monetization-stack">
              <div className="monetization-kpis">
                <article><span>Eligible MAU · 30 days</span><strong>{Number(overview?.mau_30d || 0).toLocaleString()}</strong><small>Target: 1,000 active users</small></article>
                <article><span>Active campaigns</span><strong>{overview?.campaigns_active ?? 0}</strong><small>Only external campaigns in Phase 1</small></article>
                <article><span>Enabled placements</span><strong>{overview?.placements_enabled ?? 0}</strong><small>Website and Telegram separately</small></article>
                <article><span>Active subscriptions</span><strong>{overview?.active_subscriptions ?? 0}</strong><small>Payments remain locked in Phase 1</small></article>
              </div>
              <section className="monetization-panel">
                <div className="monetization-panel-title"><div><h3>Phase 2 eligibility</h3><p>المعيار هو MAU حقيقي فآخر 30 يوم، ماشي عدد الحسابات المسجلة.</p></div><span className={overview?.phase2_eligible ? "state-eligible" : "state-locked"}>{overview?.phase2_eligible ? "Threshold reached" : "Locked"}</span></div>
                <div className="monetization-progress"><span style={{ width: Math.min(100, (Number(overview?.mau_30d || 0) / 1000) * 100) + "%" }} /></div>
                <p className="monetization-muted">{overview?.phase2_eligible ? "وصلنا للعتبة، ولكن التفعيل ما كيوقعش تلقائياً؛ خاص موافقة Owner مستقلة." : "Premium والبيع المباشر للإعلانات باقيين مقفلين حتى نوصلو لـ 1,000 MAU وموافقة Owner."}</p>
              </section>
              <section className="monetization-panel">
                <h3>Advertising delivery · last 30 days</h3>
                <div className="monetization-channel-grid">
                  {["website", "telegram"].map((key) => {
                    const item = overview?.delivery_30d?.[key] || {};
                    return <article key={key}><h4>{key === "website" ? "Website" : "Telegram"}</h4><div><span>Attempted</span><strong>{item.attempted || 0}</strong></div><div><span>Sent</span><strong>{item.sent || 0}</strong></div><div><span>Failed</span><strong>{item.failed || 0}</strong></div></article>;
                  })}
                </div>
                <p className="monetization-muted">Delivery counts are not revenue. Revenue is recorded separately from provider reports or manual ledger entries.</p>
              </section>
              <section className="monetization-panel">
                <h3>Net revenue · last 30 days</h3>
                {revenueTotalByCurrency.length ? <div className="monetization-revenue-row">{revenueTotalByCurrency.map(([currency, amount]) => <strong key={currency}>{money(amount, currency)}</strong>)}</div> : <p className="monetization-muted">ما كاين حتى إيراد مسجل فهاد الفترة.</p>}
                <div className="monetization-table-wrap"><table><thead><tr><th>Source</th><th>Provenance</th><th>Currency</th><th>Net amount</th><th>Entries</th></tr></thead><tbody>{(overview?.revenue_30d || []).map((item, index) => <tr key={index}><td>{item.revenue_source}</td><td>{item.provenance}</td><td>{item.currency}</td><td>{money(item.net_amount, item.currency)}</td><td>{item.entry_count}</td></tr>)}</tbody></table></div>
              </section>
            </div>
          )}

          {module === "plans" && (
            <section className="monetization-panel monetization-locked-panel">
              <span className="monetization-lock">LOCKED · PHASE 2</span>
              <h3>Subscription Plans</h3>
              <p>إعداد الخطط والأسعار محجوز للمرحلة الثانية. ما كاين لا تفعيل أداء ولا اشتراكات Premium فـ Phase 1.</p>
              <p>MAU الحالي: <strong>{overview?.mau_30d || 0} / 1,000</strong>. حتى من بعد الوصول للعتبة، التفعيل خاصو موافقة Owner صريحة.</p>
            </section>
          )}

          {module === "subscribers" && (
            <section className="monetization-panel monetization-locked-panel">
              <span className="monetization-lock">LOCKED · PHASE 2</span>
              <h3>Subscribers</h3>
              <p>إدارة المشتركين والأداء مازال مقفولة. لا يتم إنشاء اشتراك نشط أو تحصيل أي مبلغ من هاد الواجهة.</p>
            </section>
          )}

          {module === "providers" && (
            <div className="monetization-stack">
              <section className="monetization-panel">
                <div className="monetization-panel-title"><div><h3>Ad Providers</h3><p>Monetag وAdsterra فقط فـ Phase 1. Direct Advertisers مقفولة.</p></div><span className="state-locked">Direct · Phase 2</span></div>
                <div className="monetization-provider-grid">
                  {providers.map((provider) => <article key={provider.id}>
                    <div className="monetization-panel-title"><h4>{provider.name}</h4><span className={provider.is_active ? "state-eligible" : "state-locked"}>{provider.is_active ? "Active" : "Off"}</span></div>
                    <p className="monetization-muted">{provider.slug} · {provider.provider_type}</p>
                    <p className="monetization-muted">Domain: {provider.settings?.site_domain || "Not configured"}</p>
                    <p className="monetization-muted">Publisher ID: {provider.settings?.publisher_id || "Not configured"}</p>
                    <button type="button" className="monetization-secondary" onClick={() => setProviderForm({
                      slug: provider.slug, name: provider.name, site_domain: provider.settings?.site_domain || "",
                      publisher_id: provider.settings?.publisher_id || "", integration: provider.settings?.integration || ""
                    })}>Edit settings</button>
                    <button type="button" className="monetization-secondary" disabled={saving} onClick={() => toggleProvider(provider)}>{provider.is_active ? "Disable provider" : "Enable provider"}</button>
                  </article>)}
                </div>
                <form className="monetization-form" onSubmit={saveProvider}>
                  <h4>Provider settings</h4>
                  <label>Provider<select value={providerForm.slug} onChange={(e) => setProviderForm({ ...providerForm, slug: e.target.value, name: e.target.value === "monetag" ? "Monetag" : "Adsterra" })}><option value="monetag">Monetag</option><option value="adsterra">Adsterra</option></select></label>
                  <label>Display name<input value={providerForm.name} onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })} required /></label>
                  <label>Website domain<input value={providerForm.site_domain} onChange={(e) => setProviderForm({ ...providerForm, site_domain: e.target.value })} placeholder="findly.example" /></label>
                  <label>Publisher ID<input value={providerForm.publisher_id} onChange={(e) => setProviderForm({ ...providerForm, publisher_id: e.target.value })} /></label>
                  <label>Integration reference<input value={providerForm.integration} onChange={(e) => setProviderForm({ ...providerForm, integration: e.target.value })} placeholder="Provider-side integration reference" /></label>
                  <button className="monetization-primary" disabled={saving}>Save provider settings</button>
                </form>
              </section>

              <section className="monetization-panel">
                <h3>Provider Zones & verification</h3>
                <p className="monetization-muted">كل Zone كتبدأ Off. خاص اختبارها فحساب المزود، تأكيد Owner، ومن بعد تفعيلها بشكل مستقل.</p>
                <form className="monetization-form" onSubmit={saveZone}>
                  <label>Provider<select value={zoneForm.provider_id} onChange={(e) => setZoneForm({ ...zoneForm, provider_id: e.target.value })} required><option value="">Choose provider</option>{providers.filter((p) => p.provider_type === "external").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
                  <label>Channel<select value={zoneForm.channel} onChange={(e) => setZoneForm({ ...zoneForm, channel: e.target.value, format: e.target.value === "website" ? "banner" : "telegram_text" })}><option value="website">Website</option><option value="telegram">Telegram</option></select></label>
                  <label>Format<select value={zoneForm.format} onChange={(e) => setZoneForm({ ...zoneForm, format: e.target.value })}>{(zoneForm.channel === "website" ? WEBSITE_FORMATS : TELEGRAM_FORMATS).map((format) => <option key={format}>{format}</option>)}</select></label>
                  <label>External Zone / Smartlink ID<input value={zoneForm.external_zone_id} onChange={(e) => setZoneForm({ ...zoneForm, external_zone_id: e.target.value })} required /></label>
                  {zoneForm.channel === "website" && <label>Site domain<input value={zoneForm.site_domain} onChange={(e) => setZoneForm({ ...zoneForm, site_domain: e.target.value })} placeholder="findly.example" /></label>}
                  <button className="monetization-primary" disabled={saving || !providers.length}>Add inactive zone</button>
                </form>
                <div className="monetization-table-wrap"><table><thead><tr><th>Provider</th><th>Channel / format</th><th>Zone ID</th><th>Verified</th><th>Status</th><th>Actions</th></tr></thead><tbody>
                  {zones.map((zone) => <tr key={zone.id}><td>{providers.find((p) => p.id === zone.provider_id)?.name || "—"}</td><td>{zone.channel} / {zone.format}</td><td>{zone.external_zone_id}</td><td>{zone.is_verified ? "Yes · " + dateLabel(zone.verified_at) : "No"}</td><td>{zone.is_active ? "Active" : "Off"}</td><td className="monetization-actions">{!zone.is_verified && <button type="button" className="monetization-secondary" onClick={() => verifyZone(zone)}>Owner verify</button>}{zone.is_verified && <button type="button" className="monetization-secondary" onClick={() => toggleZone(zone)}>{zone.is_active ? "Disable" : "Enable"}</button>}</td></tr>)}
                  {!zones.length && <tr><td colSpan="6">No provider zones configured.</td></tr>}
                </tbody></table></div>
              </section>

              <section className="monetization-panel">
                <div className="monetization-panel-title"><div><h3>Ad Placement Manager</h3><p>إعداد مواضع متعددة لكل صفحة، مع تحكم مستقل فـ Website وTelegram.</p></div></div>
                <div className="monetization-channel-switch"><button type="button" className={channel === "website" ? "active" : ""} onClick={() => { setChannel("website"); setPlacementForm((old) => ({ ...old, channel: "website", page_key: "home", position: "top", format: "banner" })); }}>Website</button><button type="button" className={channel === "telegram" ? "active" : ""} onClick={() => { setChannel("telegram"); setPlacementForm((old) => ({ ...old, channel: "telegram", page_key: "all_interactions", position: "interaction_trigger", format: "telegram_text" })); }}>Telegram</button></div>
                <form className="monetization-form" onSubmit={savePlacement}>
                  <label>Page<select disabled={channel === "telegram"} value={placementForm.page_key} onChange={(e) => setPlacementForm({ ...placementForm, page_key: e.target.value })}>{PAGE_OPTIONS.filter(([key]) => channel === "website" ? key !== "all_interactions" : key === "all_interactions").map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                  <label>Slot key<input value={placementForm.slot_key} onChange={(e) => setPlacementForm({ ...placementForm, slot_key: e.target.value })} placeholder="home-top-banner" required /></label>
                  <label>Position<select disabled={channel === "telegram"} value={placementForm.position} onChange={(e) => setPlacementForm({ ...placementForm, position: e.target.value })}>{(channel === "website" ? ["top", "bottom", "between_cards", "within_content"] : ["interaction_trigger"]).map((p) => <option key={p}>{p}</option>)}</select></label>
                  <label>Format<select value={placementForm.format} onChange={(e) => setPlacementForm({ ...placementForm, format: e.target.value })}>{(channel === "website" ? WEBSITE_FORMATS : TELEGRAM_FORMATS).map((f) => <option key={f}>{f}</option>)}</select></label>
                  <label>Verified provider zone<select value={placementForm.provider_zone_id} onChange={(e) => setPlacementForm({ ...placementForm, provider_zone_id: e.target.value })}><option value="">Choose zone</option>{activeZones.filter((z) => z.channel === channel && z.format === placementForm.format).map((z) => <option key={z.id} value={z.id}>{providers.find((p) => p.id === z.provider_id)?.name} · {z.external_zone_id}</option>)}</select></label>
                  <label>Priority<input type="number" min="0" max="10000" value={placementForm.priority} onChange={(e) => setPlacementForm({ ...placementForm, priority: e.target.value })} /></label>
                  <label className="monetization-check"><input type="checkbox" checked={placementForm.is_enabled} onChange={(e) => setPlacementForm({ ...placementForm, is_enabled: e.target.checked })} /> Enable placement</label>
                  <button className="monetization-primary" disabled={saving}>{placementEditId ? "Update placement" : "Add placement"}</button>
                  {placementEditId && <button type="button" className="monetization-secondary" onClick={() => { setPlacementEditId(""); setPlacementForm((old) => ({ ...old, is_enabled: false })); }}>Cancel edit</button>}
                </form>
                <div className="monetization-table-wrap"><table><thead><tr><th>Channel</th><th>Page / slot</th><th>Position / format</th><th>Zone</th><th>Status</th><th></th></tr></thead><tbody>{placements.map((item) => <tr key={item.id}><td>{item.channel}</td><td>{item.page_key} / {item.slot_key}</td><td>{item.position} / {item.format}</td><td>{zones.find((z) => z.id === item.provider_zone_id)?.external_zone_id || "—"}</td><td>{item.is_enabled ? "Enabled" : "Off"}</td><td><button type="button" className="monetization-secondary" onClick={() => editPlacement(item)}>Edit</button></td></tr>)}{!placements.length && <tr><td colSpan="6">No placements configured.</td></tr>}</tbody></table></div>
              </section>

              <section className="monetization-panel">
                <h3>Frequency & user exclusions</h3>
                <form className="monetization-form" onSubmit={saveFrequency}>
                  <label>Channel<select value={frequencyForm.channel} onChange={(e) => setFrequencyForm({ ...frequencyForm, channel: e.target.value })}><option value="website">Website</option><option value="telegram">Telegram</option></select></label>
                  <label>Max per user / 30 days<input type="number" min="1" max="100" value={frequencyForm.max_per_user} onChange={(e) => setFrequencyForm({ ...frequencyForm, max_per_user: e.target.value })} /></label>
                  <label>Cooldown · seconds<input type="number" min="0" max="604800" value={frequencyForm.cooldown_seconds} onChange={(e) => setFrequencyForm({ ...frequencyForm, cooldown_seconds: e.target.value })} /></label>
                  <label>Max per conversation window<input type="number" min="1" max="20" value={frequencyForm.max_per_session} onChange={(e) => setFrequencyForm({ ...frequencyForm, max_per_session: e.target.value })} /></label>
                  <label>Window · minutes<input type="number" min="1" max="43200" value={frequencyForm.rolling_window_minutes} onChange={(e) => setFrequencyForm({ ...frequencyForm, rolling_window_minutes: e.target.value })} /></label>
                  <label className="monetization-check"><input type="checkbox" checked={frequencyForm.is_enabled} onChange={(e) => setFrequencyForm({ ...frequencyForm, is_enabled: e.target.checked })} /> Apply frequency policy</label>
                  <button className="monetization-primary" disabled={saving}>Save frequency policy</button>
                </form>
                <p className="monetization-muted">Current saved default: {currentPolicy ? currentPolicy.max_per_user + " / user · " + currentPolicy.cooldown_seconds + "s cooldown · " + currentPolicy.max_per_session + " / " + currentPolicy.rolling_window_minutes + "m" : "No saved default yet."}</p>
                <div className="monetization-table-wrap"><table><thead><tr><th>User ID</th><th>Reason</th><th>Note</th><th></th></tr></thead><tbody>{exclusions.map((item) => <tr key={item.user_id}><td>{item.user_id}</td><td>{item.reason}</td><td>{item.note || "—"}</td><td><button type="button" className="monetization-secondary" onClick={() => includeUser(item)}>Remove exclusion</button></td></tr>)}{!exclusions.length && <tr><td colSpan="4">No excluded users.</td></tr>}</tbody></table></div>
                <form className="monetization-form" onSubmit={excludeUser}>
                  <label>User ID<input value={exclusionForm.user_id} onChange={(e) => setExclusionForm({ ...exclusionForm, user_id: e.target.value })} required /></label>
                  <label>Reason<select value={exclusionForm.reason} onChange={(e) => setExclusionForm({ ...exclusionForm, reason: e.target.value })}><option value="admin">Admin</option><option value="test">Test account</option><option value="manual">Manual exclusion</option></select></label>
                  <label>Note<input value={exclusionForm.note} onChange={(e) => setExclusionForm({ ...exclusionForm, note: e.target.value })} maxLength="240" /></label>
                  <button className="monetization-primary" disabled={saving}>Exclude user from MAU</button>
                </form>
                <div className="monetization-inline-search"><input value={candidateSearch} onChange={(e) => setCandidateSearch(e.target.value)} placeholder="Search Telegram users by username/name" /><button type="button" className="monetization-secondary" onClick={loadCandidates}>Find users</button></div>
                {candidates.length > 0 && <div className="monetization-table-wrap"><table><thead><tr><th>User</th><th>Last seen</th><th>Bot</th><th></th></tr></thead><tbody>{candidates.map((item) => <tr key={item.id}><td>{item.first_name || ""} {item.last_name || ""} @{item.username || "—"}</td><td>{dateLabel(item.last_seen_at)}</td><td>{item.is_bot ? "Yes" : "No"}</td><td><button type="button" className="monetization-secondary" onClick={() => setExclusionForm({ user_id: item.id, reason: item.is_bot ? "manual" : "test", note: "" })}>Select</button></td></tr>)}</tbody></table></div>}
              </section>
            </div>
          )}

          {module === "campaigns" && (
            <div className="monetization-stack">
              <section className="monetization-panel">
                <div className="monetization-panel-title"><div><h3>Ad Campaigns</h3><p>External campaigns only. Direct advertiser sales stay locked until Phase 2.</p></div><span className="state-locked">Direct campaigns · Locked</span></div>
                <form className="monetization-form" onSubmit={saveCampaign}>
                  <label>Campaign name<input value={campaignForm.name} onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })} required /></label>
                  <label>Bot<select value={campaignForm.bot_id} onChange={(e) => setCampaignForm({ ...campaignForm, bot_id: e.target.value })} required><option value="">Choose bot</option>{bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name} · {bot.slug}</option>)}</select></label>
                  <label>Provider<select value={campaignForm.provider_id} onChange={(e) => setCampaignForm({ ...campaignForm, provider_id: e.target.value })} required><option value="">Choose provider</option>{providers.filter((p) => p.provider_type === "external").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
                  <label>Channel<select value={campaignForm.channel} onChange={(e) => setCampaignForm({ ...campaignForm, channel: e.target.value, format: e.target.value === "website" ? "banner" : "telegram_text" })}><option value="website">Website</option><option value="telegram">Telegram</option></select></label>
                  <label>Format<select value={campaignForm.format} onChange={(e) => setCampaignForm({ ...campaignForm, format: e.target.value })}>{(campaignForm.channel === "website" ? WEBSITE_FORMATS : TELEGRAM_FORMATS).map((f) => <option key={f}>{f}</option>)}</select></label>
                  <label>Target URL / Smartlink<input type="url" value={campaignForm.target_url} onChange={(e) => setCampaignForm({ ...campaignForm, target_url: e.target.value })} placeholder="https://…" required={campaignForm.channel === "telegram"} /></label>
                  {campaignForm.channel === "telegram" && <>
                    {campaignForm.format === "telegram_card" && <label>Ad title<input value={campaignForm.title} onChange={(e) => setCampaignForm({ ...campaignForm, title: e.target.value })} required /></label>}
                    <label>Ad text<textarea value={campaignForm.body} onChange={(e) => setCampaignForm({ ...campaignForm, body: e.target.value })} maxLength="4000" required /></label>
                    {campaignForm.format === "telegram_card" && <>
                      <label>Image URL<input type="url" value={campaignForm.image_url} onChange={(e) => setCampaignForm({ ...campaignForm, image_url: e.target.value })} placeholder="https://…" /></label>
                      <label>Telegram file ID<input value={campaignForm.telegram_file_id} onChange={(e) => setCampaignForm({ ...campaignForm, telegram_file_id: e.target.value })} /></label>
                    </>}
                    <label>CTA button text<input value={campaignForm.cta_label} onChange={(e) => setCampaignForm({ ...campaignForm, cta_label: e.target.value })} required /></label>
                  </>}
                  <label>Start date/time<input type="datetime-local" value={campaignForm.starts_at} onChange={(e) => setCampaignForm({ ...campaignForm, starts_at: e.target.value })} /></label>
                  <label>End date/time<input type="datetime-local" value={campaignForm.ends_at} onChange={(e) => setCampaignForm({ ...campaignForm, ends_at: e.target.value })} /></label>
                  <label>Maximum deliveries<input type="number" min="1" value={campaignForm.max_deliveries} onChange={(e) => setCampaignForm({ ...campaignForm, max_deliveries: e.target.value })} placeholder="Unlimited" /></label>
                  <label>Budget reference<input type="number" min="0" step="0.01" value={campaignForm.budget} onChange={(e) => setCampaignForm({ ...campaignForm, budget: e.target.value })} /></label>
                  <label>Currency<select value={campaignForm.currency} onChange={(e) => setCampaignForm({ ...campaignForm, currency: e.target.value })}><option>MAD</option><option>USD</option><option>EUR</option></select></label>
                  <label>Priority<input type="number" min="0" max="10000" value={campaignForm.priority} onChange={(e) => setCampaignForm({ ...campaignForm, priority: e.target.value })} /></label>
                  <button className="monetization-primary" disabled={saving || !providers.length || !bots.length}>{campaignEditId ? "Update draft campaign" : "Create draft campaign"}</button>
                  {campaignEditId && <button type="button" className="monetization-secondary" onClick={() => setCampaignEditId("")}>Cancel edit</button>}
                </form>
                <div className="monetization-table-wrap"><table><thead><tr><th>Campaign</th><th>Channel / format</th><th>Provider</th><th>Schedule</th><th>Status</th><th>Actions</th></tr></thead><tbody>{campaigns.map((item) => <tr key={item.id}><td>{item.name}</td><td>{item.channel} / {item.format}</td><td>{providers.find((p) => p.id === item.provider_id)?.name || "—"}</td><td>{dateLabel(item.starts_at)} → {dateLabel(item.ends_at)}</td><td>{item.status}</td><td className="monetization-actions">
                  {["draft", "paused"].includes(item.status) && <button type="button" className="monetization-secondary" onClick={() => editCampaign(item)}>Edit</button>}
                  <button type="button" className="monetization-secondary" onClick={() => loadCampaignPlacements(item.id)}>Placements</button>
                  {item.status === "draft" && <button type="button" className="monetization-secondary" onClick={() => changeCampaignStatus(item, item.starts_at && new Date(item.starts_at) > new Date() ? "scheduled" : "active")}>Activate / Schedule</button>}
                  {item.status === "scheduled" && <button type="button" className="monetization-secondary" onClick={() => changeCampaignStatus(item, "paused")}>Pause</button>}
                  {item.status === "active" && <button type="button" className="monetization-secondary" onClick={() => changeCampaignStatus(item, "paused")}>Pause</button>}
                  {item.status === "paused" && <button type="button" className="monetization-secondary" onClick={() => changeCampaignStatus(item, item.starts_at && new Date(item.starts_at) > new Date() ? "scheduled" : "active")}>Resume</button>}
                  </td></tr>)}{!campaigns.length && <tr><td colSpan="6">No campaigns created.</td></tr>}</tbody></table></div>
                {selectedCampaign && <div className="monetization-placement-linker"><h4>Campaign placement assignment</h4><p>Selected campaign: {campaigns.find((c) => c.id === selectedCampaign)?.name || selectedCampaign}</p><div className="monetization-inline-search"><select value={selectedPlacement} onChange={(e) => setSelectedPlacement(e.target.value)}><option value="">Choose compatible placement</option>{placements.filter((p) => p.channel === campaigns.find((c) => c.id === selectedCampaign)?.channel && p.format === campaigns.find((c) => c.id === selectedCampaign)?.format).map((p) => <option key={p.id} value={p.id}>{p.page_key} · {p.slot_key} · {p.is_enabled ? "Enabled" : "Off"}</option>)}</select><button type="button" className="monetization-primary" disabled={!selectedPlacement || saving} onClick={linkPlacement}>Assign placement</button></div><ul>{campaignLinks.map((link) => <li key={link.placement_id}>{placements.find((p) => p.id === link.placement_id)?.slot_key || link.placement_id}</li>)}</ul></div>}
              </section>
            </div>
          )}

          {module === "transactions" && (
            <div className="monetization-stack">
              <section className="monetization-panel">
                <h3>Record external ad revenue</h3>
                <p className="monetization-muted">سجل غير المبالغ المؤكدة من تقرير المزود أو المبالغ اليدوية. المشاهدات والإرسال ماشي إيرادات.</p>
                <form className="monetization-form" onSubmit={saveRevenue}>
                  <label>Amount<input type="number" min="0.01" step="0.01" value={revenueForm.amount} onChange={(e) => setRevenueForm({ ...revenueForm, amount: e.target.value })} required /></label>
                  <label>Currency<select value={revenueForm.currency} onChange={(e) => setRevenueForm({ ...revenueForm, currency: e.target.value })}><option>MAD</option><option>USD</option><option>EUR</option></select></label>
                  <label>Event type<input value={revenueForm.event_type} onChange={(e) => setRevenueForm({ ...revenueForm, event_type: e.target.value })} required /></label>
                  <label>External reference<input value={revenueForm.external_reference} onChange={(e) => setRevenueForm({ ...revenueForm, external_reference: e.target.value })} /></label>
                  <label>Campaign<select value={revenueForm.campaign_id} onChange={(e) => setRevenueForm({ ...revenueForm, campaign_id: e.target.value })}><option value="">No campaign reference</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                  <button className="monetization-primary" disabled={saving}>Add ledger entry</button>
                </form>
              </section>
              <section className="monetization-panel">
                <div className="monetization-panel-title"><div><h3>Transactions ledger</h3><p>Append-only records; corrections create linked debit entries.</p></div><span>{transactions.total || 0} entries</span></div>
                <div className="monetization-table-wrap"><table><thead><tr><th>Date</th><th>Source / event</th><th>Amount</th><th>Provenance</th><th>Entry</th><th>Reconciliation</th><th></th></tr></thead><tbody>{(transactions.items || []).map((item) => <tr key={item.id}><td>{dateLabel(item.occurred_at)}</td><td>{item.revenue_source} · {item.event_type}</td><td>{item.direction === "debit" ? "−" : "+"}{money(item.amount, item.currency)}</td><td>{item.provenance}</td><td>{item.entry_type}</td><td>{item.reconciliation_status}</td><td>{item.entry_type !== "reversal" && item.direction !== "debit" && <button type="button" className="monetization-secondary" onClick={() => reverseTransaction(item)}>Reverse</button>}</td></tr>)}{!transactions.items?.length && <tr><td colSpan="7">No revenue entries yet.</td></tr>}</tbody></table></div>
              </section>
            </div>
          )}
        </>
      )}
    </section>
  );
}
