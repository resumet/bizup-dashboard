grant usage on schema notification_private to service_role;
grant execute on function notification_private.is_workspace_admin(uuid, uuid) to service_role;
