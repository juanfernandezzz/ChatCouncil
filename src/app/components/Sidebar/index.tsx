import { Link, useLocation } from '@tanstack/react-router'
import logoIcon from '~/assets/logo-chatcouncil.svg'
import allInOneIcon from '~/assets/all-in-one.svg'
import translateIcon from '~/assets/icons/translate.svg'
import { cx } from '~/utils'
import { CHATBOTS } from '~app/consts'
import { BotId } from '~app/bots'

const TOOLS = [
  { id: 'image', label: 'Generador de Imágenes', icon: '' },
  { id: 'translate', label: 'AI Traductor', icon: translateIcon },
  { id: 'summary', label: 'Resumen Web', icon: '' },
]

const MODEL_IDS: BotId[] = [
  'chatgpt', 'chatgpt-thinking', 'claude', 'gemini-flash-35', 'gemini',
  'gemini-flash-3', 'grok', 'deepseek', 'kimi', 'minimax',
  'chatglm', 'qianwen', 'perplexity',
]

function Sidebar() {
  const location = useLocation()

  return (
    <aside className="flex flex-col bg-white w-[280px] h-full border-r border-gray-200 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-4 border-b border-gray-100">
        <img src={logoIcon} className="w-8 h-8" />
        <span className="text-lg font-semibold text-gray-800">ChatCouncil</span>
      </div>
      <div className="flex flex-col overflow-y-auto flex-1 px-3 py-3 gap-1">
        <NavItem to="/" icon={allInOneIcon} label="All-In-One" active={location.pathname === '/'} />
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-4 mb-1 px-2">Herramientas</div>
        {TOOLS.map((tool) => (
          <div
            key={tool.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-600 cursor-not-allowed opacity-50"
          >
            {tool.icon ? (
              <img src={tool.icon} className="w-5 h-5" />
            ) : (
              <div className="w-5 h-5 rounded bg-gray-200" />
            )}
            {tool.label}
          </div>
        ))}
        <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-4 mb-1 px-2">Modelos</div>
        {MODEL_IDS.map((botId) => {
          const bot = CHATBOTS[botId]
          if (!bot) return null
          const chatPath = `/chat/${botId}`
          return (
            <Link
              key={botId}
              to="/chat/$botId"
              params={{ botId }}
              className={cx(
                'flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors',
                location.pathname === chatPath && 'bg-gray-100 font-medium',
              )}
            >
              <img src={bot.avatar} className="w-5 h-5 rounded object-contain" />
              <span>{bot.name}</span>
            </Link>
          )
        })}
      </div>
      <div className="border-t border-gray-100 px-4 py-3 flex flex-col gap-2">
        <button className="w-full py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors">
          Registrarse
        </button>
        <button className="w-full py-1.5 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50 transition-colors">
          Iniciar sesión
        </button>
      </div>
    </aside>
  )
}

function NavItem({ to, icon, label, active }: { to: string; icon: string; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={cx(
        'flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm transition-colors',
        active ? 'bg-gray-100 font-medium text-gray-800' : 'text-gray-600 hover:bg-gray-50',
      )}
    >
      <img src={icon} className="w-5 h-5" />
      {label}
    </Link>
  )
}

export default Sidebar
