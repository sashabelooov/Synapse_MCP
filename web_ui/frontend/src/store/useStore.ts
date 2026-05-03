import { create } from 'zustand'

export type Theme = 'dark' | 'light'

interface AppState {
  theme: Theme
  toggleTheme: () => void
}

export const useStore = create<AppState>((set) => ({
  theme: 'dark',
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === 'dark' ? 'light' : 'dark'
      document.documentElement.setAttribute('data-theme', next)
      return { theme: next }
    }),
}))
