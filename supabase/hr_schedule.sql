-- Optional Supabase pg_cron installation, executed by the database operator.
-- Run instead of an external HTTP scheduler. Job bodies contain no service keys.
create extension if not exists pg_cron;
select cron.schedule('bizup-hr-notifications', '* * * * *',
  $$select public.hr_generate_reminders(); select public.hr_process_notifications(500);$$);
-- Inspect execution: select * from cron.job_run_details order by start_time desc limit 20;
-- Pause without deleting HR data: select cron.unschedule('bizup-hr-notifications');
