-- Sem esta policy o painel admin "salva" sem erro, mas o UPDATE nao altera
-- nenhuma linha (RLS filtra tudo) e as categorias novas somem ao recarregar.
drop policy if exists "permitir update movies" on movies;

create policy "permitir update movies"
on movies
for update
to anon
using (true)
with check (true);
