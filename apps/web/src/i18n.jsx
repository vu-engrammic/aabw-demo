// apps/web/src/i18n.jsx
// Minimal i18n: a React context + JSON dictionaries. No external libraries.
import React from "react";
import en from "./locales/en.json";
import vi from "./locales/vi.json";

const DICTS = { en, vi };
const STORAGE_KEY = "tasco-locale";
const DEFAULT_LOCALE = "en";

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => (vars[key] ?? ""));
}

function readStoredLocale() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && DICTS[stored] ? stored : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

const LocaleContext = React.createContext(null);

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = React.useState(readStoredLocale);

  const setLocale = React.useCallback((next) => {
    if (!DICTS[next]) return;
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
  }, []);

  const t = React.useCallback(
    (key, vars) => {
      const dict = DICTS[locale] || DICTS[DEFAULT_LOCALE];
      const str = dict[key] ?? DICTS[DEFAULT_LOCALE][key] ?? key;
      return interpolate(str, vars);
    },
    [locale]
  );

  const value = React.useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = React.useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx;
}

export function LanguageToggle({ className = "" }) {
  const { locale, setLocale } = useLocale();
  return (
    <div className={`lang-toggle ${className}`.trim()} role="group" aria-label="Language">
      {Object.keys(DICTS).map((code) => (
        <button
          key={code}
          type="button"
          className={locale === code ? "lang-btn active" : "lang-btn"}
          onClick={() => setLocale(code)}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
