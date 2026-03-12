import { useTheme } from "../theme/theme-context";

export default function ThemeToggle({ className = "", disabled = false }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className={["themeToggle", isDark ? "is-dark" : "is-light", className].filter(Boolean).join(" ")}
      onClick={toggleTheme}
      disabled={disabled}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <svg className="themeToggle__icon" viewBox="0 0 24 24" aria-hidden="true">
        {isDark ? (
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 1 0 9.8 9.8Z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2.2v2.1" />
            <path d="M12 19.7v2.1" />
            <path d="M4.6 4.6 6.1 6.1" />
            <path d="M17.9 17.9 19.4 19.4" />
            <path d="M2.2 12h2.1" />
            <path d="M19.7 12h2.1" />
            <path d="M4.6 19.4 6.1 17.9" />
            <path d="M17.9 6.1 19.4 4.6" />
          </>
        )}
      </svg>
      <span className="themeToggle__sr">{isDark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
