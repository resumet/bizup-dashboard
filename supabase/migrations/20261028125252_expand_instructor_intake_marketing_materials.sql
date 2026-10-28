create function public.valid_instructor_intake_image_paths(value jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(value) = 'object'
    and jsonb_typeof(value -> 'evidence') = 'array'
    and jsonb_typeof(value -> 'studentResults') = 'array'
    and jsonb_typeof(value -> 'reviews') = 'array'
    and jsonb_typeof(value -> 'opportunity') = 'array'
    and jsonb_array_length(value -> 'evidence') <= 10
    and jsonb_array_length(value -> 'studentResults') <= 10
    and jsonb_array_length(value -> 'reviews') <= 10
    and jsonb_array_length(value -> 'opportunity') <= 10;
$$;
revoke all on function public.valid_instructor_intake_image_paths(jsonb) from public, anon, authenticated;

alter table public.instructor_intakes
  add column image_paths jsonb not null
  default '{"evidence":[],"studentResults":[],"reviews":[],"opportunity":[]}'::jsonb
  check (public.valid_instructor_intake_image_paths(image_paths));

update public.instructor_intakes
set answers = jsonb_build_object(
  'courseContentIntroduction', '',
  'instructorCareer', '',
  'studentSuccessDescription', '',
  'differentiators', '',
  'webinarCoreContents', jsonb_build_array('', '', '', '', ''),
  'fieldStrengths', '',
  'recommendedAudience', '',
  'webinarBenefits', '',
  'opportunityEvidence', ''
) || answers;

alter table public.instructor_intakes alter column answers set default '{
  "courseContentIntroduction":"",
  "instructorCareer":"",
  "studentSuccessDescription":"",
  "differentiators":"",
  "webinarCoreContents":["","","","",""],
  "fieldStrengths":"",
  "recommendedAudience":"",
  "webinarBenefits":"",
  "opportunityEvidence":"",
  "instagramAccountId":"",
  "instagramAccountPassword":"",
  "blueBadge":"",
  "twoFactorSecurity":"",
  "infokLinkId":"",
  "infokLinkPassword":""
}'::jsonb;

create table public.instructor_intake_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  examples jsonb not null check (jsonb_typeof(examples) = 'object'),
  example_image_paths jsonb not null
    default '{"evidence":[],"studentResults":[],"reviews":[],"opportunity":[]}'::jsonb
    check (public.valid_instructor_intake_image_paths(example_image_paths)),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index instructor_intake_settings_updated_by_idx
  on public.instructor_intake_settings(updated_by)
  where updated_by is not null;

alter table public.instructor_intake_settings enable row level security;
revoke all on public.instructor_intake_settings from anon, authenticated;
grant select on public.instructor_intake_settings to authenticated;
grant all on public.instructor_intake_settings to service_role;
create policy instructor_intake_settings_member_read
  on public.instructor_intake_settings
  for select to authenticated
  using (public.is_workspace_member(workspace_id));

create function public.touch_instructor_intake_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$;
revoke all on function public.touch_instructor_intake_settings() from public, anon, authenticated;
create trigger touch_instructor_intake_settings
  before update on public.instructor_intake_settings
  for each row execute function public.touch_instructor_intake_settings();
