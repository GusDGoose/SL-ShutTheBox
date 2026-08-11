-- Optional dev seed: three sample players (safe to run once after 0001).
insert into players (name, emoji, song_url) values
  ('Alice',   '🦊', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
  ('Bob',     '🐙', 'https://youtu.be/ZbZSe6N_BXs'),
  ('Charlie', '🦄', null)
on conflict (name) do nothing;
