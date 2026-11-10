import { getActivityLogs } from "../lib/admin-audit.js";

export async function getSecurityAlerts(env) {
  const checkedAt = new Date();
  const from = new Date(checkedAt.getTime() - 60 * 60 * 1000).toISOString();
  const failures = await getActivityLogs(env, { limit: 100, offset: 0, result: "failure", from });
  const count = failures.total;
  return {
    checked_at: checkedAt.toISOString(),
    audited_admin_failures_last_hour: count,
    admin_failure_alert: count >= 5
      ? { level: "warning", message: "تم تسجيل خمس عمليات إدارية فاشلة أو أكثر خلال آخر ساعة." }
      : count > 0
        ? { level: "notice", message: "تم تسجيل عمليات إدارية فاشلة خلال آخر ساعة." }
        : { level: "clear", message: "لا توجد عمليات إدارية فاشلة مسجلة خلال آخر ساعة." },
    login_failure_monitoring: {
      status: "not_instrumented",
      message: "محاولات تسجيل الدخول المرفوضة من مزود المصادقة لا تُسجل حالياً في سجل FINDLY."
    },
    worker_error_spike_monitoring: {
      status: "not_available",
      message: "رصد ارتفاع أخطاء Worker يحتاج مصدر Observability مخصصاً؛ لا يتم تقدير الحالة من فحص الصحة."
    },
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
