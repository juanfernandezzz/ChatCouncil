export interface Requester {
  fetch(url: string, options?: RequestInit): Promise<Response>
}

class GlobalFetchRequester implements Requester {
  fetch(url: string, options?: RequestInit) {
    return fetch(url, options)
  }
}

export const globalFetchRequester = new GlobalFetchRequester()
export const proxyFetchRequester = new GlobalFetchRequester()
