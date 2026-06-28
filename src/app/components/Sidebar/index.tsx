import { Link, useLocation } from '@tanstack/react-router'
import { cx } from '~/utils'
import { CHATBOTS } from '~app/consts'
import { BotId } from '~app/bots'
import logoIcon from '~/assets/logo-chatcouncil.svg'

const TOOLS = [
  { id: 'image', label: 'Generador de Imágenes' },
  { id: 'translate', label: 'AI Traductor' },
  { id: 'summary', label: 'Resumen Web' },
]

const MODEL_IDS: BotId[] = [
  'chatgpt', 'chatgpt-thinking', 'claude', 'gemini-flash-35', 'gemini',
  'gemini-flash-3', 'grok', 'deepseek', 'kimi', 'minimax',
  'chatglm', 'qianwen', 'perplexity',
]

function Sidebar() {
  const location = useLocation()

  return (
    <aside className="hidden sm:flex w-[260px] px-4 flex-col bg-primary-background bg-opacity-40 overflow-hidden">
      <div className="flex items-center justify-between pt-4 pb-2">
        <img src={logoIcon} className="ml-2 w-[90px]" alt="ChatCouncil" />
      </div>
      <div className="scrollbar-none mt-4 flex flex-col gap-1 overflow-y-auto flex-1">
        <Link
          to="/"
          className={cx(
            'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
            location.pathname === '/'
              ? 'bg-secondary font-medium text-primary-text'
              : 'text-secondary-text hover:bg-secondary hover:text-primary-text',
          )}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />
          </svg>
          All-In-One
        </Link>
        <div className="text-xs font-semibold text-light-text uppercase tracking-wide mt-5 mb-2 px-3">
          Herramientas
        </div>
        {TOOLS.map((tool) => (
          <div
            key={tool.id}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-secondary-text cursor-not-allowed opacity-60"
          >
            <div className="w-5 h-5 rounded bg-secondary flex items-center justify-center">
              <svg className="w-3.5 h-3.5 text-light-text" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            {tool.label}
          </div>
        ))}
        <div className="text-xs font-semibold text-light-text uppercase tracking-wide mt-5 mb-2 px-3">
          Modelos
        </div>
        {MODEL_IDS.map((botId) => {
          const bot = CHATBOTS[botId]
          if (!bot) return null
          return (
            <Link
              key={botId}
              to="/"
              className={cx(
                'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                'text-secondary-text hover:bg-secondary hover:text-primary-text',
              )}
            >
              <img src={bot.avatar} className="w-5 h-5 rounded object-contain" />
              <span>{bot.name}</span>
            </Link>
          )
        })}
      </div>
      <div className="mt-auto mb-4 pt-3 flex flex-row gap-3 px-1">
        <Link
          to="/setting"
          className="p-2 rounded-lg text-secondary-text hover:bg-secondary hover:text-primary-text transition-colors"
          title="Configuración"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </Link>
      </div>
    </aside>
  )
}

export default Sidebar
