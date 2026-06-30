import i18next from 'i18next'
import { ofetch } from 'ofetch'

export interface Prompt {
  id: string
  title: string
  prompt: string
}

function getLocalPrompts(): Prompt[] {
  try {
    return JSON.parse(localStorage.getItem('prompts') || '[]')
  } catch {
    return []
  }
}

function setLocalPrompts(prompts: Prompt[]) {
  localStorage.setItem('prompts', JSON.stringify(prompts))
}

export async function loadLocalPrompts() {
  return getLocalPrompts()
}

export async function saveLocalPrompt(prompt: Prompt) {
  const prompts = getLocalPrompts()
  let existed = false
  for (const p of prompts) {
    if (p.id === prompt.id) {
      p.title = prompt.title
      p.prompt = prompt.prompt
      existed = true
      break
    }
  }
  if (!existed) {
    prompts.unshift(prompt)
  }
  setLocalPrompts(prompts)
  return existed
}

export async function removeLocalPrompt(id: string) {
  const prompts = getLocalPrompts()
  setLocalPrompts(prompts.filter((p) => p.id !== id))
}

export async function loadRemotePrompts() {
  return ofetch<Prompt[]>('https://chatcouncil.app/api/community-prompts', {
    params: { language: i18next.language, languages: i18next.languages },
  }).catch((err) => {
    console.error('Failed to load remote prompts', err)
    return []
  })
}
