import { getSupabase } from "../lib/supabase.js";

const ASSIGNABLE_ROLES = new Set(["manager", "content_manager"]);

export function normalizeAdminEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function isAssignableAdminRole(role) {
  return Boolean(role && ASSIGNABLE_ROLES.has(role.name));
}

async function getRoleById(supabase, roleId) {
  const { data, error } = await supabase
    .from("roles")
    .select("id, name, description, is_system_role")
    .eq("id", roleId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getAdminRoles(env) {
  const { data, error } = await getSupabase(env)
    .from("roles")
    .select("id, name, description, is_system_role")
    .in("name", [...ASSIGNABLE_ROLES])
    .order("name");
  if (error) throw error;
  return data || [];
}

export async function getAdmins(env) {
  const supabase = getSupabase(env);
  const [{ data: profiles, error: profilesError }, { data: roles, error: rolesError }, { data: authUsers, error: usersError }] = await Promise.all([
    supabase.from("admin_profiles")
      .select("id, display_name, avatar_url, is_active, created_at, updated_at")
      .order("created_at", { ascending: true }),
    supabase.from("admin_roles")
      .select("admin_id, roles(id, name, description, is_system_role)"),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  ]);

  if (profilesError) throw profilesError;
  if (rolesError) throw rolesError;
  if (usersError) throw usersError;

  const usersById = new Map((authUsers?.users || []).map((user) => [user.id, user]));
  const rolesByAdmin = new Map();
  for (const item of roles || []) {
    const current = rolesByAdmin.get(item.admin_id) || [];
    if (item.roles) current.push(item.roles);
    rolesByAdmin.set(item.admin_id, current);
  }

  return (profiles || []).map((profile) => {
    const authUser = usersById.get(profile.id);
    return {
      ...profile,
      email: authUser?.email || null,
      invited_at: authUser?.invited_at || null,
      last_sign_in_at: authUser?.last_sign_in_at || null,
      roles: rolesByAdmin.get(profile.id) || [],
      is_owner: (rolesByAdmin.get(profile.id) || []).some((role) => role.name === "owner")
    };
  });
}

export async function inviteAdmin(env, body) {
  const supabase = getSupabase(env);
  const email = normalizeAdminEmail(body?.email);
  const displayName = String(body?.display_name || "").trim();
  const roleId = String(body?.role_id || "").trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid email address is required");
  }
  if (!roleId) throw new Error("An administrator role is required");
  if (displayName.length > 100) throw new Error("Display name must be 100 characters or fewer");

  const role = await getRoleById(supabase, roleId);
  if (!isAssignableAdminRole(role)) {
    throw new Error("Only Manager and Content Manager roles can be assigned");
  }

  const { data: invitation, error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { display_name: displayName || email.split("@")[0] }
  });
  if (inviteError) throw inviteError;

  const invitedUserId = invitation?.user?.id;
  if (!invitedUserId) {
    throw new Error("Supabase did not return the invited user identity");
  }

  try {
    const { error: profileError } = await supabase
      .from("admin_profiles")
      .insert({
        id: invitedUserId,
        display_name: displayName || email.split("@")[0],
        is_active: true
      });
    if (profileError) throw profileError;

    const { error: roleError } = await supabase
      .from("admin_roles")
      .insert({ admin_id: invitedUserId, role_id: role.id });
    if (roleError) throw roleError;
  } catch (error) {
    await supabase.from("admin_profiles").delete().eq("id", invitedUserId);
    await supabase.auth.admin.deleteUser(invitedUserId);
    throw error;
  }

  return {
    id: invitedUserId,
    email,
    display_name: displayName || email.split("@")[0],
    role: { id: role.id, name: role.name },
    invitation_sent: true
  };
}

export async function updateAdmin(env, id, body, actorId) {
  if (!id) throw new Error("Administrator id is required");
  if (id === actorId && body?.is_active === false) {
    throw new Error("You cannot deactivate your own administrator account");
  }

  const supabase = getSupabase(env);
  const { data: profile, error: profileError } = await supabase
    .from("admin_profiles")
    .select("id, is_active")
    .eq("id", id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile) throw new Error("Administrator not found");

  const { data: currentRoles, error: currentRolesError } = await supabase
    .from("admin_roles")
    .select("roles(name)")
    .eq("admin_id", id);
  if (currentRolesError) throw currentRolesError;
  if ((currentRoles || []).some((item) => item.roles?.name === "owner")) {
    throw new Error("The FINDLY Owner account is protected and cannot be modified here");
  }

  const updates = {};
  if (typeof body?.is_active === "boolean") updates.is_active = body.is_active;
  if (typeof body?.display_name === "string") {
    const displayName = body.display_name.trim();
    if (!displayName || displayName.length > 100) {
      throw new Error("Display name must contain 1 to 100 characters");
    }
    updates.display_name = displayName;
  }

  if (Object.keys(updates).length) {
    const { error } = await supabase.from("admin_profiles").update(updates).eq("id", id);
    if (error) throw error;
  }

  if (body?.role_id) {
    const role = await getRoleById(supabase, String(body.role_id));
    if (!isAssignableAdminRole(role)) {
      throw new Error("Only Manager and Content Manager roles can be assigned");
    }

    const { error: upsertError } = await supabase
      .from("admin_roles")
      .upsert({ admin_id: id, role_id: role.id }, { onConflict: "admin_id,role_id" });
    if (upsertError) throw upsertError;

    const { error: removeError } = await supabase
      .from("admin_roles")
      .delete()
      .eq("admin_id", id)
      .neq("role_id", role.id);
    if (removeError) throw removeError;
  }

  return { id, ...updates, role_id: body?.role_id || null };
}
