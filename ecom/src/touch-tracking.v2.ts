const API_BASE_URL = (
  import.meta.env.VITE_ATTRIBUTION_API_URL || 'http://localhost:5000'
).replace(/\/+$/, '')
const ENDPOINT = `${API_BASE_URL}/v1/touches`
const API_KEY = import.meta.env.VITE_ATTRIBUTION_API_KEY
const VISITOR_COOKIE = 'aid_vid'
const SESSION_KEY = 'aid_session'
const VISITOR_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365 * 2
const SESSION_WINDOW_MS = 30 * 60 * 1000

type TouchPayload = {
  visitorId: string
  touchedAt: string
  source: string | null
  medium: string | null
  campaign: string | null
  term: string | null
  content: string | null
  referrer: string | null
  landingPage: string
  pageTitle: string
  gclid: string | null
  fbclid: string | null
  ttclid: string | null
  msclkid: string | null
  fbc: string | null
  fbp: string | null
  ga: string | null
}

type StoredSession = { at: number; sig: string }
type TouchResponse = {
  id: string
  visitorId: string
  channel: string
  touchedAt: string
}

function getCookie(name: string): string | null {
  const prefix = `${name}=`
  const cookie = document.cookie.split('; ').find((entry) => entry.startsWith(prefix))
  if (!cookie) return null

  try {
    return decodeURIComponent(cookie.slice(prefix.length))
  } catch (error) {
    console.error(`Could not decode the ${name} cookie.`, error)
    return null
  }
}

function createVisitorId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()

  const randomHex = () => Math.floor(Math.random() * 16).toString(16)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const value = Number.parseInt(randomHex(), 16)
    return (character === 'x' ? value : (value & 0x3) | 0x8).toString(16)
  })
}

function getVisitorId(): string {
  const existingId = getCookie(VISITOR_COOKIE)
  if (existingId) return existingId

  const visitorId = createVisitorId()
  const secureAttribute = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie =
    `${VISITOR_COOKIE}=${encodeURIComponent(visitorId)}; max-age=${VISITOR_COOKIE_MAX_AGE_SECONDS}; path=/; SameSite=Lax${secureAttribute}`
  return visitorId
}

function getQueryParameter(params: URLSearchParams, name: string): string | null {
  return params.get(name) ?? params.get(`utm_${name}`)
}

function readStoredSession(): StoredSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null

    const value: unknown = JSON.parse(raw)
    if (
      typeof value === 'object' &&
      value !== null &&
      'at' in value &&
      typeof value.at === 'number' &&
      'sig' in value &&
      typeof value.sig === 'string'
    ) {
      return { at: value.at, sig: value.sig }
    }
  } catch (error) {
    console.error('Could not read attribution session state.', error)
  }
  return null
}

function getTouchSignature(payload: TouchPayload): string {
  return [
    payload.visitorId,
    payload.source,
    payload.medium,
    payload.campaign,
    payload.gclid,
    payload.fbclid,
    payload.ttclid,
    payload.msclkid,
  ].join('|')
}

function hasMarketingSignal(payload: TouchPayload): boolean {
  return [
    payload.source,
    payload.medium,
    payload.campaign,
    payload.gclid,
    payload.fbclid,
    payload.ttclid,
    payload.msclkid,
  ].some(Boolean)
}

function shouldSendTouch(payload: TouchPayload): boolean {
  const previous = readStoredSession()
  if (!previous || Date.now() - previous.at > SESSION_WINDOW_MS) return true

  return previous.sig !== getTouchSignature(payload) && hasMarketingSignal(payload)
}

function saveSuccessfulTouch(payload: TouchPayload): void {
  try {
    sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ at: Date.now(), sig: getTouchSignature(payload) }),
    )
  } catch (error) {
    console.error('Could not save attribution session state.', error)
  }
}

function isTouchResponse(value: unknown): value is TouchResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'visitorId' in value &&
    typeof value.visitorId === 'string' &&
    'channel' in value &&
    typeof value.channel === 'string' &&
    'touchedAt' in value &&
    typeof value.touchedAt === 'string'
  )
}

async function getErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof body.message === 'string'
    ) {
      return body.message
    }
  } catch (error) {
    console.error('Could not read the touch API error response.', error)
  }
  return `Touch request failed with HTTP ${response.status}.`
}

function buildPayload(): TouchPayload {
  const params = new URLSearchParams(window.location.search)
  return {
    visitorId: getVisitorId(),
    touchedAt: new Date().toISOString(),
    source: getQueryParameter(params, 'source'),
    medium: getQueryParameter(params, 'medium'),
    campaign: getQueryParameter(params, 'campaign'),
    term: getQueryParameter(params, 'term'),
    content: getQueryParameter(params, 'content'),
    referrer: document.referrer || null,
    landingPage: window.location.href,
    pageTitle: document.title,
    gclid: params.get('gclid'),
    fbclid: params.get('fbclid'),
    ttclid: params.get('ttclid'),
    msclkid: params.get('msclkid'),
    fbc: getCookie('_fbc'),
    fbp: getCookie('_fbp'),
    ga: getCookie('_ga'),
  }
}

async function captureLandingTouch(): Promise<void> {
  if (!API_KEY) {
    console.error(
      'Touch tracking is not configured: set VITE_ATTRIBUTION_API_KEY in ecom/.env and restart the Vite dev server.',
    )
    return
  }

  const payload = buildPayload()
  console.info('Attribution touch payload:', payload)
  if (!shouldSendTouch(payload)) {
    console.info('Touch not sent: this visitor and campaign were already recorded in the current session.')
    return
  }

  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': API_KEY,
      },
      body: JSON.stringify(payload),
      keepalive: true,
    })
  } catch (error) {
    console.error(
      `Could not reach ${ENDPOINT}. Check that the API is running and allows the storefront origin and X-Api-Key header through CORS.`,
      error,
    )
    return
  }

  if (response.status !== 201) {
    console.error(await getErrorMessage(response))
    return
  }

  let result: unknown
  try {
    result = await response.json()
  } catch (error) {
    console.error('The touch endpoint returned an unreadable JSON response.', error)
    return
  }

  if (!isTouchResponse(result)) {
    console.error('The touch endpoint returned an unexpected response format.', result)
    return
  }

  saveSuccessfulTouch(payload)
  console.info('Attribution touch recorded:', result)
}

void captureLandingTouch()
