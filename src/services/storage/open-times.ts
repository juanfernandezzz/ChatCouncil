const KEY = 'openTimes'

export async function getAppOpenTimes() {
  try {
    return Number(localStorage.getItem(KEY)) || 0
  } catch {
    return 0
  }
}

export async function incrAppOpenTimes() {
  const openTimes = await getAppOpenTimes()
  localStorage.setItem(KEY, String(openTimes + 1))
  return openTimes + 1
}
