-- Give the pre-created least-privilege admin roles their intended permissions.
-- Owner remains the only role allowed to manage administrators.

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in (
  'bots.view',
  'categories.view',
  'categories.create',
  'categories.update',
  'menus.view',
  'menus.manage',
  'content.view',
  'content.create',
  'content.update',
  'users.view',
  'users.manage',
  'notifications.manage',
  'analytics.view'
)
where r.name = 'manager'
on conflict (role_id, permission_id) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code in (
  'bots.view',
  'categories.view',
  'categories.create',
  'categories.update',
  'content.view',
  'content.create',
  'content.update'
)
where r.name = 'content_manager'
on conflict (role_id, permission_id) do nothing;
