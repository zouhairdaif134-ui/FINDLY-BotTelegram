import { getSupabase } from "./supabase.js";
import { sendMessage } from "./telegram.js";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatJobMessage(job) {
  const lines = [
    "💼 <b>فرصة شغل جديدة</b>",
    "",
    "<b>" + escapeHtml(job.title) + "</b>"
  ];

  if (job.company) {
    lines.push("🏢 " + escapeHtml(job.company));
  }

  if (job.location_text) {
    lines.push("📍 " + escapeHtml(job.location_text));
  }

  if (job.employment_type) {
    lines.push("🧾 " + escapeHtml(job.employment_type));
  }

  if (job.source_url) {
    lines.push(
      "",
      '<a href="' + escapeHtml(job.source_url) + '">🔗 المصدر والتفاصيل</a>'
    );
  }

  return lines.join("\n");
}

async function loadRecentlyCreatedJobs(env) {
  const supabase = getSupabase(env);
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id, title, company, location_text, city, region, target_region, description, employment_type, source_url, created_at"
    )
    .eq("status", "active")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) throw error;

  return data || [];
}

async function queueChannelPublications(env, jobs) {
  const channelId = env.FINDLY_JOBS_CHANNEL_CHAT_ID
    ? String(env.FINDLY_JOBS_CHANNEL_CHAT_ID)
    : null;

  if (!channelId || !jobs.length) return 0;

  const supabase = getSupabase(env);

  const rows = jobs.map((job) => ({
    job_id: job.id,
    destination_type: "channel",
    destination_id: channelId,
    status: "pending"
  }));

  const { error } = await supabase
    .from("job_publications")
    .upsert(rows, {
      onConflict: "job_id,destination_type,destination_id",
      ignoreDuplicates: true
    });

  if (error) throw error;

  return rows.length;
}

async function queueUserNotifications(env, jobs) {
  if (!jobs.length) return 0;

  const supabase = getSupabase(env);

  const { data: subscriptions, error } = await supabase
    .from("job_notification_subscriptions")
    .select("user_id, city, region, keywords")
    .eq("enabled", true);

  if (error) throw error;

  const userIds = [...new Set((subscriptions || []).map((subscription) => subscription.user_id).filter(Boolean))];
  const { data: telegramUsers, error: telegramUsersError } = userIds.length
    ? await supabase
        .from("telegram_users")
        .select("id, telegram_user_id")
        .in("id", userIds)
    : { data: [], error: null };

  if (telegramUsersError) throw telegramUsersError;

  const telegramIdByUserId = new Map(
    (telegramUsers || [])
      .filter((user) => user?.id && user?.telegram_user_id)
      .map((user) => [user.id, String(user.telegram_user_id)])
  );

  const rows = [];

  for (const job of jobs) {
    const searchable = (
      (job.title || "") +
      " " +
      (job.description || "")
    ).toLowerCase();

    for (const subscription of subscriptions || []) {
      const city = String(subscription.city || "").trim().toLowerCase();
      const region = String(subscription.region || "").trim().toLowerCase();
      const keywords = Array.isArray(subscription.keywords)
        ? subscription.keywords.filter(Boolean)
        : [];

      const cityMatches =
        !city ||
        String(job.city || "").toLowerCase() === city ||
        String(job.location_text || "").toLowerCase().includes(city);

      const regionMatches =
        !region ||
        String(job.target_region || job.region || "")
          .toLowerCase() === region;

      const keywordMatches =
        keywords.length === 0 ||
        keywords.some((keyword) =>
          searchable.includes(String(keyword).toLowerCase())
        );

      const telegramUserId = telegramIdByUserId.get(subscription.user_id);

      if (cityMatches && regionMatches && keywordMatches && telegramUserId) {
        rows.push({
          job_id: job.id,
          destination_type: "user",
          destination_id: telegramUserId,
          status: "pending"
        });
      }
    }
  }

  if (!rows.length) return 0;

  const { error: insertError } = await supabase
    .from("job_publications")
    .upsert(rows, {
      onConflict: "job_id,destination_type,destination_id",
      ignoreDuplicates: true
    });

  if (insertError) throw insertError;

  return rows.length;
}

async function publishPending(env, destinationType, destinationId, limit) {
  const supabase = getSupabase(env);

  let query = supabase
    .from("job_publications")
    .select("id, job_id, destination_id, attempts")
    .eq("status", "pending")
    .eq("destination_type", destinationType)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (destinationId) {
    query = query.eq("destination_id", destinationId);
  }

  const { data: pending, error } = await query;

  if (error) throw error;

  let sent = 0;
  let failed = 0;

  for (const publication of pending || []) {
    const { data: job, error: jobError } = await supabase
      .from("jobs")
      .select(
        "id, title, company, location_text, employment_type, source_url"
      )
      .eq("id", publication.job_id)
      .maybeSingle();

    if (jobError) throw jobError;

    if (!job) {
      await supabase
        .from("job_publications")
        .update({
          status: "skipped",
          attempts: publication.attempts + 1,
          last_attempt_at: new Date().toISOString(),
          error_message: "Job no longer exists"
        })
        .eq("id", publication.id);
      continue;
    }

    const attemptAt = new Date().toISOString();

    try {
      const result = await sendMessage(
        env,
        "findly",
        publication.destination_id,
        formatJobMessage(job)
      );

      await supabase
        .from("job_publications")
        .update({
          status: "sent",
          telegram_message_id: result?.message_id || null,
          attempts: publication.attempts + 1,
          last_attempt_at: attemptAt,
          sent_at: new Date().toISOString(),
          error_message: null
        })
        .eq("id", publication.id);

      sent += 1;
    } catch (error) {
      await supabase
        .from("job_publications")
        .update({
          status: "failed",
          attempts: publication.attempts + 1,
          last_attempt_at: attemptAt,
          error_message: String(
            error?.message || "Telegram delivery failed"
          ).slice(0, 1000)
        })
        .eq("id", publication.id);

      failed += 1;

      console.error("FINDLY jobs delivery failed:", {
        publicationId: publication.id,
        jobId: job.id,
        destinationType,
        destinationId: publication.destination_id,
        message: error?.message || "Unknown error"
      });
    }
  }

  return {
    attempted: (pending || []).length,
    sent,
    failed
  };
}

export async function runJobsDelivery(env) {
  const jobs = await loadRecentlyCreatedJobs(env);

  if (!jobs.length) {
    return {
      jobs: 0,
      queuedChannel: 0,
      queuedUsers: 0,
      channel: { attempted: 0, sent: 0, failed: 0 },
      users: { attempted: 0, sent: 0, failed: 0 }
    };
  }

  const queuedChannel = await queueChannelPublications(env, jobs);
  const queuedUsers = await queueUserNotifications(env, jobs);

  const channelId = env.FINDLY_JOBS_CHANNEL_CHAT_ID
    ? String(env.FINDLY_JOBS_CHANNEL_CHAT_ID)
    : null;

  const channel = await publishPending(
    env,
    "channel",
    channelId,
    50
  );

  const users = await publishPending(
    env,
    "user",
    null,
    100
  );

  return {
    jobs: jobs.length,
    queuedChannel,
    queuedUsers,
    channel,
    users
  };
}
