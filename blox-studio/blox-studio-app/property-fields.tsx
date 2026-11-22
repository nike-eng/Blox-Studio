import { useEffect, useState, type CSSProperties } from 'react';
import type { Vec3 } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
import styles from './studio.module.css';

/** True on phones and tablets (finger input): number fields get big minus / plus buttons. */
const TOUCH = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

const STEP_BTN: CSSProperties = {
  width: 36, height: 32, flexShrink: 0, padding: 0, border: '1px solid #2c3350', borderRadius: 8,
  background: '#2c3350', color: '#fff', fontSize: 18, lineHeight: 1, cursor: 'pointer',
};

/**
 * Numeric input that commits on blur or Enter.
 */
export function NumberField({ value, onCommit, step = 1, min, max }: {
  value: number; onCommit: (v: number) => void; step?: number; min?: number; max?: number;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    let n = parseFloat(text);
    if (Number.isNaN(n)) { setText(String(value)); return; }
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    if (n !== value) onCommit(n); else setText(String(value));
  };
  /** One tap on minus / plus: moves the value by one step and saves it straight away. */
  const bump = (dir: 1 | -1) => {
    const typed = parseFloat(text);
    let n = Math.round(((Number.isNaN(typed) ? value : typed) + dir * step) * 1000) / 1000;
    if (min !== undefined) n = Math.max(min, n);
    if (max !== undefined) n = Math.min(max, n);
    setText(String(n));
    if (n !== value) onCommit(n);
  };
  const input = (
    <input
      className={styles.propInput}
      type="number"
      step={step}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
  if (!TOUCH) return input;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', minWidth: 0 }}>
      <button type="button" style={STEP_BTN} aria-label="Decrease" onClick={() => bump(-1)}>−</button>
      {input}
      <button type="button" style={STEP_BTN} aria-label="Increase" onClick={() => bump(1)}>+</button>
    </div>
  );
}

/**
 * Three numeric inputs for a Vector3 property.
 */
export function Vec3Field({ value, onCommit, min }: { value: Vec3; onCommit: (v: Vec3) => void; min?: number }) {
  return (
    <div className={styles.vec3} style={TOUCH ? { gridTemplateColumns: '1fr', gap: 4 } : undefined}>
      {(['X', 'Y', 'Z'] as const).map((axis, i) => (
        <label key={axis} className={styles.vecAxis}>
          <span className={styles[`axis${axis}`]}>{axis}</span>
          <NumberField
            value={value[i]}
            min={min}
            step={0.5}
            onCommit={(n) => { const next = [...value] as Vec3; next[i] = n; onCommit(next); }}
          />
        </label>
      ))}
    </div>
  );
}

/**
 * Text input that commits on blur or Enter.
 */
export function TextField({ value, onCommit, placeholder }: { value: string; onCommit: (v: string) => void; placeholder?: string }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <input
      className={styles.propInput}
      value={text}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => { if (text !== value && text.trim()) onCommit(text.trim()); else setText(value); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
    />
  );
}

/**
 * A labeled row in the Properties panel.
 */
export function PropRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.propRow}>
      <span className={styles.propLabel}>{label}</span>
      <div className={styles.propValue}>{children}</div>
    </div>
  );
}
