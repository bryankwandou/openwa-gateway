export interface ThemeColorTokens {
  primary: string;
  primaryVariant: string;
  secondary: string;
  background: string;
  surface: string;
  surfaceElevated: string;
  onPrimary: string;
  onSurface: string;
  onSurfaceMuted: string;
  error: string;
  onError: string;
  outline: string;
}

export const DESIGN_TOKENS: {
  light: ThemeColorTokens;
  dark: ThemeColorTokens;
  typographyScalePx: readonly number[];
  fontFamilies: {
    sans: string;
    mono: string;
  };
} = {
  light: {
    primary: '#047857',
    primaryVariant: '#065f46',
    secondary: '#0f766e',
    background: '#f4f6f5',
    surface: '#ffffff',
    surfaceElevated: '#edf1ef',
    onPrimary: '#ffffff',
    onSurface: '#111815',
    onSurfaceMuted: '#475952',
    error: '#b91c1c',
    onError: '#ffffff',
    outline: '#cbd5d0',
  },
  dark: {
    primary: '#34d399',
    primaryVariant: '#10b981',
    secondary: '#2dd4bf',
    background: '#101513',
    surface: '#161e1b',
    surfaceElevated: '#1d2723',
    onPrimary: '#081c15',
    onSurface: '#e7efec',
    onSurfaceMuted: '#95aba2',
    error: '#f87171',
    onError: '#1f0909',
    outline: '#293832',
  },
  typographyScalePx: [12, 14, 16, 18, 20, 24, 28, 32, 40],
  fontFamilies: {
    sans: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    mono: "'JetBrains Mono', monospace",
  },
};
