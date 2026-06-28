import { FC, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast, { Toaster } from 'react-hot-toast'
import { CHATBOTS } from '~app/consts'
import { UserConfig, getUserConfig, updateUserConfig } from '~services/user-config'
import { getVersion } from '~utils'
import { cx } from '~/utils'

const PROVIDER_CONFIGS: { id: keyof UserConfig; label: string; botKey: string; placeholder: string }[] = [
  { id: 'openaiApiKey', label: 'OpenAI', botKey: 'chatgpt', placeholder: 'sk-...' },
  { id: 'anthropicApiKey', label: 'Anthropic', botKey: 'claude', placeholder: 'sk-ant-...' },
  { id: 'geminiApiKey', label: 'Google Gemini', botKey: 'gemini', placeholder: 'AIza...' },
  { id: 'deepseekApiKey', label: 'DeepSeek', botKey: 'deepseek', placeholder: 'sk-...' },
  { id: 'grokApiKey', label: 'xAI Grok', botKey: 'grok', placeholder: 'xai-...' },
  { id: 'perplexityApiKey', label: 'Perplexity', botKey: 'perplexity', placeholder: 'pplx-...' },
  { id: 'moonshotApiKey', label: 'Moonshot (Kimi)', botKey: 'kimi', placeholder: 'sk-...' },
  { id: 'minimaxApiKey', label: 'MiniMax', botKey: 'minimax', placeholder: 'sk-...' },
  { id: 'glmApiKey', label: 'Zhipu AI (GLM)', botKey: 'chatglm', placeholder: 'glm-...' },
  { id: 'qwenApiKey', label: 'Alibaba (Qwen)', botKey: 'qianwen', placeholder: 'sk-...' },
]

const SettingPage: FC = () => {
  const { t } = useTranslation()
  const [config, setConfig] = useState<UserConfig | null>(null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    getUserConfig().then(setConfig)
  }, [])

  const update = useCallback((key: keyof UserConfig, value: string) => {
    setConfig((prev) => (prev ? { ...prev, [key]: value } : prev))
    setDirty(true)
  }, [])

  const save = useCallback(async () => {
    if (!config) return
    await updateUserConfig(config)
    setDirty(false)
    toast.success(t('Saved'))
  }, [config, t])

  if (!config) return null

  return (
    <div className="overflow-y-auto h-full">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-primary-text">
            {t('Settings')} <span className="text-sm font-normal text-secondary-text">v{getVersion()}</span>
          </h1>
        </div>
        <div className="flex flex-col gap-4">
          {PROVIDER_CONFIGS.map((provider) => {
            const bot = CHATBOTS[provider.botKey as keyof typeof CHATBOTS]
            return (
              <div key={provider.id} className="flex flex-col gap-1.5 border border-primary-border rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                  {bot && <img src={bot.avatar} className="w-5 h-5 rounded object-contain" />}
                  <span className="font-medium text-sm text-primary-text">{provider.label}</span>
                </div>
                <input
                  type="password"
                  className="w-full bg-secondary border border-primary-border rounded-lg px-3 py-2 text-sm text-primary-text placeholder:text-light-text focus:outline-none focus:ring-1 focus:ring-primary-blue"
                  placeholder={provider.placeholder}
                  value={(config[provider.id] as string) || ''}
                  onChange={(e) => update(provider.id, e.currentTarget.value)}
                />
                {bot && (
                  <span className="text-xs text-light-text">
                    Modelos: {bot.name}
                  </span>
                )}
              </div>
            )
          })}
        </div>
        <p className="text-xs text-light-text mt-4 px-1">
          {t('Your keys are stored locally and never sent to any server')}
        </p>
        {dirty && (
          <div className="sticky bottom-0 mt-6 pt-4 border-t border-primary-border">
            <button
              onClick={save}
              className="w-full bg-primary-blue text-white rounded-xl py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
            >
              {t('Save changes')}
            </button>
          </div>
        )}
      </div>
      <Toaster position="bottom-center" />
    </div>
  )
}

export default SettingPage
