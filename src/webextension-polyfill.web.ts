class WebStorage {
  private prefix: string
  constructor(prefix: string) { this.prefix = prefix }
  async get(keys?: any) {
    if (!keys) {
      const all: Record<string, any> = {}
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k?.startsWith(this.prefix)) {
          all[k.slice(this.prefix.length)] = JSON.parse(localStorage.getItem(k)!)
        }
      }
      return all
    }
    const arr = Array.isArray(keys) ? keys : (keys && typeof keys === 'object' ? Object.keys(keys) : [keys])
    const result: Record<string, any> = {}
    for (const k of arr) {
      const raw = localStorage.getItem(this.prefix + k)
      result[k] = raw ? JSON.parse(raw) : undefined
    }
    return result
  }
  async set(items: Record<string, any>) {
    for (const [k, v] of Object.entries(items)) {
      localStorage.setItem(this.prefix + k, JSON.stringify(v))
    }
  }
  async remove(keys: string | string[]) {
    const arr = Array.isArray(keys) ? keys : [keys]
    for (const k of arr) localStorage.removeItem(this.prefix + k)
  }
  async clear() {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(this.prefix)) toRemove.push(k)
    }
    for (const k of toRemove) localStorage.removeItem(k)
  }
}

const webBrowser = {
  storage: {
    sync: new WebStorage('sync:'),
    local: new WebStorage('local:'),
    session: new WebStorage('session:'),
  },
  runtime: {
    getURL: (path: string) => path,
    getManifest: () => ({ version: '1.0.0' }),
    onConnect: { addListener: () => {} },
    onMessage: { addListener: () => {} },
    sendMessage: async () => undefined,
  },
  tabs: {
    create: async () => ({}),
    query: async () => [],
    update: async () => {},
    remove: async () => {},
    reload: async () => {},
    connect: () => ({ onMessage: { addListener: () => {} }, postMessage: () => {} }),
    sendMessage: async () => undefined,
    getZoom: async () => 1,
    setZoom: async () => {},
  },
  permissions: {
    contains: async () => true,
    request: async () => true,
  },
  commands: {
    getAll: async () => [],
  },
  scripting: {
    executeScript: async () => [],
  },
  action: {
    onClicked: { addListener: () => {} },
  },
}

export default webBrowser
export { webBrowser as Browser }
