-- FINDLY Master Bot menu
-- The Master Bot is now the primary user-facing experience.
-- Child bots are not required for the Master menu.

do $$
declare
  v_master_bot_id uuid;
begin
  select id
    into v_master_bot_id
  from public.bots
  where slug = 'findly'
    and bot_type = 'master'
    and is_active = true
  limit 1;

  if v_master_bot_id is null then
    raise exception 'Active FINDLY master bot was not found';
  end if;

  insert into public.menu_items (
    bot_id,
    parent_id,
    label,
    icon,
    action_type,
    action_value,
    is_active,
    sort_order,
    settings
  )
  select
    v_master_bot_id,
    null,
    seed.label,
    seed.icon,
    seed.action_type,
    seed.action_value,
    true,
    seed.sort_order,
    seed.settings::jsonb
  from (
    values
      ('الأفلام والمسلسلات', '🎬', 'category', 'movies', 10, '{"requires_premium":false}'),
      ('الرياضة', '⚽', 'category', 'sports', 20, '{"requires_premium":false}'),
      ('فرص الشغل', '💼', 'category', 'jobs', 30, '{"requires_premium":false}'),
      ('المساعد الذكي', '🤖', 'ai', null, 40, '{"requires_premium":false}'),
      ('الأخبار', '📰', 'category', 'news', 50, '{"requires_premium":false}'),
      ('البحث', '🔎', 'search', null, 60, '{"requires_premium":false}'),
      ('FINDLY Premium', '💎', 'premium', null, 70, '{"requires_premium":false}'),
      ('المساعدة', 'ℹ️', 'help', null, 80, '{"requires_premium":false}')
  ) as seed(label, icon, action_type, action_value, sort_order, settings)
  where not exists (
    select 1
    from public.menu_items existing
    where existing.bot_id = v_master_bot_id
      and existing.parent_id is null
      and existing.label = seed.label
  );
end $$;

-- Global categories used by the Master menu.
insert into public.categories (name, slug, icon, description, is_active, sort_order)
select *
from (
  values
    ('الأفلام والمسلسلات', 'movies', '🎬', 'محتوى الأفلام والمسلسلات داخل FINDLY.', true, 10),
    ('الرياضة', 'sports', '⚽', 'آخر المحتوى الرياضي داخل FINDLY.', true, 20),
    ('فرص الشغل', 'jobs', '💼', 'فرص الشغل والمعلومات المهنية.', true, 30),
    ('الأخبار', 'news', '📰', 'أخبار ومحتوى مختار داخل FINDLY.', true, 40)
) as seed(name, slug, icon, description, is_active, sort_order)
where not exists (
  select 1
  from public.categories existing
  where existing.slug = seed.slug
);
