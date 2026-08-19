import { useEffect } from 'react';
import { themeStyles } from "@/strudel-editor/data/css/themes";

export function useThemeCss(theme: string) {
  useEffect(() => {
    const id = 'theme-css';
    let styleElement = document.getElementById(id) as HTMLStyleElement | null;
    const normalizedTheme = theme.trim();

    // Remove existing style element if it exists
    if (styleElement) {
      styleElement.remove();
    }

    // Create new style element
    styleElement = document.createElement('style');
    styleElement.id = id;
    styleElement.type = 'text/css';

    // Get the theme CSS content
    const themeCSS = themeStyles[normalizedTheme];
    if (Object.prototype.hasOwnProperty.call(themeStyles, normalizedTheme)) {
      styleElement.textContent = themeCSS;
      document.head.appendChild(styleElement);
    } else {
      console.warn(
        `Theme "${normalizedTheme}" not found. Available themes:`,
        Object.keys(themeStyles)
      );
    }
  }, [theme]);
}
