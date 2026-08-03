drop policy if exists "permitir insert movies" on movies;

create policy "permitir insert movies"
on movies
for insert
to anon
with check (true);
