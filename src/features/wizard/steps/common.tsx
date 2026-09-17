import type { ReactNode } from 'react';
import { clsx } from 'clsx';
import { CheckCircle2 } from 'lucide-react';
import type { WizardAnswers } from '@/generators/answers';
import { useWizardStore } from '@/store/wizardStore';

/** Answers of one wizard step plus a patch function. */
export function useStepAnswers<K extends keyof WizardAnswers>(key: K): [WizardAnswers[K], (patch: Partial<WizardAnswers[K]>) => void] {
  const value = useWizardStore((s) => s.answers[key]);
  const update = useWizardStore((s) => s.update);
  return [value, (patch) => update(key, patch)];
}

export function ChoiceCard({
  selected,
  onSelect,
  title,
  description,
  media,
  footer,
  disabled,
  badge,
  className,
}: {
  selected: boolean;
  onSelect: () => void;
  title: ReactNode;
  description?: ReactNode;
  media?: ReactNode;
  footer?: ReactNode;
  disabled?: boolean;
  badge?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onSelect}
      className={clsx('choice h-full gap-2', selected && 'choice-active', disabled && 'cursor-not-allowed opacity-50 hover:border-slate-200 hover:bg-white', className)}
    >
      {selected && <CheckCircle2 size={20} className="absolute right-3 top-3 fill-brand-600 text-white" />}
      {badge && <span className="absolute left-3 top-3">{badge}</span>}
      {media && <div className="w-full">{media}</div>}
      <div>
        <p className="pr-6 font-semibold text-slate-900">{title}</p>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>}
      </div>
      {footer && <div className="mt-auto w-full pt-1">{footer}</div>}
    </button>
  );
}

export function SectionTitle({ icon, children, hint }: { icon?: ReactNode; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {icon}
        {children}
      </h3>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  );
}

export function PropertyBar({ label, value, max, display, color = 'bg-brand-500' }: { label: string; value: number; max: number; display: string; color?: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 shrink-0 text-slate-500">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200">
        <div className={clsx('h-full rounded-full', color)} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </div>
      <span className="w-14 shrink-0 text-right font-medium tabular-nums text-slate-700">{display}</span>
    </div>
  );
}
