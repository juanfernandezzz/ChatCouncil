import { useAtom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { uniqBy } from 'lodash-es'
import { FC, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { cx } from '~/utils'
import { isQuotaExhausted } from '~services/quota'
import Button from '~app/components/Button'
import ChatMessageInput from '~app/components/Chat/ChatMessageInput'
import { useChat } from '~app/hooks/use-chat'
import { BotId } from '../bots'
import AuthWizard from '../components/AuthWizard'
import CompareDrawer, { PanelMessages } from '../components/CompareDrawer'
import ConversationPanel from '../components/Chat/ConversationPanel'
import { CHATBOTS } from '../consts'

const DEFAULT_BOTS: BotId[] = ['chatgpt', 'claude', 'gemini', 'perplexity', 'deepseek', 'chatglm']
const panelBotsAtom = atomWithStorage<BotId[]>('chatCouncilPanelBots', DEFAULT_BOTS, undefined, { getOnInit: true })

const AUTH_KEY = 'cc_auth'

function checkAuth(): boolean {
  try {
    const stored = localStorage.getItem(AUTH_KEY)
    if (stored) {
      const auth = JSON.parse(stored)
      return auth.isLoggedIn === true
    }
  } catch { /* ignore */ }
  return false
}

const MultiBotChatPanelPage: FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [panelBots, setPanelBots] = useAtom(panelBotsAtom)
  const [showAuth, setShowAuth] = useState(false)
  const [showCompare, setShowCompare] = useState(false)
  const [webSearch, setWebSearch] = useState(false)
  const [imageGen, setImageGen] = useState(false)

  useEffect(() => {
    if (!checkAuth()) {
      setShowAuth(true)
    }
  }, [])

  const chat1 = useChat(panelBots[0])
  const chat2 = useChat(panelBots[1])
  const chat3 = useChat(panelBots[2])
  const chat4 = useChat(panelBots[3])
  const chat5 = useChat(panelBots[4])
  const chat6 = useChat(panelBots[5])
  const chats = useMemo(() => [chat1, chat2, chat3, chat4, chat5, chat6], [chat1, chat2, chat3, chat4, chat5, chat6])

  const generating = useMemo(() => chats.some((c) => c.generating), [chats])

  const sendSingleMessage = useCallback(
    (input: string, botId: BotId) => {
      if (isQuotaExhausted()) {
        navigate({ to: '/setting' })
        return
      }
      const chat = chats.find((c) => c.botId === botId)
      chat?.sendMessage(input)
    },
    [chats, navigate],
  )

  const sendAllMessage = useCallback(
    (input: string, image?: File) => {
      if (isQuotaExhausted()) {
        navigate({ to: '/setting' })
        return
      }
      uniqBy(chats, (c) => c.botId).forEach((c) => c.sendMessage(input, image))
    },
    [chats, navigate],
  )

  const onSwitchBot = useCallback(
    (botId: BotId, index: number) => {
      setPanelBots((bots) => {
        const next = [...bots]
        next[index] = botId
        return next
      })
    },
    [setPanelBots],
  )

  const comparePanels: PanelMessages[] = useMemo(
    () =>
      chats.map((c) => ({
        botId: c.botId,
        botName: CHATBOTS[c.botId]?.name || c.botId,
        botAvatar: CHATBOTS[c.botId]?.avatar || '',
        messages: c.messages,
      })),
    [chats],
  )

  return (
    <Suspense>
      <div className="flex flex-col overflow-hidden h-full">
        <div className="grid overflow-hidden grow auto-rows-fr grid-cols-3 gap-3 mb-3">
          {chats.map((chat, index) => (
            <ConversationPanel
              key={index}
              botId={chat.botId}
              bot={chat.bot}
              messages={chat.messages}
              onUserSendMessage={(input) => sendSingleMessage(input, chat.botId)}
              generating={chat.generating}
              stopGenerating={chat.stopGenerating}
              mode="compact"
              resetConversation={chat.resetConversation}
              onSwitchBot={(botId) => onSwitchBot(botId, index)}
              onOpenSettings={() => navigate({ to: '/setting' })}
            />
          ))}
        </div>
        <div className="flex flex-row items-center gap-2 px-4 pb-4">
          <button
            onClick={() => setWebSearch(!webSearch)}
            className={cx(
              'p-2 rounded-xl transition-colors',
              webSearch ? 'bg-primary-blue text-white' : 'bg-secondary text-secondary-text hover:text-primary-text',
            )}
            title={t('Web search')}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={() => setImageGen(!imageGen)}
            className={cx(
              'p-2 rounded-xl transition-colors',
              imageGen ? 'bg-primary-blue text-white' : 'bg-secondary text-secondary-text hover:text-primary-text',
            )}
            title={t('Image generation')}
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <ChatMessageInput
            mode="full"
            className="rounded-2xl bg-secondary px-4 py-2 grow shadow-sm"
            disabled={generating}
            onSubmit={sendAllMessage}
            actionButton={
              !generating && (
                <div className="flex flex-row items-center gap-2">
                  <button
                    onClick={() => setShowCompare(true)}
                    className="p-2 rounded-xl bg-secondary text-secondary-text hover:text-primary-text transition-colors"
                    title={t('Compare & Summarize')}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M8 3H5a2 2 0 00-2 2v3m18 0V5a2 2 0 00-2-2h-3m0 18h3a2 2 0 002-2v-3M3 16v3a2 2 0 002 2h3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <Button text={t('Send')} color="primary" type="submit" />
                </div>
              )
            }
            autoFocus={true}
          />
        </div>
      </div>
      {showAuth && <AuthWizard open={true} onClose={() => setShowAuth(false)} />}
      <CompareDrawer open={showCompare} onClose={() => setShowCompare(false)} panels={comparePanels} />
    </Suspense>
  )
}

export default MultiBotChatPanelPage
