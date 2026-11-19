import { ref } from 'vue';

export type ThemeId = 'light' | 'dark' | 'sepia';

export const THEME_KEY = 'chan-theme';
export const theme = ref<ThemeId>(readStoredTheme());
/** Bumped on every theme change so charts can re-read CSS variables. */
export const themeVersion = ref(0);

export function initTheme(): void {
  apply(theme.value);
}

export function setTheme(next: ThemeId): void {
  if (next === theme.value) return;
  theme.value = next;
  apply(next);
  themeVersion.value++;
  try { localStorage.setItem(THEME_KEY, next); } catch { /* storage unavailable */ }
}

export function useTheme() {
  return { theme, themeVersion, setTheme };
}

function apply(next: ThemeId): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = next;
}

function readStoredTheme(): ThemeId {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'dark' || stored === 'sepia' || stored === 'light') return stored;
  } catch { /* ignore */ }
  return 'light';
}
