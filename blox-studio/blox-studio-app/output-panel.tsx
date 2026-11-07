import { useEffect, useRef, useState } from 'react';
import type { OutputLine } from '@nikethbhat4thh/blox-studio.rbxlx-serializer';
import { Icon } from './icons.js';
import s from './output-panel.module.css';

/**
 * Props for the Output panel.
 */
export type OutputPanelProps = {
  lines: OutputLine[];
  running: boolean;
  onClear: () => void;
  onRun: (source: string) => void;
  onStop: () => void;
  onClose: () => void;
};

const pad = (n: number) => String(n).padStart(2, '0');
const clock = (t: number) => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

/**
 * Roblox-style Output window plus Command Bar: shows print / warn / error lines and runs Luau typed below.
 */
export function OutputPanel({ lines, running, onClear, onRun, onStop, onClose }: OutputPanelProps) {
  const [text, setText] = useState('');
  const [filter, setFilter] = useState<'all' | 'warn' | 'error'>('all');
  const history = useRef<string[]>([]);
  const cursor = useRef(-1);
  const body = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    const el = body.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  const shown = lines.filter((l) => filter === 'all' || (filter === 'warn' ? l.kind === 'warn' || l.kind === 'error' : l.kind === 'error'));

  const submit = () => {
    const src = text.trim();
    if (!src || running) return;
    history.current = [src, ...history.current.filter((h) => h !== src)].slice(0, 50);
    cursor.current = -1;
    setText('');
    onRun(src);
  };

  return (
    <section className={s.panel} aria-label="Output">
      <header className={s.head}>
        <strong>Output</strong>
        <div className={s.chips} role="group" aria-label="Filter">
          {(['all', 'warn', 'error'] as const).map((f) => (
            <button key={f} type="button" data-on={filter === f} onClick={() => setFilter(f)}>{f === 'all' ? 'All' : f === 'warn' ? 'Warnings' : 'Errors'}</button>
          ))}
        </div>
        <span className={s.grow} />
        {running && <button type="button" className={s.stop} onClick={onStop}>Stop script</button>}
        <button type="button" onClick={onClear} className={s.textBtn}>Clear</button>
        <button type="button" onClick={onClose} className={s.iconBtn} aria-label="Close Output"><Icon name="close" size={16} /></button>
      </header>
      <div
        className={s.body}
        ref={body}
        onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; }}
      >
        {shown.length === 0 && (
          <p className={s.empty}>Nothing here yet. Type a command below, like <code>print("Hello")</code>, or press Run on a script.</p>
        )}
        {shown.map((l) => (
          <div key={l.id} className={s.line} data-kind={l.kind}>
            <span className={s.time}>{clock(l.time)}</span>
            <span className={s.text}>{l.text}</span>
          </div>
        ))}
      </div>
      <div className={s.cmd}>
        <span className={s.prompt} aria-hidden="true">›</span>
        <textarea
          className={s.input}
          rows={1}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="Run a command, e.g. workspace.Baseplate.Color = Color3.fromRGB(255, 0, 0)"
          aria-label="Command bar"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); return; }
            if (e.key === 'ArrowUp' && !text.includes('\n') && history.current.length) {
              e.preventDefault(); cursor.current = Math.min(history.current.length - 1, cursor.current + 1); setText(history.current[cursor.current]);
            }
            if (e.key === 'ArrowDown' && !text.includes('\n')) {
              e.preventDefault(); cursor.current = Math.max(-1, cursor.current - 1); setText(cursor.current < 0 ? '' : history.current[cursor.current]);
            }
          }}
        />
        <button type="button" className={s.run} onClick={submit} disabled={!text.trim() || running}>Run</button>
      </div>
    </section>
  );
}
