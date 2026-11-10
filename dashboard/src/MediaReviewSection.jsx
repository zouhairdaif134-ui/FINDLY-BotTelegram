import { useEffect, useState } from "react";
import "./media-review-section.css";

const STATUS_LABELS = {
  pending_review: "قيد المراجعة",
  active: "مفعّل",
  inactive: "متوقف",
  rejected: "مرفوض"
};

const RIGHTS_LABELS = {
  unverified: "غير متحققة",
  authorized: "تم التحقق",
  not_authorized: "غير مصرح بالتوزيع"
};

function formatFileSize(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "غير متوفر";
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(2) + " GB";
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(1) + " MB";
  return Math.round(bytes / 1024) + " KB";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("ar-MA");
}

export default function MediaReviewSection({ fetchApi }) {
  const [assets, setAssets] = useState([]);
  const [storageChannel, setStorageChannel] = useState(null);
  const [channelInput, setChannelInput] = useState("");
  const [testedChannel, setTestedChannel] = useState(null);
  const [statusFilter, setStatusFilter] = useState("pending_review");
  const [loading, setLoading] = useState(true);
  const [channelLoading, setChannelLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [savingChannel, setSavingChannel] = useState(false);
  const [actionId, setActionId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadChannel() {
    try {
      setChannelLoading(true);
      const result = await fetchApi("/api/media/storage-channel");
      setStorageChannel(result || null);
      setChannelInput(result?.active_storage_chat_id || "");
      setTestedChannel(null);
    } catch (e) {
      setError(e.message || "تعذر تحميل إعدادات قناة التخزين.");
    } finally {
      setChannelLoading(false);
    }
  }

  async function loadAssets() {
    try {
      setLoading(true);
      setError("");
      const result = await fetchApi("/api/media/assets?status=" + encodeURIComponent(statusFilter));
      setAssets(Array.isArray(result) ? result : []);
    } catch (e) {
      setError(e.message || "تعذر تحميل ملفات الوسائط.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadChannel(); }, []);
  useEffect(() => { loadAssets(); }, [statusFilter]);

  async function testConnection() {
    if (!channelInput.trim()) {
      setError("أدخل معرّف القناة أو اسمها أولاً.");
      return;
    }
    try {
      setTesting(true);
      setError("");
      setNotice("");
      const result = await fetchApi("/api/media/storage-channel/test", {
        method: "POST",
        body: JSON.stringify({ chat_id: channelInput.trim() })
      });
      setTestedChannel(result);
      setChannelInput(result.chat_id);
      setNotice("نجح الاتصال. تم التحقق من هوية Watch Bot وصلاحية المشرف واستقبال منشورات القناة.");
    } catch (e) {
      setTestedChannel(null);
      setError(e.message || "فشل اختبار الاتصال بالقناة.");
    } finally {
      setTesting(false);
    }
  }

  async function saveChannel() {
    if (!testedChannel || testedChannel.chat_id !== channelInput.trim()) {
      setError("اختبر الاتصال بالقناة قبل حفظها.");
      return;
    }
    const currentId = storageChannel?.active_storage_chat_id || "";
    const changing = Boolean(currentId && currentId !== testedChannel.chat_id);
    if (changing && !window.confirm("هل تؤكد تغيير قناة التخزين النشطة؟ الملفات القديمة ستبقى مرتبطة بقنواتها الأصلية، ولن يتم نقلها.")) return;

    try {
      setSavingChannel(true);
      setError("");
      const result = await fetchApi("/api/media/storage-channel", {
        method: "PUT",
        body: JSON.stringify({
          chat_id: testedChannel.chat_id,
          confirm_change: changing
        })
      });
      setStorageChannel(result);
      setChannelInput(result.active_storage_chat_id || "");
      setTestedChannel(null);
      setNotice(result.audit_logged === false
        ? "تم حفظ القناة، لكن تعذر تسجيل العملية في سجل النشاط."
        : "تم حفظ قناة التخزين النشطة بنجاح.");
    } catch (e) {
      setError(e.message || "تعذر حفظ قناة التخزين.");
    } finally {
      setSavingChannel(false);
    }
  }

  async function reviewAsset(asset, action) {
    const prompts = {
      reject: "هل تؤكد رفض هذا الملف؟ سيبقى مرجع الملف محفوظاً ولن يتم حذفه من Telegram.",
      deactivate: "هل تؤكد إيقاف هذه النسخة عن المشاهدة؟ لن يتم حذف الملف من Telegram."
    };
    if (prompts[action] && !window.confirm(prompts[action])) return;

    try {
      setActionId(asset.id);
      setError("");
      const result = await fetchApi("/api/media/assets/" + asset.id + "/" + action, {
        method: "POST",
        body: JSON.stringify({})
      });
      setNotice(result.audit_logged === false
        ? "تم تحديث حالة الملف، لكن تعذر تسجيل العملية في سجل النشاط."
        : action === "approve" ? "تمت الموافقة على الملف وتفعيله."
          : action === "reject" ? "تم رفض الملف مع الاحتفاظ بمرجعه."
            : "تم إيقاف النسخة دون حذفها من Telegram.");
      await loadAssets();
    } catch (e) {
      setError(e.message || "تعذر تحديث حالة الملف.");
    } finally {
      setActionId("");
    }
  }

  async function updateRights(asset, status) {
    const title = asset.movie_titles?.title || "هذا العنوان";
    const prompt = status === "authorized"
      ? "هل تؤكد أنك تحققت من امتلاك FINDLY لحقوق توزيع «" + title + "»؟ بعد التأكيد يمكن إظهار خيار المشاهدة."
      : "هل تؤكد أن توزيع «" + title + "» غير مصرح به؟ سيتم إيقاف المشاهدة.";
    if (!window.confirm(prompt)) return;

    try {
      setActionId(asset.id);
      setError("");
      const result = await fetchApi("/api/media/titles/" + asset.title_id + "/rights", {
        method: "POST",
        body: JSON.stringify({ status, confirmation: true })
      });
      setNotice(result.audit_logged === false
        ? "تم تحديث حالة الحقوق، لكن تعذر تسجيل العملية في سجل النشاط."
        : status === "authorized" ? "تم تأكيد حقوق التوزيع لهذا العنوان."
          : "تم تسجيل أن التوزيع غير مصرح به.");
      await loadAssets();
    } catch (e) {
      setError(e.message || "تعذر تحديث حالة حقوق التوزيع.");
    } finally {
      setActionId("");
    }
  }

  const currentChannelTitle = storageChannel?.active_channel_title || "اسم القناة غير متوفر";
  const activeChannelId = storageChannel?.active_storage_chat_id || "لم يتم تعيين قناة";

  return (
    <section className="panel media-review-panel">
      <header className="media-review-header">
        <div>
          <span className="media-review-eyebrow">FINDLY MEDIA CONTROL</span>
          <h2>مراجعة الوسائط والتخزين</h2>
          <p>راجع الملفات الواردة من Telegram قبل تفعيلها، وتحقق من حقوق التوزيع بشكل مستقل.</p>
        </div>
        <button className="secondary-button" type="button" onClick={() => { loadChannel(); loadAssets(); }} disabled={loading || channelLoading}>
          تحديث البيانات
        </button>
      </header>

      {error && <div className="auth-error" role="alert">{error}</div>}
      {notice && <div className="auth-success" role="status">{notice}</div>}

      <section className="media-storage-card">
        <div className="media-storage-heading">
          <div>
            <h3>قناة التخزين النشطة</h3>
            <p>يستقبل النظام الملفات الجديدة من هذه القناة فقط. يجب أن يكون Watch Bot مشرفاً وأن يستقبل Webhook منشورات القناة.</p>
          </div>
          <span className="media-storage-state">{storageChannel?.active_storage_chat_id ? "مُعيّنة" : "غير مُعيّنة"}</span>
        </div>

        <div className="media-current-channel">
          <div><small>القناة الحالية</small><strong>{channelLoading ? "جارٍ التحميل..." : currentChannelTitle}</strong></div>
          <div><small>Channel ID</small><strong dir="ltr">{channelLoading ? "—" : activeChannelId}</strong></div>
        </div>

        <div className="media-channel-form">
          <label>
            <span>معرّف القناة أو اسمها</span>
            <input
              value={channelInput}
              onChange={(event) => { setChannelInput(event.target.value); setTestedChannel(null); }}
              placeholder="-1001234567890 أو @channel_name"
              dir="ltr"
            />
          </label>
          <div className="media-channel-actions">
            <button className="secondary-button" type="button" onClick={testConnection} disabled={testing || savingChannel}>
              {testing ? "جارٍ اختبار الاتصال..." : "اختبار الاتصال"}
            </button>
            <button className="primary-button" type="button" onClick={saveChannel} disabled={!testedChannel || savingChannel || testing}>
              {savingChannel ? "جارٍ الحفظ..." : "حفظ القناة النشطة"}
            </button>
          </div>
        </div>

        {testedChannel && <div className="media-channel-verified">
          <strong>تم التحقق من القناة: {testedChannel.title}</strong>
          <span>Watch Bot: @{testedChannel.bot_username} · الصلاحية: {testedChannel.bot_status} · Webhook: يستقبل منشورات القناة</span>
        </div>}

        <p className="media-storage-note">تغيير القناة لا ينقل الملفات القديمة ولا يحذفها. كل ملف يحتفظ بمرجعه الأصلي داخل Telegram.</p>
      </section>

      <section className="media-assets-section">
        <div className="media-assets-toolbar">
          <div>
            <h3>ملفات الوسائط</h3>
            <p>الملفات الجديدة تبقى قيد المراجعة حتى توافق عليها الإدارة.</p>
          </div>
          <label className="media-filter">
            <span>الحالة</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="pending_review">قيد المراجعة</option>
              <option value="active">مفعّلة</option>
              <option value="inactive">متوقفة</option>
              <option value="rejected">مرفوضة</option>
              <option value="all">جميع الملفات</option>
            </select>
          </label>
        </div>

        {loading ? <div className="media-empty-state">جارٍ تحميل ملفات الوسائط...</div> :
          !assets.length ? <div className="media-empty-state">لا توجد ملفات في هذه الحالة حالياً.</div> :
          <div className="media-assets-list">
            {assets.map((asset) => {
              const title = asset.movie_titles || {};
              const rightsStatus = title.distribution_rights_status || "unverified";
              const busy = actionId === asset.id;
              return <article className="media-asset-card" key={asset.id}>
                <div className="media-asset-topline">
                  <div>
                    <h4>{title.title || "عنوان غير معروف"}</h4>
                    <p>{title.release_year || "السنة غير محددة"} · {title.media_type === "series" ? "مسلسل" : "فيلم"}</p>
                  </div>
                  <span className={"media-asset-status status-" + asset.status}>{STATUS_LABELS[asset.status] || asset.status}</span>
                </div>

                <div className="media-asset-details">
                  <div><small>الجودة</small><strong>{asset.quality_label || "Original"}</strong></div>
                  <div><small>نوع الملف</small><strong>{asset.media_type || "—"}</strong></div>
                  <div><small>الحجم</small><strong>{formatFileSize(asset.file_size)}</strong></div>
                  <div><small>اسم الملف</small><strong dir="auto">{asset.file_name || "غير متوفر"}</strong></div>
                  <div><small>رسالة التخزين</small><strong>{asset.storage_message_id}</strong></div>
                  <div><small>تاريخ التسجيل</small><strong>{formatDate(asset.created_at)}</strong></div>
                </div>

                <div className="media-rights-row">
                  <div>
                    <small>حقوق التوزيع</small>
                    <strong className={"rights-" + rightsStatus}>{RIGHTS_LABELS[rightsStatus] || rightsStatus}</strong>
                  </div>
                  {rightsStatus === "authorized"
                    ? <button className="secondary-button" type="button" disabled={busy} onClick={() => updateRights(asset, "not_authorized")}>إلغاء اعتماد الحقوق</button>
                    : <button className="secondary-button" type="button" disabled={busy} onClick={() => updateRights(asset, "authorized")}>تأكيد حقوق التوزيع</button>}
                </div>

                {asset.status === "pending_review" && <div className="media-asset-actions">
                  <button className="primary-button" type="button" disabled={busy} onClick={() => reviewAsset(asset, "approve")}>{busy ? "جارٍ التنفيذ..." : "موافقة وتفعيل الملف"}</button>
                  <button className="danger-button" type="button" disabled={busy} onClick={() => reviewAsset(asset, "reject")}>رفض الملف</button>
                </div>}
                {asset.status === "active" && <div className="media-asset-actions">
                  <button className="secondary-button" type="button" disabled={busy} onClick={() => reviewAsset(asset, "deactivate")}>إيقاف هذه النسخة</button>
                </div>}
              </article>;
            })}
          </div>}
      </section>
    </section>
  );
}
