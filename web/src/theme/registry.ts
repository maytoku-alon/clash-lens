import { defaultTheme } from './themes/default'
import { obsidianPlumTheme } from './themes/obsidianPlum'
import type { ThemeDefinition } from './types'

class ThemeRegistry {
  private readonly themes = new Map<string, ThemeDefinition>()

  constructor(initial: ThemeDefinition[]) {
    for (const theme of initial) {
      this.themes.set(theme.id, theme)
    }
  }

  register(theme: ThemeDefinition): void {
    this.themes.set(theme.id, theme)
  }

  has(id: string): boolean {
    return this.themes.has(id)
  }

  get(id: string): ThemeDefinition {
    return this.themes.get(id) ?? defaultTheme
  }

  list(): ThemeDefinition[] {
    return Array.from(this.themes.values())
  }

  getDefault(): ThemeDefinition {
    return defaultTheme
  }
}

export const themeRegistry = new ThemeRegistry([defaultTheme, obsidianPlumTheme])
