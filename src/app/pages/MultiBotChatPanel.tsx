import { useAtom, useAtomValue } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { sample, uniqBy } from 'lodash-es'
import { FC, Suspense, useCallback, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { cx } from '~/utils'
import Button from '~app/components/Button'
import ChatMessageInput from '~app/components/Chat/ChatMessageInput'
import LayoutSwitch from '~app/components/Chat/LayoutSwitch'
import { CHATBOTS, Layout } from '~app/consts'
import { useChat } from '~app/hooks/use-chat'
import { BotId } from '../bots'
import ConversationPanel from '../components/Chat/ConversationPanel'

const DEFAULT_BOTS: BotId[] = ['chatgpt', 'claude', 'gemini', 'perplexity', 'deepseek', 'chatglm'] as BotId[]

const layoutAtom = atomWithStorage<Layout>('multiPanelLayout', 'sixGrid', undefined, { getOnInit: true })
const twoPanelBotsAtom = atomWithStorage<BotId[]>('multiPanelBots:2', DEFAULT_BOTS.slice(0, 2))
const threePanelBotsAtom = atomWithStorage<BotId[]>('multiPanelBots:3', DEFAULT_BOTS.slice(0, 3))
const fourPanelBotsAtom = atomWithStorage<BotId[]>('multiPanelBots:4', DEFAULT_BOTS.slice(0, 4))
const sixPanelBotsAtom = atomWithStorage<BotId[]>('multiPanelBots:6', DEFAULT_BOTS)

function replaceDeprecatedBots(bots: BotId[]): BotId[] {
  return bots.map((bot) => {
    if (CHATBOTS[bot]) {
      return bot
    }
    return sample(DEFAULT_BOTS)!
  })
}

const GeneralChatPanel: FC<{
  chats: ReturnType<typeof useChat>[]
  setBots?: ReturnType<typeof useAtom<typeof twoPanelBotsAtom>>[1]
  botIds: BotId[]
  supportImageInput?: boolean
}> = ({ chats, setBots, botIds, supportImageInput }) => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const generating = useMemo(() => chats.some((c) => c.generating), [chats])
  const [layout, setLayout] = useAtom(layoutAtom)

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
      if (!setBots) {
        return
      }
      setBots((bots) => {
        const newBots = [...bots]
        newBots[index] = botId
        return newBots
      })
    },
    [setBots],
  )

  const onLayoutChange = useCallback(
    (v: Layout) => {
      setLayout(v)
    },
    [setLayout],
  )

  return (
    <div className="flex flex-col overflow-hidden h-full">
      <div
        className={cx(
          'grid overflow-hidden grow auto-rows-fr',
          chats.length % 3 === 0 ? 'grid-cols-3' : 'grid-cols-2',
          chats.length > 3 ? 'gap-2 mb-2' : 'gap-3 mb-3',
        )}
      >
        {chats.map((chat, index) => (
          <ConversationPanel
            key={`${chat.botId}-${index}`}
            botId={chat.botId}
            bot={chat.bot}
            messages={chat.messages}
            onUserSendMessage={(input) => sendSingleMessage(input, chat.botId)}
            generating={chat.generating}
            stopGenerating={chat.stopGenerating}
            mode="compact"
            resetConversation={chat.resetConversation}
            onSwitchBot={setBots ? (botId) => onSwitchBot(botId, index) : undefined}
            onOpenSettings={() => navigate({ to: '/setting' })}
          />
        ))}
      </div>
      <div className="flex flex-row gap-3">
        <LayoutSwitch layout={layout} onChange={onLayoutChange} />
        <ChatMessageInput
          mode="full"
          className="rounded-2xl bg-primary-background px-4 py-2 grow"
          disabled={generating}
          onSubmit={sendAllMessage}
          actionButton={!generating && <Button text={t('Send')} color="primary" type="submit" />}
          autoFocus={true}
          supportImageInput={supportImageInput}
        />
      </div>
    </div>
  )
}

const TwoBotChatPanel = () => {
  const [bots, setBots] = useAtom(twoPanelBotsAtom)
  const multiPanelBotIds = useMemo(() => replaceDeprecatedBots(bots), [bots])
  const chat1 = useChat(multiPanelBotIds[0])
  const chat2 = useChat(multiPanelBotIds[1])
  const chats = useMemo(() => [chat1, chat2], [chat1, chat2])
  return <GeneralChatPanel chats={chats} botIds={multiPanelBotIds} setBots={setBots} />
}

const ThreeBotChatPanel = () => {
  const [bots, setBots] = useAtom(threePanelBotsAtom)
  const multiPanelBotIds = useMemo(() => replaceDeprecatedBots(bots), [bots])
  const chat1 = useChat(multiPanelBotIds[0])
  const chat2 = useChat(multiPanelBotIds[1])
  const chat3 = useChat(multiPanelBotIds[2])
  const chats = useMemo(() => [chat1, chat2, chat3], [chat1, chat2, chat3])
  return <GeneralChatPanel chats={chats} botIds={multiPanelBotIds} setBots={setBots} />
}

const FourBotChatPanel = () => {
  const [bots, setBots] = useAtom(fourPanelBotsAtom)
  const multiPanelBotIds = useMemo(() => replaceDeprecatedBots(bots), [bots])
  const chat1 = useChat(multiPanelBotIds[0])
  const chat2 = useChat(multiPanelBotIds[1])
  const chat3 = useChat(multiPanelBotIds[2])
  const chat4 = useChat(multiPanelBotIds[3])
  const chats = useMemo(() => [chat1, chat2, chat3, chat4], [chat1, chat2, chat3, chat4])
  return <GeneralChatPanel chats={chats} botIds={multiPanelBotIds} setBots={setBots} />
}

const SixBotChatPanel = () => {
  const [bots, setBots] = useAtom(sixPanelBotsAtom)
  const multiPanelBotIds = useMemo(() => replaceDeprecatedBots(bots), [bots])
  const chat1 = useChat(multiPanelBotIds[0])
  const chat2 = useChat(multiPanelBotIds[1])
  const chat3 = useChat(multiPanelBotIds[2])
  const chat4 = useChat(multiPanelBotIds[3])
  const chat5 = useChat(multiPanelBotIds[4])
  const chat6 = useChat(multiPanelBotIds[5])
  const chats = useMemo(() => [chat1, chat2, chat3, chat4, chat5, chat6], [chat1, chat2, chat3, chat4, chat5, chat6])
  return <GeneralChatPanel chats={chats} botIds={multiPanelBotIds} setBots={setBots} />
}

const ImageInputPanel = () => {
  const chat1 = useChat('chatgpt')
  const chat2 = useChat('bing')
  const chat3 = useChat('bard')
  const chats = useMemo(() => [chat1, chat2, chat3], [chat1, chat2, chat3])
  return <GeneralChatPanel chats={chats} botIds={['chatgpt', 'bing', 'bard']} supportImageInput={true} />
}

const MultiBotChatPanel: FC = () => {
  const layout = useAtomValue(layoutAtom)
  if (layout === 'sixGrid') {
    return <SixBotChatPanel />
  }
  if (layout === 4) {
    return <FourBotChatPanel />
  }
  if (layout === 3) {
    return <ThreeBotChatPanel />
  }
  if (layout === 'imageInput') {
    return <ImageInputPanel />
  }
  return <TwoBotChatPanel />
}

const MultiBotChatPanelPage: FC = () => {
  return (
    <Suspense>
      <MultiBotChatPanel />
    </Suspense>
  )
}

export default MultiBotChatPanelPage
