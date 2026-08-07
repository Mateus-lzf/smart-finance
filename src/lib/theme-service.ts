export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "smart-finance.theme";

export function readStoredTheme(
  storage: Pick<Storage, "getItem"> | undefined = typeof window === "undefined"
    ? undefined
    : window.localStorage,
): Theme {
  return storage?.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
}

export function applyTheme(theme: Theme) {
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }
}

export function persistTheme(
  theme: Theme,
  storage: Pick<Storage, "setItem"> | undefined = typeof window === "undefined"
    ? undefined
    : window.localStorage,
) {
  storage?.setItem(THEME_STORAGE_KEY, theme);
  applyTheme(theme);
}
