-- Add optional long-form plot summary to the FINDLY Movies catalog.
-- Existing overview remains the short synopsis shown on the title details screen.
alter table public.movie_titles add column if not exists full_plot_summary text;
comment on column public.movie_titles.full_plot_summary is
  'Optional long-form plot summary. Only presented to Telegram users after they explicitly request the full plot.';
