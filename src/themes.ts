export type ThemeId = 'light' | 'dark' | 'aurora' | 'calopteryx' | 'test' | 'holo';

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  /** Font applied automatically when switching to this theme */
  defaultFont: string;
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
    defaultFont: 'Courier Prime',
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
    defaultFont: 'Courier Prime',
    preview: {
      sidebar:  '#111111',
      bg:       '#1e1e1e',
      card:     '#252525',
      line:     '#2d2d2a',
      text:     '#e8e8e3',
      textSub:  '#4a4a44',
    },
  },
  {
    id: 'aurora',
    label: 'Aurora',
    defaultFont: 'Inter (Base)',
    preview: {
      sidebar:  'rgba(210, 220, 245, 0.72)',
      bg:       'linear-gradient(135deg, #d8e2f4 0%, #ddd8f5 50%, #d2dff2 100%)',
      card:     'rgba(255, 255, 255, 0.62)',
      line:     'rgba(255, 255, 255, 0.72)',
      text:     '#22203a',
      textSub:  '#b8bdd8',
    },
  },
  {
    id: 'calopteryx',
    label: 'Calopteryx',
    defaultFont: 'Inter (Base)',
    preview: {
      sidebar:  'rgba(16, 28, 62, 0.88)',
      bg:       'linear-gradient(135deg, #162038 0%, #1c3050 50%, #183040 100%)',
      card:     'rgba(22, 44, 88, 0.65)',
      line:     'rgba(45, 200, 190, 0.28)',
      text:     '#cce6f4',
      textSub:  '#2e5878',
    },
  },
  {
    id: 'test',
    label: 'Test',
    defaultFont: 'Inter (Base)',
    preview: {
      sidebar:  '#edf3f7',
      bg:       'linear-gradient(160deg, #eef4f8 0%, #e8f2f5 100%)',
      card:     '#ffffff',
      line:     '#d8e6ed',
      text:     '#1a2d3d',
      textSub:  '#b8cdd8',
    },
  },
  {
    id: 'holo',
    label: 'Holo',
    defaultFont: 'Inter (Base)',
    preview: {
      sidebar:  'rgba(255,255,255,0.38)',
      bg:       'linear-gradient(135deg, #f5c8d8 0%, #e8d8f0 50%, #c8d2f5 100%)',
      card:     'rgba(255,255,255,0.45)',
      line:     'rgba(255,255,255,0.65)',
      text:     '#2a2d45',
      textSub:  'rgba(60,55,90,0.6)',
    },
  },
];
