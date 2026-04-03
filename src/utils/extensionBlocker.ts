/**
 * Extension Blocker — actively removes elements injected by browser extensions.
 *
 * Many password managers / security suites (Kaspersky, Bitwarden inline popups,
 * Grammarly, etc.) inject iframes, divs, and floating toolbars into the page.
 * In an SPA these often break layout or show broken "cannot connect" placeholders.
 *
 * This module uses a MutationObserver to detect and neutralize such injections
 * in real-time while keeping the rest of the page intact.
 */

// IDs and class fragments that belong to OUR app — never touch these.
const OWN_IDS = new Set(['root']);

function isOwnElement(el: Element): boolean {
  // Direct children we manage
  if (OWN_IDS.has(el.id)) return true;
  // <script> and <link> / <style> tags are fine
  const tag = el.tagName;
  if (tag === 'SCRIPT' || tag === 'LINK' || tag === 'STYLE' || tag === 'NOSCRIPT') return true;
  // Vite injects its own elements
  if (el.id?.startsWith('vite-') || el.getAttribute('data-vite')) return true;
  return false;
}

function nukeElement(el: Element) {
  // Instead of removing (which some extensions re-inject), collapse to zero
  const s = (el as HTMLElement).style;
  if (!s) return;
  s.setProperty('display', 'none', 'important');
  s.setProperty('visibility', 'hidden', 'important');
  s.setProperty('width', '0', 'important');
  s.setProperty('height', '0', 'important');
  s.setProperty('overflow', 'hidden', 'important');
  s.setProperty('position', 'fixed', 'important');
  s.setProperty('pointer-events', 'none', 'important');
  s.setProperty('opacity', '0', 'important');
  s.setProperty('z-index', '-99999', 'important');
}

function cleanBody() {
  // Nuke any direct children of <body> that aren't ours
  Array.from(document.body.children).forEach((el) => {
    if (!isOwnElement(el)) {
      nukeElement(el);
    }
  });
}

export function startExtensionBlocker() {
  // Initial cleanup
  cleanBody();

  // Watch for future injections
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        // Direct body children that aren't ours
        if (node.parentElement === document.body && !isOwnElement(node)) {
          nukeElement(node);
          continue;
        }

        // Iframes injected anywhere inside #root by extensions
        if (node.tagName === 'IFRAME') {
          const src = node.getAttribute('src') || '';
          // Allow our own iframes if we ever add any (none currently)
          if (!src.startsWith(window.location.origin) && !src.startsWith('/') && !src.startsWith('blob:')) {
            nukeElement(node);
          }
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Periodic sweep as fallback (some extensions delay injection)
  const intervalId = setInterval(cleanBody, 2000);

  return () => {
    observer.disconnect();
    clearInterval(intervalId);
  };
}
