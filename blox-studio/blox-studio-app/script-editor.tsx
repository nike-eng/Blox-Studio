import { useEffect, useRef, useState } from 'react';
import type { PlaceInstance } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
import { ClassIcon } from './class-icon.js';
import styles from './studio.module.css';

/**
 * Props for the script editor.
 */
export type ScriptEditorProps = {
  script: PlaceInstance;
  onChange: (source: string) => void;
  onClose: () => void;
};

/**
 * Luau script editor tab with line numbers and Tab-to-indent.
 */
export function ScriptEditor({ script, onChange, onClose }: ScriptEditorProps) {
  const [source, setSource] = useState(script.props.source || '');
  const gutterRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => { setSource(script.props.source || ''); }, [script.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (value: string) => {
    setSource(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onChange(value), 500);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  const lines = source.split('\n').length;

  return (
    <div className={styles.scriptEditor}>
      <div className={styles.scriptTab}>
        <ClassIcon className={script.className} />
        <span>{script.name}</span>
        <button type="button" className={styles.scriptClose} onClick={() => { clearTimeout(timer.current); onChange(source); onClose(); }} aria-label="Close script">✕</button>
      </div>
      <div className={styles.scriptBody}>
        <div className={styles.gutter} ref={gutterRef}>
          {Array.from({ length: lines }, (_, i) => <div key={i}>{i + 1}</div>)}
        </div>
        <textarea
          className={styles.code}
          spellCheck={false}
          value={source}
          onScroll={(e) => { if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop; }}
          onChange={(e) => update(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              const el = e.currentTarget;
              const { selectionStart: s, selectionEnd: end } = el;
              const next = `${source.slice(0, s)}\t${source.slice(end)}`;
              update(next);
              requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 1; });
            }
          }}
        />
      </div>
    </div>
  );
}
