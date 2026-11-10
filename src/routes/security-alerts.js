import { getActivityLogs } from "../lib/admin-audit.js";
import { getSupabase } from "../lib/supabase.js";

export function buildAdminFailureAlert(count) {
  if (count >= 5) return { level: "warning", message: "تم تسجيل خمس عمليات إدارية فاشلة أو أكثر خلال آخر ساعة." };
  if (count > 0) return { level: "notice", message: "تم تسجيل عمليات إدارية فاشلة خلال آخر ساعة." };
  return { level: "clear", message: "لا توجد عمليات إدارية فاشلة مسجلة خلال آخر ساعة." };
}

export async function getSecurityAlerts(env) {
  const checkedAt = new Date();
  const from = new Date(checkedAt.getTime() - 60 * 60 * 1000).toISOString();
  const failures = await getActivityLogs(env, { limit: 100, offset: 0, result: "failure", from });
  const count = failures.total;

  let workerErrors = {
    status: "not_available",
    count: null,
    message: "تعذر قراءة سجل أخطاء Worker."
  };
  try {
    const { data, error, count: total } = await getSupabase(env)
      .from("worker_error_events")
      .select("id,request_path,request_method,response_status,error_code,error_type,occurred_at", { count: "exact" })
      .gte("occurred_at", from)
      .order("occurred_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    const totalErrors = Number(total || 0);
    workerErrors = {
      status: "monitoring",
      count: totalErrors,
      level: totalErrors >= 10 ? "warning" : totalErrors > 0 ? "notice" : "clear",
      message: totalErrors >= 10
        ? "تم تسجيل 10 أخطاء API من فئة 5xx أو أكثر خلال آخر ساعة."
        : totalErrors > 0
          ? "تم تسجيل أخطاء API من فئة 5xx خلال آخر ساعة."
          : "لا توجد أخطاء API من فئة 5xx مسجلة خلال آخر ساعة.",
      recent: (data || []).slice(0, 10).map((item) => ({
        path: item.request_path,
        method: item.request_method,
        status: item.response_status,
        code: item.error_code,
        type: item.error_type,
        occurred_at: item.occurred_at
      }))
    };
  } catch {
    // A missing migration or database outage must remain visibly unavailable.
  }

  return {
    checked_at: checkedAt.toISOString(),
    audited_admin_failures_last_hour: count,
    admin_failure_alert: buildAdminFailureAlert(count),
    login_failure_monitoring: {
      status: "external_only",
      message: "تتوفر سجلات مصادقة Supabase في مصدر auth_logs، لكن قاعدة البيانات لا تخزن حالياً سجلات auth.audit_log_entries؛ لذلك لا نعرض عدداً غير موثوق داخل اللوحة."
    },
    worker_error_spike_monitoring: workerErrors,
    recent_failures: failures.items.slice(0, 10).map((item) => ({
      action: item.action,
      entity_type: item.entity_type,
      actor_name: item.actor_name,
      created_at: item.created_at,
      result: item.result
    })),
    automatic_lockout: false
  };
}
