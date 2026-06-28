import Browser from 'webextension-polyfill'

export async function getAppOpenTimes() {
  const { openTimes = 0 } = await Browser.storage.sync.get('openTimes')
  return openTimes
}

export async function incrAppOpenTimes() {
  const openTimes = await getAppOpenTimes()
  Browser.storage.sync.set({ openTimes: openTimes + 1 })
  return openTimes + 1
}


