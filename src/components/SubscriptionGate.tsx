import { Link } from 'react-router-dom';
import { Lock, Crown } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';

export function SubscriptionGate({
  open,
  onClose,
  title,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
}) {
  return (
    <Modal open={open} onClose={onClose} size="md">
      <div className="p-6 text-center sm:p-8">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-600/15 text-brand-500">
          <Lock className="h-8 w-8" />
        </div>
        <h3 className="mt-4 text-xl font-bold text-white">{title ?? 'Conteúdo exclusivo'}</h3>
        <p className="mt-2 text-sm text-ink-300">
          Para assistir a este título, você precisa de uma assinatura ativa do MovieFlix. Escolha um plano e comece a assistir agora mesmo.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link to="/minha-assinatura" className="btn-primary">
            <Crown className="h-4 w-4" /> Ver planos
          </Link>
          <button onClick={onClose} className="btn-outline">
            Voltar
          </button>
        </div>
      </div>
    </Modal>
  );
}




