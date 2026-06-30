import { ofetch } from 'ofetch'

export async function decodePoeFormkey(html: string): Promise<string> {
  const resp = await ofetch('https://chatcouncil.app/api/poe/decode-formkey', {
    method: 'POST',
    body: { html },
  })
  return resp.formkey
}
