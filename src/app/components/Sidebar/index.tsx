import { Link, useLocation } from '@tanstack/react-router'
import { useAtom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import logoIcon from '~/assets/logo-chatcouncil.svg'
import { cx } from '~/utils'
import { BotId } from '~app/bots'
import { CHATBOTS } from '~app/consts'
import { loadHistoryMessages } from '~services/chat-history'

const TOOLS = [
  { id: 'image', label: 'Generador de Imágenes', icon: 'image' },
  { id: 'translate', label: 'AI Traductor', icon: 'translate' },
  { id: 'summary', label: 'Resumen Web', icon: 'summary' },
]

const MODEL_IDS: BotId[] = [
  'chatgpt', 'chatgpt-thinking', 'claude', 'gemini-flash-35', 'gemini',
  'gemini-flash-3', 'grok', 'deepseek', 'kimi', 'minimax',
  'chatglm', 'qianwen', 'perplexity',
]

const historyExpandedAtom = atomWithStorage('sidebarHistoryExpanded', true, undefined, { getOnInit: true })

function HistorySection() {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useAtom(historyExpandedAtom)
  const [search, setSearch] = useState('')
  const [histories, setHistories] = useState<{ botId: string; preview: string; time: string }[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    Promise.all(
      MODEL_IDS.map(async (botId) => {
        const msgs = await loadHistoryMessages(botId)
        return msgs.slice(0, 3).map((m) => ({
          botId,
          preview: m.messages[0]?.text?.slice(0, 60) || '(empty)',
          time: new Date(m.createdAt).toLocaleDateString(),
        }))
      }),
    ).then((results) => {
      setHistories(results.flat().sort((a, b) => b.time.localeCompare(a.time)).slice(0, 10))
    })
  }, [])

  const filtered = useMemo(
    () => (search ? histories.filter((h) => h.preview.toLowerCase().includes(search.toLowerCase())) : histories),
    [search, histories],
  )

  return (
    <div className="mt-4">
      <div
        className="flex items-center justify-between px-3 py-1.5 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="text-xs font-semibold text-light-text uppercase tracking-wide">{t('History')}</span>
        <svg
          className={cx('w-3.5 h-3.5 text-light-text transition-transform', expanded && 'rotate-180')}
          viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      {expanded && (
        <div className="mt-1">
          <div className="relative px-3 mb-1">
            <svg
              className="absolute left-5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-light-text pointer-events-none"
              viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('Search history...')}
              className="w-full bg-secondary rounded-lg pl-8 pr-2 py-1.5 text-xs text-primary-text placeholder:text-light-text focus:outline-none"
            />
          </div>
          <div className="flex flex-col gap-0.5 max-h-[200px] overflow-y-auto scrollbar-none">
            {filtered.slice(0, 5).map((h, i) => {
              const bot = CHATBOTS[h.botId as keyof typeof CHATBOTS]
              return (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-secondary cursor-pointer transition-colors">
                  {bot && <img src={bot.avatar} className="w-3.5 h-3.5 rounded object-contain shrink-0" />}
                  <span className="text-xs text-secondary-text truncate flex-1">{h.preview}</span>
                  <span className="text-[10px] text-light-text shrink-0">{h.time}</span>
                </div>
              )
            })}
          </div>
          <Link
            to="/setting"
            className="block text-xs text-primary-blue hover:text-primary-blue/80 px-3 py-1.5 transition-colors"
          >
            {t('View all')}
          </Link>
        </div>
      )}
    </div>
  )
}

function Sidebar() {
  const location = useLocation()

  return (
    <aside className="hidden sm:flex w-[260px] px-4 flex-col bg-primary-background bg-opacity-40 overflow-hidden">
      <div className="flex items-center justify-between pt-4 pb-2">
        <img src={logoIcon} className="ml-2 w-[90px]" alt="ChatCouncil" />
      </div>
      <div className="scrollbar-none mt-3 flex flex-col gap-0.5 overflow-y-auto flex-1">
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
        <HistorySection />
        <div className="text-xs font-semibold text-light-text uppercase tracking-wide mt-4 mb-1 px-3">
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
        <div className="text-xs font-semibold text-light-text uppercase tracking-wide mt-4 mb-1 px-3">
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
