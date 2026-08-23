-- Favoritos por perfil de exibição.
-- Torna a lista de favoritos independente entre os perfis (cada perfil tem
-- os seus próprios títulos salvos), igual ao que já se faz com o histórico.
-- Registros antigos (sem perfil) continuam visíveis quando nenhum perfil
-- está seleccionado, e reaparecem ao voltar a esse estado.

alter table public.favorites
  add column if not exists viewer_profile_id uuid
    references public.viewer_profiles(id) on delete set null;

create index if not exists favorites_profile_idx
  on public.favorites (user_id, viewer_profile_id, created_at desc);