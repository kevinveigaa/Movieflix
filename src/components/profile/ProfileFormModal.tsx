import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Baby, Check, Loader2, User, X } from 'lucide-react';
import { PROFILE_AVATARS } from '@/lib/avatars';
import type { ViewerProfile } from '@/types';

interface ProfileFormModalProps {
  open: boolean;
  onClose: () => void;
  /** Perfil em edição. null = criar novo. */
  editing: ViewerProfile | null;
  /** Nome sugerido ao criar o primeiro perfil (vindo do cadastro). */
  defaultName?: string;
  onSubmit: (input: { name: string; avatar: string; is_kid: boolean }) => Promise<void> | void;
}

export function ProfileFormModal({ open, onClose, editing, defaultName, onSubmit }: ProfileFormModalProps) {
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState(PROFILE_AVATARS[0]);
  const [isKid, setIsKid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? defaultName ?? '');
      setAvatar(editing?.avatar_url || PROFILE_AVATARS[0]);
      setIsKid(editing?.is_kid ?? false);
      setError('');
    }
  }, [open, editing, defaultName]);

  async function save() {
    if (!name.trim()) {
      setError('Informe um nome para o perfil.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSubmit({ name: name.trim(), avatar, is_kid: isKid });
      onClose();
    } catch (e) {
      setError((e as Error).message || 'Não foi possível salvar o perfil.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="md">
      <div className="p-6">
        <h3 className="text-lg font-bold text-white">{editing ? 'Editar perfil' : 'Novo perfil'}</h3>

        <div className="mt-5 space-y-5">
          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink-200">Nome</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={20}
              placeholder="Ex.: João"
              className="input"
              autoFocus
            />
          </div>

          <div>
            <span className="mb-3 block text-sm font-medium text-ink-200">Tipo de perfil</span>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsKid(false)}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition ${
                  !isKid
                    ? 'border-roxo-500 bg-roxo-600/10 shadow-md shadow-roxo-600/20'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                <User className={`h-8 w-8 ${!isKid ? 'text-roxo-400' : 'text-ink-400'}`} />
                <span className="text-sm font-semibold text-white">Normal</span>
                <span className="text-center text-[11px] text-ink-400">Todo o conteúdo</span>
              </button>
              <button
                type="button"
                onClick={() => setIsKid(true)}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition ${
                  isKid
                    ? 'border-amber-400 bg-amber-400/10 shadow-md shadow-amber-400/20'
                    : 'border-white/10 bg-white/5 hover:bg-white/10'
                }`}
              >
                <Baby className={`h-8 w-8 ${isKid ? 'text-amber-400' : 'text-ink-400'}`} />
                <span className="text-sm font-semibold text-white">Infantil</span>
                <span className="text-center text-[11px] text-ink-400">Só conteúdo para crianças</span>
              </button>
            </div>
          </div>

          <div>
            <span className="mb-2 block text-sm font-medium text-ink-200">Avatar</span>
            <div className="flex flex-wrap gap-2">
              {PROFILE_AVATARS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAvatar(a)}
                  className={`h-14 w-14 overflow-hidden rounded-xl border-2 transition ${
                    avatar === a ? 'border-roxo-500' : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                  aria-label="Escolher avatar"
                >
                  <img src={a} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="btn-outline">
            <X className="h-4 w-4" /> Cancelar
          </button>
          <button onClick={save} disabled={busy} className="btn-primary">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Salvar
          </button>
        </div>
      </div>
    </Modal>
  );
}
