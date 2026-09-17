import { useRef, useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { Upload } from 'lucide-react';

export function Dropzone({
  accept,
  onFile,
  title,
  description,
  icon,
  compact,
}: {
  accept: string;
  onFile: (file: File) => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const f = e.dataTransfer.files[0];
        if (f) onFile(f);
      }}
      className={clsx(
        'flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed text-left transition',
        compact ? 'p-3' : 'p-5',
        over ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50/60 hover:border-brand-400 hover:bg-brand-50/40',
      )}
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-brand-600 shadow-sm">{icon ?? <Upload size={20} />}</div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        {description && <p className="text-xs text-slate-500">{description}</p>}
      </div>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
