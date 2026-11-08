/**
 * Keeps the CSS variable `--app-h` equal to the height you can really see.
 * Mobile browsers (iOS Safari especially) report 100vh as taller than the visible area
 * because of their toolbars, which pushes bottom buttons off-screen. window.innerHeight is the true value.
 */
export function trackViewportHeight(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  const root = document.documentElement;
  const timers: number[] = [];

  const apply = () => {
    const h = Math.round(window.innerHeight);
    if (h > 0) root.style.setProperty('--app-h', `${h}px`);
  };
  // iOS reports the old size for a moment after rotating, so measure again shortly after.
  const applySoon = () => {
    apply();
    timers.push(window.setTimeout(apply, 120), window.setTimeout(apply, 400));
  };

  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', applySoon);
  window.addEventListener('pageshow', applySoon);
  window.visualViewport?.addEventListener('resize', apply);
  return () => {
    window.removeEventListener('resize', apply);
    window.removeEventListener('orientationchange', applySoon);
    window.removeEventListener('pageshow', applySoon);
    window.visualViewport?.removeEventListener('resize', apply);
    timers.forEach((t) => window.clearTimeout(t));
    root.style.removeProperty('--app-h');
  };
}
