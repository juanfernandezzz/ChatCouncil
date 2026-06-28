import { zip } from 'lodash-es'
import { BotId } from '~app/bots'
import { ChatMessageModel } from '~types'

interface Conversation {
  id: string
  createdAt: number
}

type ConversationWithMessages = Conversation & { messages: ChatMessageModel[] }

function storageKey(botId: BotId, cid?: string): string {
  return cid ? `conversation:${botId}:${cid}:messages` : `conversations:${botId}`
}

function getItem<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback
  } catch {
    return fallback
  }
}

function setItem(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value))
}

function removeItem(key: string) {
  localStorage.removeItem(key)
}

async function loadHistoryConversations(botId: BotId): Promise<Conversation[]> {
  return getItem<Conversation[]>(storageKey(botId), [])
}

async function deleteHistoryConversation(botId: BotId, cid: string) {
  const conversations = await loadHistoryConversations(botId)
  setItem(storageKey(botId), conversations.filter((c) => c.id !== cid))
}

async function loadConversationMessages(botId: BotId, cid: string): Promise<ChatMessageModel[]> {
  return getItem<ChatMessageModel[]>(storageKey(botId, cid), [])
}

export async function setConversationMessages(botId: BotId, cid: string, messages: ChatMessageModel[]) {
  const conversations = await loadHistoryConversations(botId)
  if (!conversations.some((c) => c.id === cid)) {
    conversations.unshift({ id: cid, createdAt: Date.now() })
    setItem(storageKey(botId), conversations)
  }
  setItem(storageKey(botId, cid), messages)
}

export async function loadHistoryMessages(botId: BotId): Promise<ConversationWithMessages[]> {
  const conversations = await loadHistoryConversations(botId)
  const messagesList = await Promise.all(conversations.map((c) => loadConversationMessages(botId, c.id)))
  return zip(conversations, messagesList).map(([c, messages]) => ({
    id: c!.id,
    createdAt: c!.createdAt,
    messages: messages!,
  }))
}

export async function deleteHistoryMessage(botId: BotId, conversationId: string, messageId: string) {
  const messages = await loadConversationMessages(botId, conversationId)
  const newMessages = messages.filter((m) => m.id !== messageId)
  await setConversationMessages(botId, conversationId, newMessages)
  if (!newMessages.length) {
    await deleteHistoryConversation(botId, conversationId)
  }
}

export async function clearHistoryMessages(botId: BotId) {
  const conversations = await loadHistoryConversations(botId)
  conversations.forEach((c) => removeItem(storageKey(botId, c.id)))
  removeItem(storageKey(botId))
}
