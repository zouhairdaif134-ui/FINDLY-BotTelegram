import { getSupabase } from "../lib/supabase.js";
import { recordAdminMutation } from "../lib/admin-audit.js";

const FIELDS = "id, name, slug, icon, description, is_active, sort_order, settings, created_at, updated_at";

function cleanText(value) {
  return typeof value === "string" ? value.trim() : value;
}

function normalizeCategory(body = {}) {
  const category = {
    name: cleanText(body.name), slug: cleanText(body.slug),
    icon: cleanText(body.icon) || "📁", description: cleanText(body.description) || null,
    is_active: typeof body.is_active === "boolean" ? body.is_active : true,
    sort_order: Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0,
    settings: body.settings && typeof body.settings === "object" ? body.settings : {}
  };
  if (!category.name) throw new Error("Category name is required");
  if (!category.slug) throw new Error("Category slug is required");
  return category;
}

export async function getCategories(env) {
  const { data, error } = await getSupabase(env).from("categories").select(FIELDS)
    .order("sort_order", { ascending: true }).order("name", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createCategory(env, body, actor) {
  return recordAdminMutation(env, actor, {
    action: "category.create", entityType: "category", operation: "create", payload: normalizeCategory(body)
  });
}

export async function updateCategory(env, id, body, actor) {
  if (!id) throw new Error("Category id is required");
  const allowed = ["name","slug","icon","description","is_active","sort_order","settings"];
  const updates = {};
  for (const key of allowed) if (body?.[key] !== undefined) updates[key] = body[key];
  if (updates.name !== undefined) {
    updates.name = cleanText(updates.name);
    if (!updates.name) throw new Error("Category name cannot be empty");
  }
  if (updates.slug !== undefined) {
    updates.slug = cleanText(updates.slug);
    if (!updates.slug) throw new Error("Category slug cannot be empty");
  }
  if (updates.description !== undefined) updates.description = cleanText(updates.description) || null;
  if (updates.icon !== undefined) updates.icon = cleanText(updates.icon) || "📁";
  if (updates.sort_order !== undefined) {
    updates.sort_order = Number(updates.sort_order);
    if (!Number.isFinite(updates.sort_order)) updates.sort_order = 0;
  }
  if (!Object.keys(updates).length) throw new Error("No fields to update");
  const action = updates.is_active === true ? "category.activate" : updates.is_active === false ? "category.deactivate" : "category.update";
  return recordAdminMutation(env, actor, {
    action, entityType: "category", entityId: id, operation: "update", payload: updates
  });
}

export async function deleteCategory(env, id, actor) {
  return updateCategory(env, id, { is_active: false }, actor);
}
