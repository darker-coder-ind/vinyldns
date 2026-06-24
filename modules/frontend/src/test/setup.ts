import "@testing-library/jest-dom";
import { vi } from "vitest";

<<<<<<< dns_changes
=======
import "@testing-library/jest-dom";
import { vi } from "vitest";

>>>>>>> portal_migration_angular_to_react
// jsdom doesn't implement window.matchMedia; provide a deterministic stub
// so components that probe for dark theme (e.g. tables, modals) don't throw.
if (typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

// jsdom's clipboard API stub — many tables call navigator.clipboard.writeText
// when the user clicks a "copy" button.
if (!("clipboard" in navigator)) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
}

// IntersectionObserver / ResizeObserver are referenced indirectly by some
// Bootstrap/React components; provide no-op shims so module init never throws.
class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
if (!(globalThis as any).IntersectionObserver) {
  (globalThis as any).IntersectionObserver = NoopObserver;
}
if (!(globalThis as any).ResizeObserver) {
  (globalThis as any).ResizeObserver = NoopObserver;
}
