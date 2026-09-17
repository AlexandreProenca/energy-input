import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useUiStore } from '@/store/uiStore';

export function Toasts() {
  const toasts = useUiStore((s) => s.toasts);
  const dismiss = useUiStore((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[min(92vw,420px)] -translate-x-1/2 flex-col gap-2" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={clsx(
            'pointer-events-auto flex items-start gap-3 rounded-xl px-4 py-3 text-sm text-white shadow-xl',
            t.kind === 'success' && 'bg-brand-800',
            t.kind === 'info' && 'bg-slate-800',
            t.kind === 'error' && 'bg-red-700',
          )}
        >
          {t.kind === 'success' ? <CheckCircle2 size={18} /> : t.kind === 'error' ? <TriangleAlert size={18} /> : <Info size={18} />}
          <span className="flex-1">{t.message}</span>
          <button type="button" aria-label="Fechar" onClick={() => dismiss(t.id)} className="opacity-70 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
