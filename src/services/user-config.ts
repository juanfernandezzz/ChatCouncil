const STORAGE_KEYS = {
  openaiApiKey: 'cc_openaiApiKey',
  anthropicApiKey: 'cc_anthropicApiKey',
  geminiApiKey: 'cc_geminiApiKey',
  deepseekApiKey: 'cc_deepseekApiKey',
  grokApiKey: 'cc_grokApiKey',
  perplexityApiKey: 'cc_perplexityApiKey',
  moonshotApiKey: 'cc_moonshotApiKey',
  minimaxApiKey: 'cc_minimaxApiKey',
  glmApiKey: 'cc_glmApiKey',
  qwenApiKey: 'cc_qwenApiKey',
  startupPage: 'cc_startupPage',
  enabledBots: 'cc_enabledBots',
} as const

const DEFAULTS = {
  openaiApiKey: '',
  anthropicApiKey: '',
  geminiApiKey: '',
  deepseekApiKey: '',
  grokApiKey: '',
  perplexityApiKey: '',
  moonshotApiKey: '',
  minimaxApiKey: '',
  glmApiKey: '',
  qwenApiKey: '',
  startupPage: 'all',
}

export type UserConfig = typeof DEFAULTS

export async function getUserConfig(): Promise<UserConfig> {
  const config = { ...DEFAULTS }
  for (const [key, storageKey] of Object.entries(STORAGE_KEYS)) {
    try {
      const val = localStorage.getItem(storageKey)
      if (val !== null) {
        ;(config as any)[key] = val
      }
    } catch { /* localStorage not available */ }
  }
  return config
}

export async function updateUserConfig(updates: Partial<UserConfig>) {
  for (const [key, value] of Object.entries(updates)) {
    const storageKey = (STORAGE_KEYS as any)[key]
    if (storageKey) {
      try {
        if (value) {
          localStorage.setItem(storageKey, value as string)
        } else {
          localStorage.removeItem(storageKey)
        }
      } catch { /* localStorage not available */ }
    }
  }
}
