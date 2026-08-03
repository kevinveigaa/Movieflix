create policy "permitir delete movies"
on movies
for delete
to anon
using (true);
