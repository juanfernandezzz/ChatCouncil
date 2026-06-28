import claudeLogo from '~/assets/logos/anthropic.png'
import chatgptLogo from '~/assets/logos/chatgpt.png'
import geminiLogo from '~/assets/logos/gemini.png'
import grokLogo from '~/assets/logos/grok.png'
import deepseekLogo from '~/assets/logos/deepseek.png'
import pplxLogo from '~/assets/logos/pplx.png'
import zaiLogo from '~/assets/logos/zai.png'
import moonshotLogo from '~/assets/logos/moonshot.png'
import minimaxLogo from '~/assets/logos/minimax.png'
import qianwenLogo from '~/assets/logos/qianwen.png'
import { BotId } from './bots'

export const CHATBOTS: Record<BotId, { name: string; avatar: string }> = {
  chatgpt: {
    name: 'GPT-5.5',
    avatar: chatgptLogo,
  },
  'chatgpt-thinking': {
    name: 'GPT-5.5 Thinking',
    avatar: chatgptLogo,
  },
  claude: {
    name: 'Claude Sonnet 4.6',
    avatar: claudeLogo,
  },
  'gemini-flash-35': {
    name: 'Gemini 3.5 Flash',
    avatar: geminiLogo,
  },
  gemini: {
    name: 'Gemini 3.1 Pro',
    avatar: geminiLogo,
  },
  'gemini-flash-3': {
    name: 'Gemini 3 Flash',
    avatar: geminiLogo,
  },
  grok: {
    name: 'Grok 4.3',
    avatar: grokLogo,
  },
  deepseek: {
    name: 'DeepSeek-V4 Pro',
    avatar: deepseekLogo,
  },
  kimi: {
    name: 'Kimi K2.7 Code',
    avatar: moonshotLogo,
  },
  minimax: {
    name: 'MiniMax M3',
    avatar: minimaxLogo,
  },
  chatglm: {
    name: 'GLM-5.2',
    avatar: zaiLogo,
  },
  qianwen: {
    name: 'Qwen3.7 Plus',
    avatar: qianwenLogo,
  },
  perplexity: {
    name: 'Perplexity Sonar',
    avatar: pplxLogo,
  },
}

export const CHATGPT_HOME_URL = 'https://chat.openai.com'
export const CHATGPT_API_MODELS = ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo'] as const
export const ALL_IN_ONE_PAGE_ID = 'all'

export const DEFAULT_CHATGPT_SYSTEM_MESSAGE =
  'You are ChatGPT, a large language model trained by OpenAI. Answer as concisely as possible. Knowledge cutoff: 2021-09-01. Current date: {current_date}'

export type Layout = 2 | 3 | 4 | 'imageInput' | 'twoVertical' | 'sixGrid' // twoVertical is deprecated

export const PROVIDER_LOGIN_URLS: Record<string, string> = {
  chatgpt: 'https://chat.openai.com',
  claude: 'https://claude.ai',
  gemini: 'https://gemini.google.com',
  deepseek: 'https://chat.deepseek.com',
  perplexity: 'https://www.perplexity.ai',
  chatglm: 'https://chat.z.ai',
}
