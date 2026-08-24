import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizes = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

export function Modal({ open, onClose, children, className, size = 'md' }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    // Navegação por controle: enquanto o modal está aberto, os elementos de
    // trás (dentro de #root) ficam fora do alcance das setas do controle.
    const rootEl = document.getElementById('root');
    rootEl?.setAttribute('data-tv-hidden', 'true');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      rootEl?.removeAttribute('data-tv-hidden');
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in-fast"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-10 w-full rounded-2xl border border-white/10 bg-ink-900 shadow-2xl animate-scale-in',
          sizes[size],
          className,
        )}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-20 rounded-full bg-white/10 p-2 text-ink-200 transition hover:bg-white/20 hover:text-white"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
        {children}
      </div>
    </div>,
    document.body,
  );
}




