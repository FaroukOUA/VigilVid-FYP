-- Internal detection feedback storage was removed from v1.
-- The app keeps the external "Report issue" link, but no longer stores
-- user feedback rows in Supabase.
drop table if exists public.detection_feedback;
