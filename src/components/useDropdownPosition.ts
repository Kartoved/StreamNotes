import { useLayoutEffect, useRef, useState } from 'react';

// Approx height of a single line in the TipTap editor — used to flip the
// dropdown above the trigger when it would overflow below the visible
// viewport (mobile keyboard open). Off by a few px is fine.
const APPROX_LINE_HEIGHT = 24;
const GUTTER = 12; // breathing room from viewport edges
const FLIP_GAP = 6;

interface Pos { top: number; left: number }

/**
 * Adjusts a fixed-positioned dropdown so it stays inside the *visual* viewport
 * (which shrinks when the iOS/Android virtual keyboard opens). If the
 * dropdown would overflow below — flips above the trigger. Always clamps
 * horizontally so it doesn't fall off either edge.
 *
 * Pass the initial position (as if rendering below the trigger) and a ref to
 * the dropdown's root element. The returned position should be applied to
 * the root's inline `top` / `left`.
 *
 * Re-runs on layout changes and visualViewport resize/scroll, so the
 * dropdown re-flips if the keyboard opens after mount.
 */
export function useDropdownPosition(
  initial: Pos,
  ref: React.RefObject<HTMLElement>,
  // optional extra dependency — re-measure when content height changes
  deps: any[] = [],
): Pos {
  const [pos, setPos] = useState<Pos>(initial);
  const initialRef = useRef(initial);
  initialRef.current = initial;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const adjust = () => {
      const node = ref.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const vv = window.visualViewport;
      const viewportLeft = vv?.offsetLeft ?? 0;
      const viewportTop = vv?.offsetTop ?? 0;
      const viewportWidth = vv?.width ?? window.innerWidth;
      const viewportHeight = vv?.height ?? window.innerHeight;
      const viewportRight = viewportLeft + viewportWidth;
      const viewportBottom = viewportTop + viewportHeight;

      const init = initialRef.current;
      let nextTop = init.top;
      let nextLeft = init.left;

      // Vertical flip — if rendered below trigger overflows visible area
      // and there's more space above, flip the dropdown above the trigger.
      const wouldOverflowBottom = init.top + rect.height + GUTTER > viewportBottom;
      if (wouldOverflowBottom) {
        // position.top was set to trigger.bottom + GAP, so trigger.top ≈
        // init.top - GAP - lineHeight.
        const triggerTop = init.top - FLIP_GAP - APPROX_LINE_HEIGHT;
        const flippedTop = triggerTop - rect.height - FLIP_GAP;
        if (flippedTop >= viewportTop + GUTTER) {
          nextTop = flippedTop;
        } else {
          // Not enough space above either — pin to top of viewport so list
          // is at least visible (user can scroll inside it).
          nextTop = viewportTop + GUTTER;
        }
      }

      // Horizontal clamp — keep entirely on screen.
      if (nextLeft + rect.width + GUTTER > viewportRight) {
        nextLeft = Math.max(viewportLeft + GUTTER, viewportRight - rect.width - GUTTER);
      }
      if (nextLeft < viewportLeft + GUTTER) {
        nextLeft = viewportLeft + GUTTER;
      }

      setPos(prev => (prev.top === nextTop && prev.left === nextLeft) ? prev : { top: nextTop, left: nextLeft });
    };

    adjust();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', adjust);
    vv?.addEventListener('scroll', adjust);
    window.addEventListener('resize', adjust);
    return () => {
      vv?.removeEventListener('resize', adjust);
      vv?.removeEventListener('scroll', adjust);
      window.removeEventListener('resize', adjust);
    };
  // initial.top/left and deps drive re-measurement on caller-provided changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.top, initial.left, ref, ...deps]);

  return pos;
}
