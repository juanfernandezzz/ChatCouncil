import { motion, AnimatePresence } from 'framer-motion'
import { FC, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ChatMessageModel } from '~types'
import { cx } from '~/utils'

interface PanelMessages {
  botId: string
  botName: string
  botAvatar: string
  messages: ChatMessageModel[]
}

interface Props {
  open: boolean
  onClose: () => void
  panels: PanelMessages[]
}

const CompareDrawer: FC<Props> = ({ open, onClose, panels }) => {
  const { t } = useTranslation()

  const latestMessages = useMemo(() => {
    return panels.map((p) => ({
      botId: p.botId,
      botName: p.botName,
      botAvatar: p.botAvatar,
      lastUser: [...p.messages].reverse().find((m) => m.author === 'user'),
      lastBot: [...p.messages].reverse().find((m) => m.author !== 'user'),
    }))
  }, [panels])

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="fixed right-0 top-0 h-full w-[400px] max-w-[90vw] bg-primary-background border-l border-primary-border z-40 flex flex-col shadow-2xl"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-primary-border">
            <h2 className="text-sm font-semibold text-primary-text">{t('Compare & Summarize')}</h2>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-secondary text-secondary-text transition-colors">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {latestMessages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-light-text">
                {t('Send messages to compare responses')}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {latestMessages.map((item, i) => {
                  if (!item.lastBot) return null
                  return (
                    <div key={i} className="border border-primary-border rounded-xl overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 bg-secondary/50 border-b border-primary-border">
                        <img src={item.botAvatar} className="w-4 h-4 rounded object-contain" />
                        <span className="text-xs font-medium text-primary-text">{item.botName}</span>
                      </div>
                      <div className="px-3 py-2">
                        {item.lastUser && (
                          <div className="mb-2">
                            <span className="text-[10px] text-light-text uppercase tracking-wide">{t('Prompt')}</span>
                            <p className="text-xs text-secondary-text mt-0.5 line-clamp-2">{item.lastUser.text}</p>
                          </div>
                        )}
                        <div>
                          <span className="text-[10px] text-light-text uppercase tracking-wide">{t('Response')}</span>
                          <p className="text-xs text-primary-text mt-0.5 line-clamp-4">{item.lastBot.text || t('Generating...')}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <div className="p-3 border-t border-primary-border">
            <button className="w-full bg-primary-blue text-white rounded-xl py-2 text-xs font-medium hover:opacity-90 transition-opacity">
              {t('Summarize all')}
            </button>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  )
}

export { type PanelMessages }
export default CompareDrawer
