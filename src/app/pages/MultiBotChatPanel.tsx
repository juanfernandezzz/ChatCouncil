import { useAtom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { uniqBy } from 'lodash-es'
import { FC, Suspense, useCallback, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import Button from '~app/components/Button'
import ChatMessageInput from '~app/components/Chat/ChatMessageInput'
import { useChat } from '~app/hooks/use-chat'
import { BotId } from '../bots'
import ConversationPanel from '../components/Chat/ConversationPanel'

const DEFAULT_BOTS: BotId[] = ['chatgpt', 'claude', 'gemini', 'perplexity', 'deepseek', 'chatglm']
const panelBotsAtom = atomWithStorage<BotId[]>('chatCouncilPanelBots', DEFAULT_BOTS, undefined, { getOnInit: true })

const MultiBotChatPanelPage: FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [panelBots, setPanelBots] = useAtom(panelBotsAtom)

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
      const chat = chats.find((c) => c.botId === botId)
      chat?.sendMessage(input)
    },
    [chats],
  )

  const sendAllMessage = useCallback(
    (input: string, image?: File) => {
      uniqBy(chats, (c) => c.botId).forEach((c) => c.sendMessage(input, image))
    },
    [chats],
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
        <div className="flex flex-row gap-3 px-4 pb-4">
          <ChatMessageInput
            mode="full"
            className="rounded-2xl bg-secondary px-4 py-2 grow shadow-sm"
            disabled={generating}
            onSubmit={sendAllMessage}
            actionButton={!generating && <Button text={t('Send')} color="primary" type="submit" />}
            autoFocus={true}
          />
        </div>
      </div>
    </Suspense>
  )
}

export default MultiBotChatPanelPage
