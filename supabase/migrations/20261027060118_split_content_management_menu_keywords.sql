update public.dashboard_menu_search_settings
set keywords =
  (keywords - '/services/content-management')
  || jsonb_build_object(
    '/services/instagram-management',
    coalesce(keywords -> '/services/instagram-management', '[]'::jsonb)
      || coalesce(keywords -> '/services/content-management', '[]'::jsonb),
    '/services/youtube-management',
    coalesce(keywords -> '/services/youtube-management', '[]'::jsonb)
      || coalesce(keywords -> '/services/content-management', '[]'::jsonb)
  ),
  updated_at = now()
where keywords ? '/services/content-management';
