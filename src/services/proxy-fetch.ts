export async function proxyFetch(_tabId: number, url: string, options?: RequestInit): Promise<Response> {
  return fetch(url, options)
}
