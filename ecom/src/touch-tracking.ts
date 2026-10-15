const API_KEY = 'pk_test_MFug-NcERchZ2cHupE8-EwwZpKDtWkPYaxZladwla1U'
const ENDPOINT = 'http://localhost:3000/v1/touches'
const SESSION_KEY = 'aid_session'
const SESSION_WINDOW_MS = 30 * 60 * 1000

type TouchPayload = {
  visitorId: string
  touchedAt: string
  source: string | null
  medium: string | null
  campaign: string | null
  term: string | null
  content: string | null
  gclid: string | null
  fbclid: string | null
  ttclid: string | null
  msclkid: string | null
  referrer: string | null
  landingPage: string
  pageTitle: string
}

type StoredSession = { at: number; sig: string }

function getVisitorId(): string {
  const match = document.cookie.match(/(?:^|; )aid_vid=([^;]+)/)
  if (match) {
    try {
      return decodeURIComponent(match[1])
    } catch (error) {
      console.error('Could not decode the saved attribution visitor ID.', error)
    }
  }

  const visitorId = typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  document.cookie = `aid_vid=${encodeURIComponent(visitorId)}; max-age=63072000; path=/; SameSite=Lax`
  return visitorId
}

function getParameter(params: URLSearchParams, name: string): string | null {
  return params.get(name) ?? params.get(`utm_${name}`)
}

function shouldSendTouch(payload: TouchPayload): boolean {
  const signature = [
    payload.visitorId,
    payload.source,
    payload.medium,
    payload.campaign,
    payload.gclid,
    payload.fbclid,
    payload.ttclid,
    payload.msclkid,
  ].join('|')

  let last: StoredSession | null = null
  try {
    const saved = sessionStorage.getItem(SESSION_KEY)
    if (saved) {
      const parsed: unknown = JSON.parse(saved)
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'at' in parsed &&
        typeof parsed.at === 'number' &&
        'sig' in parsed &&
        typeof parsed.sig === 'string'
      ) {
        last = { at: parsed.at, sig: parsed.sig }
      }
    }
  } catch (error) {
    console.error('Could not read attribution session state.', error)
  }

  const isNewSession = !last || Date.now() - last.at > SESSION_WINDOW_MS
  const campaignChanged = last !== null && last.sig !== signature && signature !== '|||||||'
  if (!isNewSession && !campaignChanged) return false

  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ at: Date.now(), sig: signature }))
  } catch (error) {
    console.error('Could not save attribution session state.', error)
  }
  return true
}

function captureLandingTouch(): void {
  const params = new URLSearchParams(window.location.search)
  const payload: TouchPayload = {
    visitorId: getVisitorId(),
    touchedAt: new Date().toISOString(),
    source: getParameter(params, 'source'),
    medium: getParameter(params, 'medium'),
    campaign: getParameter(params, 'campaign'),
    term: getParameter(params, 'term'),
    content: getParameter(params, 'content'),
    gclid: params.get('gclid'),
    fbclid: params.get('fbclid'),
    ttclid: params.get('ttclid'),
    msclkid: params.get('msclkid'),
    referrer: document.referrer || null,
    landingPage: window.location.href,
    pageTitle: document.title,
  }

  console.log('Attribution touch payload:', payload)
  if (!shouldSendTouch(payload)) {
    console.log('Should not send touch for now')
    return
  }

  void fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(payload),
    keepalive: true,
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Touch request failed with HTTP ${response.status}`)
      }
      console.log('Attribution touch response:', await response.json())
    })
    .catch((error: unknown) => {
      console.error('Could not send attribution touch.', error)
    })
}

captureLandingTouch()
