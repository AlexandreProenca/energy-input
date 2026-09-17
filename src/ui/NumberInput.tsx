import { useEffect, useState, type InputHTMLAttributes } from 'react';
import { clsx } from 'clsx';

/** Accepts "1,5" or "1.5". Returns undefined for empty, NaN for garbage. */
export function parseLocaleNumber(text: string): number | undefined {
  const t = text.trim().replace(/\s/g, '');
  if (t === '') return undefined;
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}

export const formatLocaleNumber = (n: number | undefined) =>
  n === undefined || Number.isNaN(n) ? '' : n.toLocaleString('pt-BR', { maximumFractionDigits: 10, useGrouping: false });

/**
 * Text input for numbers with Brazilian decimal comma. Commits on every valid
 * keystroke; shows the raw text while it is being typed.
 */
export function NumberInput({
  value,
  onValue,
  unit,
  integer,
  min,
  max,
  invalid,
  commitOnBlur,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'max'> & {
  value: number | undefined;
  onValue: (v: number | undefined) => void;
  unit?: string;
  integer?: boolean;
  min?: number;
  max?: number;
  invalid?: boolean;
  /** Only report the value on blur/Enter (for edits that are expensive or create objects). */
  commitOnBlur?: boolean;
}) {
  const [text, setText] = useState(formatLocaleNumber(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(formatLocaleNumber(value));
  }, [value, focused]);

  const parsed = parseLocaleNumber(text);
  const acceptable = (n: number | undefined) => n === undefined || (!Number.isNaN(n) && (!integer || Number.isInteger(n)) && (min === undefined || n >= min) && (max === undefined || n <= max));
  const commitText = () => {
    const n = parseLocaleNumber(text);
    if (acceptable(n) && n !== value) onValue(n);
  };
  const bad = Number.isNaN(parsed) || (integer && parsed !== undefined && !Number.isInteger(parsed)) || (parsed !== undefined && ((min !== undefined && parsed < min) || (max !== undefined && parsed > max)));

  return (
    <div className="relative">
      <input
        inputMode="decimal"
        autoComplete="off"
        className={clsx('input tabular-nums', unit && 'pr-14', (invalid || bad) && 'input-error', className)}
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          if (commitOnBlur) commitText();
          setFocused(false);
          setText(formatLocaleNumber(value));
        }}
        onKeyDown={(e) => {
          if (commitOnBlur && e.key === 'Enter') commitText();
        }}
        onChange={(e) => {
          setText(e.target.value);
          if (commitOnBlur) return;
          const n = parseLocaleNumber(e.target.value);
          if (acceptable(n)) onValue(n);
        }}
        aria-invalid={invalid || bad || undefined}
        {...rest}
      />
      {unit && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400">{unit}</span>}
    </div>
  );
}

/** Slider paired with a numeric input. */
export function SliderNumber({
  value,
  onValue,
  min,
  max,
  step = 1,
  unit,
  ariaLabel,
}: {
  value: number;
  onValue: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  ariaLabel: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        aria-label={ariaLabel}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onValue(Number(e.target.value))}
        className="h-2 flex-1 cursor-pointer accent-brand-600"
      />
      <div className="w-28">
        <NumberInput aria-label={ariaLabel} value={value} min={min} max={max} unit={unit} onValue={(v) => v !== undefined && onValue(v)} />
      </div>
    </div>
  );
}

export function Stepper({ value, onValue, min, max, ariaLabel }: { value: number; onValue: (v: number) => void; min: number; max: number; ariaLabel: string }) {
  return (
    <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white shadow-sm" role="group" aria-label={ariaLabel}>
      <button type="button" className="h-10 w-10 text-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40" disabled={value <= min} onClick={() => onValue(value - 1)} aria-label="Diminuir">
        −
      </button>
      <span className="w-12 text-center text-sm font-semibold tabular-nums" aria-live="polite">
        {value}
      </span>
      <button type="button" className="h-10 w-10 text-lg text-slate-600 hover:bg-slate-50 disabled:opacity-40" disabled={value >= max} onClick={() => onValue(value + 1)} aria-label="Aumentar">
        +
      </button>
    </div>
  );
}
