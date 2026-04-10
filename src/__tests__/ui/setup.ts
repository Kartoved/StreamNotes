/**
 * UI test setup — runs before every test file in src/__tests__/ui/.
 * Guards all DOM/browser-API mocks so existing node-environment tests
 * are unaffected (they never load this file, but this guard is defensive).
 */

// @testing-library/jest-dom is imported per UI test file (not here)
// because setupFiles runs in all environments (including node).

if (typeof window !== 'undefined') {
  // ── IntersectionObserver ───────────────────────────────────────────
  class MockIntersectionObserver {
    observe = () => {};
    unobserve = () => {};
    disconnect = () => {};
  }
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: MockIntersectionObserver,
  });
  Object.defineProperty(global, 'IntersectionObserver', {
    writable: true,
    configurable: true,
    value: MockIntersectionObserver,
  });

  // ── ResizeObserver ─────────────────────────────────────────────────
  class MockResizeObserver {
    observe = () => {};
    unobserve = () => {};
    disconnect = () => {};
  }
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: MockResizeObserver,
  });
  Object.defineProperty(global, 'ResizeObserver', {
    writable: true,
    configurable: true,
    value: MockResizeObserver,
  });

  // ── URL.createObjectURL / revokeObjectURL ─────────────────────────
  Object.defineProperty(URL, 'createObjectURL', {
    writable: true,
    configurable: true,
    value: (blob: Blob) => `blob:mock/${(blob as any).name ?? 'file'}`,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    writable: true,
    configurable: true,
    value: () => {},
  });

  // ── navigator.storage (OPFS) ──────────────────────────────────────
  Object.defineProperty(navigator, 'storage', {
    writable: true,
    configurable: true,
    value: {
      getDirectory: async () => ({
        getDirectoryHandle: async () => ({
          getFileHandle: async () => ({
            getFile: async () => new File([''], 'mock.bin'),
            createWritable: async () => ({
              write: async () => {},
              close: async () => {},
            }),
          }),
        }),
      }),
    },
  });

  // ── window.scrollToNote / window.navigateToNote / window.openLightbox ─
  (window as any).scrollToNote = () => {};
  (window as any).navigateToNote = () => {};
  (window as any).openLightbox = () => {};

  // ── matchMedia (needed by some theme-detection code) ──────────────
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
