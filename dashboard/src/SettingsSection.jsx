import { useEffect, useState } from "react";
import "./settings-section.css";

const DEFAULTS = {
  app_name: "FINDLY",
  default_language: "ar",
  timezone: "Africa/Casablanca",
  owner_telegram_user_id: "",
  maintenance_message: "نعتذر، الخدمة متوقفة مؤقتاً بسبب أعمال الصيانة. يرجى المحاولة لاحقاً.",
  master_maintenance_enabled: false,
  watch_maintenance_enabled: false
};

export default function SettingsSection({ fetchApi }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    setNotice("");
    try {
      const result = await fetchApi("/api/system-settings");
      setSettings({ ...DEFAULTS, ...(result || {}) });
    } catch (err) {
      setError(err?.message || "تعذر تحميل إعدادات النظام.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function update(field, value) {
    setSettings((current) => ({ ...current, [field]: value }));
  }

  async function save(event) {
    event.preventDefault();
    const maintenanceWillBeEnabled =
      Boolean(settings.master_maintenance_enabled || settings.watch_maintenance_enabled);

    if (maintenanceWillBeEnabled && !window.confirm("تأكيد حفظ إعدادات الصيانة؟ سيُمنع المستخدمون العاديون من استعمال البوتات المفعّلة للصيانة.")) {
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        owner_telegram_user_id: settings.owner_telegram_user_id,
        maintenance_message: settings.maintenance_message,
        master_maintenance_enabled: settings.master_maintenance_enabled,
        watch_maintenance_enabled: settings.watch_maintenance_enabled
      };
      const result = await fetchApi("/api/system-settings", {
        method: "PUT",
        body: JSON.stringify(payload)
      });
      setSettings({ ...DEFAULTS, ...(result || {}) });
      setNotice("تم حفظ الإعدادات وتسجيل العملية في سجل النشاط.");
    } catch (err) {
      setError(err?.message || "تعذر حفظ الإعدادات.");
    } finally {
      setSaving(false);
    }
  }

  const ownerConfigured = /^\d{1,16}$/.test(String(settings.owner_telegram_user_id || ""));

  return (
    <section className="settings-admin" dir="rtl">
      <header className="settings-admin__header">
        <div>
          <span className="settings-admin__eyebrow">FINDLY · PARAMÈTRES</span>
          <h2>إعدادات النظام</h2>
          <p>التحكم في الهوية العامة، اللغة، التوقيت ووضع الصيانة للبوتين.</p>
        </div>
        <button type="button" className="settings-admin__refresh" onClick={load} disabled={loading || saving}>تحديث البيانات</button>
      </header>

      {error && <div className="settings-admin__alert settings-admin__alert--error" role="alert">{error}</div>}
      {notice && <div className="settings-admin__alert settings-admin__alert--success" role="status">{notice}</div>}

      {loading ? <div className="settings-admin__loading">جارٍ تحميل الإعدادات…</div> : (
        <form onSubmit={save}>
          <section className="settings-admin__card">
            <div className="settings-admin__card-heading">
              <div><h3>الهوية والإعدادات العامة</h3><p>القيم الأساسية المعتمدة حالياً في FINDLY.</p></div>
              <span className="settings-admin__tag">إعدادات معتمدة</span>
            </div>
            <div className="settings-admin__grid">
              <label className="settings-admin__field">
                <span>اسم المنصة</span>
                <input value="FINDLY" readOnly />
                <small>الاسم الرسمي ثابت في جميع واجهات المنصة.</small>
              </label>
              <label className="settings-admin__field">
                <span>اللغة الافتراضية</span>
                <input value="العربية الفصحى (ar)" readOnly />
                <small>لغة موحدة للمستخدمين، بدون قائمة تغيير اللغة.</small>
              </label>
              <label className="settings-admin__field">
                <span>المنطقة الزمنية</span>
                <input value="Africa/Casablanca" readOnly />
                <small>التوقيت المعتمد للمغرب.</small>
              </label>
            </div>
          </section>

          <section className="settings-admin__card">
            <div className="settings-admin__card-heading">
              <div><h3>هوية المالك على Telegram</h3><p>ضرورية للسماح للمالك باستعمال البوتين أثناء الصيانة.</p></div>
              <span className={ownerConfigured ? "settings-admin__tag settings-admin__tag--ok" : "settings-admin__tag settings-admin__tag--warning"}>{ownerConfigured ? "مُعرّف" : "غير مُعرّف"}</span>
            </div>
            <label className="settings-admin__field">
              <span>Telegram Numeric User ID</span>
              <input inputMode="numeric" pattern="[0-9]*" maxLength={16} value={settings.owner_telegram_user_id || ""} onChange={(e) => update("owner_telegram_user_id", e.target.value.replace(/\D/g, ""))} placeholder="مثال: 123456789" />
              <small>رقم الحساب فقط، وليس @username. لا يمكن تفعيل الصيانة قبل إدخاله.</small>
            </label>
          </section>

          <section className="settings-admin__card">
            <div className="settings-admin__card-heading">
              <div><h3>وضع الصيانة</h3><p>إيقاف مؤقت مستقل لكل بوت، مع إبقاء لوحة الإدارة متاحة.</p></div>
              <span className="settings-admin__tag">تأكيد مطلوب</span>
            </div>
            {!ownerConfigured && <div className="settings-admin__notice">أدخل Telegram Numeric User ID ديال المالك أولاً. مفاتيح الصيانة لن تُقبل من الخادم بدونه.</div>}
            <div className="settings-admin__maintenance-list">
              <label className="settings-admin__switch-row">
                <span><strong>Master Bot</strong><small>إيقاف خدمات البحث والكتالوج للمستخدمين العاديين.</small></span>
                <input name="master_maintenance_enabled" type="checkbox" checked={Boolean(settings.master_maintenance_enabled)} disabled={!ownerConfigured} onChange={(e) => update("master_maintenance_enabled", e.target.checked)} />
              </label>
              <label className="settings-admin__switch-row">
                <span><strong>Watch Bot</strong><small>إيقاف طلبات المشاهدة والتسليم للمستخدمين العاديين.</small></span>
                <input name="watch_maintenance_enabled" type="checkbox" checked={Boolean(settings.watch_maintenance_enabled)} disabled={!ownerConfigured} onChange={(e) => update("watch_maintenance_enabled", e.target.checked)} />
              </label>
            </div>
            <label className="settings-admin__field">
              <span>رسالة الصيانة</span>
              <textarea rows={3} maxLength={500} value={settings.maintenance_message} onChange={(e) => update("maintenance_message", e.target.value)} />
              <small>تظهر للمستخدمين عند محاولة استعمال بوت في وضع الصيانة.</small>
            </label>
            <div className="settings-admin__footer">
              <button type="submit" disabled={saving}>{saving ? "جارٍ الحفظ…" : "حفظ الإعدادات"}</button>
              <span>التغييرات لا تُطبق حتى يؤكد الخادم نجاح الحفظ.</span>
            </div>
          </section>
        </form>
      )}
    </section>
  );
}
