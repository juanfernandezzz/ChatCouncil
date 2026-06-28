import { FC } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '~app/components/Button'

interface Props {
  botId: string
  botName: string
  avatar: string
  onLogin: () => void
}

const PROVIDER_LOGIN_URLS: Record<string, string> = {
  chatgpt: 'https://chat.openai.com',
  claude: 'https://claude.ai',
  gemini: 'https://gemini.google.com',
  deepseek: 'https://chat.deepseek.com',
  perplexity: 'https://www.perplexity.ai',
  chatglm: 'https://chat.z.ai',
}

const LoginCTA: FC<Props> = ({ botId, botName, avatar, onLogin }) => {
  const { t } = useTranslation()
  const loginUrl = PROVIDER_LOGIN_URLS[botId] || PROVIDER_LOGIN_URLS.chatgpt

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
      <img src={avatar} className="w-12 h-12 object-contain rounded-full opacity-60" />
      <div className="text-lg font-semibold text-primary-text">{botName}</div>
      <p className="text-sm text-light-text max-w-xs">
        {t('Sign in to {provider} or configure an API key in settings to use this panel.', { provider: botName })}
      </p>
      <div className="flex flex-row gap-3 mt-2">
        <Button text={t('Sign in')} color="primary" onClick={() => window.open(loginUrl, '_blank')} />
        <Button text={t('Settings')} color="flat" onClick={onLogin} />
      </div>
    </div>
  )
}

export default LoginCTA
