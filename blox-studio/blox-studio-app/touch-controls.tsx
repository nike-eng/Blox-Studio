import { useRef, useState, type MutableRefObject } from 'react';
import type { PlayInput } from './playtest-world.js';
import styles from './playtest.module.css';

/**
 * Roblox-mobile-style thumbstick + jump button. Only visible on touch devices (CSS `pointer: coarse`).
 * @param props.input - shared input ref the character controller reads
 */
export function TouchControls({ input }: { input: MutableRefObject<PlayInput> }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });

  const update = (clientX: number, clientY: number) => {
    const r = base.current?.getBoundingClientRect();
    if (!r) return;
    let x = (clientX - (r.left + r.width / 2)) / (r.width / 2);
    let y = (clientY - (r.top + r.height / 2)) / (r.height / 2);
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    input.current.x = x;
    input.current.z = y;
    setKnob({ x, y });
  };
  const release = () => { input.current.x = 0; input.current.z = 0; setKnob({ x: 0, y: 0 }); };

  return (
    <div className={styles.touch}>
      <div
        ref={base}
        className={styles.stick}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); update(e.clientX, e.clientY); }}
        onPointerMove={(e) => { if (e.buttons || e.pointerType === 'touch') update(e.clientX, e.clientY); }}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <div className={styles.knob} style={{ transform: `translate(${knob.x * 34}px, ${knob.y * 34}px)` }} />
      </div>
      <button
        className={styles.jumpBtn}
        aria-label="Jump"
        onPointerDown={(e) => { e.preventDefault(); input.current.jump = true; }}
        onPointerUp={() => { input.current.jump = false; }}
        onPointerCancel={() => { input.current.jump = false; }}
        onPointerLeave={() => { input.current.jump = false; }}
      >
        ⇧
      </button>
    </div>
  );
}
