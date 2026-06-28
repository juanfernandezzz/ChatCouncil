const KEY = 'tokenUsage'

export async function getTokenUsage() {
  try {
    return Number(localStorage.getItem(KEY)) || 0
  } catch {
    return 0
  }
}

export async function incrTokenUsage(v = 1) {
  const tokenUsage = await getTokenUsage()
  localStorage.setItem(KEY, String(tokenUsage + v))
}

export async function resetTokenUsage() {
  localStorage.removeItem(KEY)
}
