/**
 * Autism Mode — Sensory Shield
 *
 * Injects a <style id="ni-autism-shield"> that:
 *   - Kills all CSS animations and transitions site-wide
 *   - Disables smooth scrolling
 *   - Applies a mild contrast + sepia filter to reduce harsh screen glare
 *
 * Also pauses and mutes all active media (video/audio) on enable.
 *
 * Public API:
 *   enableAutismShield()  — inject styles + pause media
 *   disableAutismShield() — remove the injected style tag
 */

const AUTISM_SHIELD_ID = 'ni-autism-shield';

export function enableAutismShield(): void {
  if (!document.getElementById(AUTISM_SHIELD_ID)) {
    const style = document.createElement('style');
    style.id = AUTISM_SHIELD_ID;
    style.textContent = AUTISM_SHIELD_CSS;
    document.head.appendChild(style);
  }

  // Pause and mute all media elements
  document.querySelectorAll<HTMLMediaElement>('video, audio').forEach(media => {
    media.pause();
    media.muted = true;
  });
}

export function disableAutismShield(): void {
  document.getElementById(AUTISM_SHIELD_ID)?.remove();
}

const AUTISM_SHIELD_CSS = `
* { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
body { filter: contrast(0.95) sepia(0.05) !important; }
`.trim();
