import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Check, X, Film, Baby } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import type { ViewerProfile } from '@/types';
import { Modal } from '@/components/ui/Modal';

const AVATARS = [
  'https://api.dicebear.com/7.x/thumbs/svg?seed=1&backgroundColor=ff2d2d',
  'https://api.dicebear.com/7.x/thumbs/svg?seed=2&backgroundColor=171717',
  'https://api.dicebear.com/7.x/thumbs/svg?seed=3&backgroundColor=0ea5e9',
  'https://api.dicebear.com/7.x/thumbs/svg?seed=4&backgroundColor=16a34a',
  'https://api.dicebear.com/7.x/thumbs/svg?seed=5&backgroundColor=f59e0b',
  'https://api.dicebear.com/7.x/thumbs/svg?seed=6&backgroundColor=a855f7',
];

export function ProfileSelectPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<ViewerProfile[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(true);
  const [editing, setEditing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProfile, setEditingProfile] = useState<ViewerProfile | null>(null);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [isKid, setIsKid] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate('/login');
  }, [loading, user, navigate]);

  useEffect(() => {
    if (user) loadProfiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadProfiles() {
    if (!user) return;
    setLoadingProfiles(true);
    const { data } = await supabase.from('viewer_profiles').select('*').eq('owner_id', user.id).order('created_at');
    setProfiles((data as ViewerProfile[]) ?? []);
    setLoadingProfiles(false);
  }

  function openCreate() {
    if (profiles.length >= 4) return;
    setEditingProfile(null);
    setName('');
    setAvatar(AVATARS[profiles.length] ?? AVATARS[0]);
    setIsKid(false);
    setModalOpen(true);
  }

  function openEdit(p: ViewerProfile) {
    setEditingProfile(p);
    setName(p.name);
    setAvatar(p.avatar_url || AVATARS[0]);
    setIsKid(p.is_kid);
    setModalOpen(true);
  }

  async function save() {
    if (!user || !name.trim()) return;
    if (editingProfile) {
      await supabase
        .from('viewer_profiles')
        .update({ name: name.trim(), avatar_url: avatar, is_kid: isKid })
        .eq('id', editingProfile.id);
    } else {
      await supabase.from('viewer_profiles').insert({
        owner_id: user.id,
        name: name.trim(),
        avatar_url: avatar,
        is_kid: isKid,
      });
    }
    setModalOpen(false);
    loadProfiles();
  }

  async function remove(id: string) {
    await supabase.from('viewer_profiles').delete().eq('id', id);
    loadProfiles();
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

      <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
        {profiles.map((p) => (
          <div key={p.id} className="group flex flex-col items-center gap-3">
            <div className="relative">
              <Link to="/" className="block">
                <div className="relative h-28 w-28 overflow-hidden rounded-2xl border-2 border-transparent bg-ink-800 transition group-hover:border-brand-500 sm:h-32 sm:w-32">
                  <img src={p.avatar_url} alt={p.name} className="h-full w-full object-cover" />
                </div>
                {p.is_kid && (
                  <span className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-ink-900 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                    <Baby className="h-3 w-3" /> Infantil
                  </span>
                )}
              </Link>
              {editing && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-2xl bg-black/60">
                  <button onClick={() => openEdit(p)} className="rounded-full bg-white/15 p-2 text-white hover:bg-white/25">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => remove(p.id)} className="rounded-full bg-red-600/80 p-2 text-white hover:bg-red-500">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            <span className="max-w-[8rem] truncate text-sm font-medium text-ink-200">{p.name}</span>
          </div>
        ))}

        {profiles.length < 4 && !editing && (
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} size="md">
        <div className="p-6">
          <h3 className="text-lg font-bold text-white">{editingProfile ? 'Editar perfil' : 'Novo perfil'}</h3>
          <div className="mt-5 space-y-4">
            <div>
              <span className="mb-1.5 block text-sm font-medium text-ink-200">Nome</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="Ex.: João" className="input" />
            </div>
            <div>
              <span className="mb-2 block text-sm font-medium text-ink-200">Avatar</span>
              <div className="flex flex-wrap gap-2">
                {AVATARS.map((a) => (
                  <button
                    key={a}
                    onClick={() => setAvatar(a)}
                    className={`h-14 w-14 overflow-hidden rounded-xl border-2 transition ${avatar === a ? 'border-brand-500' : 'border-transparent opacity-70 hover:opacity-100'}`}
                  >
                    <img src={a} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-200">
              <input type="checkbox" checked={isKid} onChange={(e) => setIsKid(e.target.checked)} className="rounded border-white/20 bg-ink-800" />
              Controle infantil (apenas conteúdo apropriado)
            </label>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <button onClick={() => setModalOpen(false)} className="btn-outline">
              <X className="h-4 w-4" /> Cancelar
            </button>
            <button onClick={save} className="btn-primary">
              <Check className="h-4 w-4" /> Salvar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}




