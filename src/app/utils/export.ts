import { fileOpen, fileSave } from 'browser-fs-access'

export async function exportData() {
  const data: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key) {
      data[key] = localStorage.getItem(key) || ''
    }
  }
  const blob = new Blob([JSON.stringify({ localStorage: data }, null, 2)], { type: 'application/json' })
  await fileSave(blob, { fileName: 'chatcouncil.json' })
}

export async function importData() {
  const blob = await fileOpen({ extensions: ['.json'] })
  const json = JSON.parse(await blob.text())
  if (!json.localStorage) {
    throw new Error('Invalid data')
  }
  if (!window.confirm('Are you sure you want to import data? This will overwrite your current data')) {
    return
  }
  for (const [k, v] of Object.entries(json.localStorage as Record<string, string>)) {
    localStorage.setItem(k, v)
  }
  alert('Imported data successfully')
  location.reload()
}
