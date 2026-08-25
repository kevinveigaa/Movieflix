import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Check, Film, Baby, Users } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useViewerProfiles } from '@/hooks/useViewerProfiles';
import { ProfileFormModal } from '@/components/profile/ProfileFormModal';
import { PROFILE_AVATARS } from '@/lib/avatars';
import type { ViewerProfile } from '@/types';

export function ProfileSelectPage() {
  const { user, loading, setActiveViewerProfile, activeViewerProfile } = useAuth();
  const { entitlements } = useEntitlements();
  const navigate = useNavigate();
  const { profiles, loading: loadingProfiles, create, update, remove } = useViewerProfiles();
  const [editing, setEditing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ViewerProfile | null>(null);
  const autoOpened = useRef(false);

  const maxProfiles = entitlements.maxProfiles;
  const remaining = Math.max(0, maxProfiles - profiles.length);

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [loading, user, navigate]);

  useEffect(() => {
    // Usuário novo sem perfis: já abre o modal de criação do primeiro perfil
    // (apenas uma vez por visita para não "prender" quem fecha o modal).
    if (user && !loading && profiles.length === 0 && !loadingProfiles && !autoOpened.current) {
      autoOpened.current = true;
      setModalOpen(true);
    }
  }, [user, loading, profiles.length, loadingProfiles]);

  function selectProfile(p: ViewerProfile) {
    setActiveViewerProfile(p);
    navigate('/');
  }

  function openCreate() {
    if (profiles.length >= maxProfiles) return;
    setEditingProfile(null);
    setModalOpen(true);
  }

  function openEdit(p: ViewerProfile) {
    setEditingProfile(p);
    setModalOpen(true);
  }

  async function handleSubmit(input: { name: string; avatar: string; is_kid: boolean }) {
    if (editingProfile) {
      const res = await update(editingProfile.id, input);
      if (res.error) throw new Error(res.error);
    } else {
      const res = await create(input);
      if (res.error) throw new Error(res.error);
      // Primeiro perfil criado logo após o cadastro: seleciona e vai para a
      // Home. (Nenhuma assinatura é exigida — o usuário pode navegar pelo
      // catálogo e assinar quando quiser.)
      if (profiles.length === 0) {
        try {
          const { data } = await supabase
            .from('viewer_profiles')
            .select('*')
            .eq('owner_id', user?.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (data) {
            setActiveViewerProfile(data as ViewerProfile);
            navigate('/');
          }
        } catch {
          // Falha ao buscar: segue para a tela de perfis normalmente.
        }
      }
    }
  }

  async function handleRemove(p: ViewerProfile) {
    if (!window.confirm(`Excluir o perfil "${p.name}"?`)) return;
    const res = await remove(p.id);
    if (res.error) {
      alert(res.error);
      return;
    }
    if (activeViewerProfile?.id === p.id) setActiveViewerProfile(null);
  }

  if (loading || loadingProfiles) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-950">
        <p className="text-ink-400">Carregando perfis</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-950 px-4 py-12">
      <Link to="/" className="mb-8 flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-600 text-white">
          <Film className="h-5 w-5" />
        </span>
        <span className="font-display text-2xl tracking-wide text-white">MOVIEFLIX</span>
      </Link>

      <h1 className="text-center text-3xl font-bold text-white sm:text-4xl">
        {editing ? 'Gerenciar perfis' : 'Quem está assistindo?'}
      </h1>

      <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-400">
        <Users className="h-4 w-4" />
        {profiles.length}/{maxProfiles} perfis {remaining > 0 ? `• ${remaining} restante${remaining === 1 ? '' : 's'}` : '• limite do plano atingido'}
      </p>

      <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
        {profiles.map((p) => (
          <div key={p.id} className="group flex flex-col items-center gap-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => !editing && selectProfile(p)}
                className="block w-full cursor-pointer"
              >
                <div className={`relative h-28 w-28 overflow-hidden rounded-2xl border-2 bg-ink-800 transition sm:h-32 sm:w-32 ${
                  p.is_kid
                    ? 'border-amber-400/40 group-hover:border-amber-400'
                    : 'border-transparent group-hover:border-brand-500'
                }`}>
                  <img src={p.avatar_url} alt={p.name} className="h-full w-full object-cover" />
                  {p.is_kid && (
                    <div className="absolute inset-x-0 bottom-0 flex justify-center pb-2">
                      <span className="flex items-center gap-1 rounded-full bg-amber-400/90 px-2 py-0.5 text-[10px] font-bold text-black">
                        <Baby className="h-3 w-3" /> Infantil
                      </span>
                    </div>
                  )}
                </div>
              </button>
              {editing && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-2xl bg-black/60">
                  <button onClick={() => openEdit(p)} className="rounded-full bg-white/15 p-2 text-white hover:bg-white/25">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => handleRemove(p)} className="rounded-full bg-red-600/80 p-2 text-white hover:bg-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            <span className="max-w-[8rem] truncate text-sm font-medium text-ink-200">{p.name}</span>
          </div>
        ))}

        {profiles.length < maxProfiles && !editing && (
          <button onClick={openCreate} className="group flex flex-col items-center gap-3">
            <div className="flex h-28 w-28 items-center justify-center rounded-2xl border-2 border-dashed border-white/15 bg-ink-800/40 text-ink-400 transition hover:border-brand-500 hover:text-brand-400 sm:h-32 sm:w-32">
              <Plus className="h-10 w-10" />
            </div>
            <span className="text-sm font-medium text-ink-400 group-hover:text-white">Adicionar perfil</span>
          </button>
        )}
      </div>

      <div className="mt-12">
        {editing ? (
          <button onClick={() => setEditing(false)} className="btn-primary">
            <Check className="h-4 w-4" /> Concluir
          </button>
        ) : (
          <button onClick={() => setEditing(true)} className="btn-outline">
            <Pencil className="h-4 w-4" /> Gerenciar perfis
          </button>
        )}
      </div>

      <ProfileFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editingProfile}
        defaultName={!editingProfile ? localStorage.getItem('mf_signup_name') ?? undefined : undefined}
        onSubmit={handleSubmit}
      />

      {/* Pré-carrega os avatares para não piscar na seleção */}
      <div className="hidden">
        {PROFILE_AVATARS.map((a) => <img key={a} src={a} alt="" />)}
      </div>
    </div>
  );
}
