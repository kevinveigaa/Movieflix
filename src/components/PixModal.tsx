import { Copy, Check, QrCode, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import type { Payment } from '@/types';

export function PixModal({
  open,
  onClose,
  qrCode,
  qrBase64,
  payment,
}: {
  open: boolean;
  onClose: () => void;
  qrCode: string;
  qrBase64: string;
  payment: Payment | null;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(qrCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const status = payment?.status;

  return (
    <Modal open={open} onClose={onClose} size="md">
      <div className="p-6">
        <h3 className="text-center text-lg font-bold text-white">Pague com Pix</h3>

        {status === 'approved' ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="h-16 w-16 text-emerald-400" />
            <p className="text-lg font-bold text-white">Pagamento confirmado!</p>
            <p className="text-sm text-ink-300">Sua assinatura foi ativada. Bom filme!</p>
          </div>
        ) : status === 'rejected' || status === 'cancelled' ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <XCircle className="h-16 w-16 text-red-400" />
            <p className="text-lg font-bold text-white">Pagamento {status === 'rejected' ? 'recusado' : 'cancelado'}</p>
            <p className="text-sm text-ink-300">Tente novamente gerando um novo pagamento.</p>
          </div>
        ) : (
          <>
            <div className="mt-5 flex flex-col items-center gap-4">
              <div className="rounded-2xl bg-white p-3">
                {qrBase64 ? (
                  <img src={`data:image/png;base64,${qrBase64}`} alt="QR Code Pix" className="h-48 w-48" />
                ) : (
                  <div className="flex h-48 w-48 items-center justify-center text-ink-400">
                    <QrCode className="h-12 w-12" />
                  </div>
                )}
              </div>
              <p className="flex items-center gap-2 text-sm text-ink-300">
                <Loader2 className="h-4 w-4 animate-spin text-brand-500" /> Aguardando confirmação do pagamento
              </p>
            </div>

            <div className="mt-5">
              <span className="mb-1.5 block text-sm font-medium text-ink-200">Pix Copia e Cola</span>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={qrCode}
                  className="input font-mono text-xs"
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                />
                <button onClick={copy} className="btn-outline flex-shrink-0">
                  {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  {copied ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}




