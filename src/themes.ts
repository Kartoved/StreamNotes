export type ThemeId = 'light' | 'dark';

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  /** Hardcoded colors for the mini-preview — independent of CSS vars */
  preview: {
    sidebar: string;
    bg: string;
    card: string;
    line: string;
    text: string;
    textSub: string;
  };
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'light',
    label: 'Light',
    preview: {
      sidebar:  '#f7f6f3',
      bg:       '#ffffff',
      card:     '#f7f6f3',
      line:     '#e9e9e7',
      text:     '#37352f',
      textSub:  '#b1b1ae',
    },
  },
  {
    id: 'dark',
    label: 'Dark',
    preview: {
      sidebar:  '#111111',
      bg:       '#1e1e1e',
      card:     '#252525',
      line:     '#2d2d2a',
      text:     '#e8e8e3',
      textSub:  '#4a4a44',
    },
  },
];
