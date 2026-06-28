import { ChatGPTBot } from './chatgpt'
import { ClaudeBot } from './claude'
import { GeminiBot } from './gemini-api'
import { GrokWebBot } from './grok'
import { PerplexityBot } from './perplexity'
import { QianwenWebBot } from './qianwen'

export type BotId =
  | 'chatgpt'
  | 'chatgpt-thinking'
  | 'claude'
  | 'gemini-flash-35'
  | 'gemini'
  | 'gemini-flash-3'
  | 'grok'
  | 'deepseek'
  | 'kimi'
  | 'minimax'
  | 'chatglm'
  | 'qianwen'
  | 'perplexity'

export function createBotInstance(botId: BotId) {
  switch (botId) {
    case 'chatgpt':
    case 'chatgpt-thinking':
      return new ChatGPTBot()
    case 'claude':
      return new ClaudeBot()
    case 'gemini-flash-35':
    case 'gemini':
    case 'gemini-flash-3':
      return new GeminiBot()
    case 'grok':
      return new GrokWebBot()
    case 'deepseek':
    case 'kimi':
    case 'minimax':
      return new ChatGPTBot()
    case 'chatglm':
      return new ChatGPTBot()
    case 'qianwen':
      return new QianwenWebBot()
    case 'perplexity':
      return new PerplexityBot()
  }
}

export type BotInstance = ReturnType<typeof createBotInstance>
