import { getSupabase } from "./supabase.js";

function actorId(actor) {
  const id = actor?.userId;
  if (!id) throw new Error("Authenticated administrator identity is required for audit logging");
  return id;
}

export async function recordAdminFailure(env, actor, event) {
  if (!actor?.userId) return null;
  try {
    const { data, error } = await getSupabase(env).rpc("admin_audit_record_failure", {
      p_actor_id: actor.userId,
      p_action: event.action,
      p_entity_type: event.entityType,
      p_entity_id: event.entityId || null,
      p_details: {
        failure_code: event.failureCode || "ADMIN_OPERATION_FAILED",
        failure_type: event.failureType || "Error"
      }
    });
    if (error) throw error;
    return data;
  } catch (error) {
    console.error("FINDLY audit failure record could not be saved:", {
      code: error?.code || null,
      status: error?.status || null
    });
    return null;
  }
}

export async function recordAdminMutation(env, actor, event) {
  const id = actorId(actor);
  try {
    const { data, error } = await getSupabase(env).rpc("admin_audit_mutate", {
      p_actor_id: id,
      p_action: event.action,
      p_entity_type: event.entityType,
      p_entity_id: event.entityId || null,
      p_operation: event.operation,
      p_payload: event.payload || {}
    });
    if (error) throw error;
    return data?.record ?? data;
  } catch (error) {
    await recordAdminFailure(env, actor, {
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      failureCode: error?.code || "ADMIN_MUTATION_FAILED",
      failureType: error?.name || "Error"
    });
    throw error;
  }
}

export async function recordAdminEvent(env, actor, event) {
  const id = actorId(actor);
  const { data, error } = await getSupabase(env).rpc("admin_audit_record_event", {
    p_actor_id: id,
    p_action: event.action,
    p_entity_type: event.entityType,
    p_entity_id: event.entityId || null,
    p_details: event.details || {}
  });
  if (error) throw error;
  return data;
}

export async function createAuditedAdmin(env, actor, admin) {
  const id = actorId(actor);
  try {
    const { data, error } = await getSupabase(env).rpc("admin_audit_create_admin", {
      p_actor_id: id,
      p_admin_id: admin.id,
      p_display_name: admin.displayName,
      p_role_id: admin.roleId
    });
    if (error) throw error;
    return data;
  } catch (error) {
    await recordAdminFailure(env, actor, {
      action: "admin.invite",
      entityType: "admin",
      entityId: admin.id,
      failureCode: error?.code || "ADMIN_INVITE_DB_FAILED",
      failureType: error?.name || "Error"
    });
    throw error;
  }
}

export async function updateAuditedAdmin(env, actor, admin) {
  const id = actorId(actor);
  try {
    const { data, error } = await getSupabase(env).rpc("admin_audit_update_admin", {
      p_actor_id: id,
      p_admin_id: admin.id,
      p_display_name: admin.displayName ?? null,
      p_is_active: admin.isActive ?? null,
      p_role_id: admin.roleId ?? null
    });
    if (error) throw error;
    return data;
  } catch (error) {
    await recordAdminFailure(env, actor, {
      action: "admin.update",
      entityType: "admin",
      entityId: admin.id,
      failureCode: error?.code || "ADMIN_UPDATE_FAILED",
      failureType: error?.name || "Error"
    });
    throw error;
  }
}

export async function getActivityLogs(env, filters = {}) {
  const { data, error } = await getSupabase(env).rpc("admin_audit_list", {
    p_limit: filters.limit ?? 50,
    p_offset: filters.offset ?? 0,
    p_actor_id: filters.actorId || null,
    p_action: filters.action || null,
    p_entity_type: filters.entityType || null,
    p_result: filters.result || null,
    p_from: filters.from || null,
    p_to: filters.to || null
  });
  if (error) throw error;
  const rows = data || [];
  return {
    items: rows.map(({ total_count, ...item }) => item),
    total: Number(rows[0]?.total_count || 0),
    limit: filters.limit ?? 50,
    offset: filters.offset ?? 0
  };
}
