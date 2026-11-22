import { ThemeProvider as NextThemesProvider, useTheme as useNextThemes } from "next-themes";
import { useState, type ComponentProps } from "react";

export type Theme = "dark" | "light";

function isTheme(value: string | undefined): value is Theme {
  return value === "dark" || value === "light";
}

export function ThemeProvider(props: ComponentProps<typeof NextThemesProvider>) {
  const storageKey = props.storageKey ?? "theme";
  const [migratedTheme] = useState(() => {
    if (typeof window === "undefined") return undefined;
    const storedTheme = window.localStorage.getItem(storageKey);
    if (storedTheme && !isTheme(storedTheme)) {
      window.localStorage.setItem(storageKey, "light");
      return "light";
    }
    return undefined;
  });

  return (
    <NextThemesProvider
      {...props}
      defaultTheme={migratedTheme ?? props.defaultTheme}
      disableTransitionOnChange
      enableSystem={false}
      storageKey={storageKey}
      themes={["dark", "light"]}
    />
  );
}

export function useTheme() {
  const { theme, resolvedTheme, setTheme } = useNextThemes();

  return {
    theme: isTheme(theme) ? theme : isTheme(resolvedTheme) ? resolvedTheme : "dark",
    setTheme: (nextTheme: Theme) => setTheme(nextTheme),
  };
}
