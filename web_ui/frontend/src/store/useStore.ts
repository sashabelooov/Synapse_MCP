import { create } from 'zustand'

export type Tab = 'tree' | 'callgraph' | 'dbschema' | 'routes' | 'devops' | 'debugger'
export type Theme = 'dark' | 'light'

interface AppState {
  projectPath: string
  setProjectPath: (p: string) => void
  activeTab: Tab
  setActiveTab: (t: Tab) => void
  isAnalyzing: boolean
  setIsAnalyzing: (v: boolean) => void
  analysisStats: Record<string, number> | null
  setAnalysisStats: (s: Record<string, number> | null) => void
  framework: string
  setFramework: (f: string) => void
  theme: Theme
  toggleTheme: () => void
}

export const useStore = create<AppState>((set) => ({
  projectPath: '',
  setProjectPath: (p) => set({ projectPath: p }),
  activeTab: 'tree',
  setActiveTab: (t) => set({ activeTab: t }),
  isAnalyzing: false,
  setIsAnalyzing: (v) => set({ isAnalyzing: v }),
  analysisStats: null,
  setAnalysisStats: (s) => set({ analysisStats: s }),
  framework: '',
  setFramework: (f) => set({ framework: f }),
  theme: 'dark',
  toggleTheme: () =>
    set((s) => {
      const next = s.theme === 'dark' ? 'light' : 'dark'
      document.documentElement.setAttribute('data-theme', next)
      return { theme: next }
    }),
}))
