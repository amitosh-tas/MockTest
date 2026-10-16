const API_BASE_URL = (
  import.meta.env.VITE_ATTRIBUTION_API_URL || 'http://localhost:5000'
).replace(/\/+$/, '')
const ENDPOINT = `${API_BASE_URL}/v1/touches`
const API_KEY = import.meta.env.VITE_ATTRIBUTION_API_KEY
const VISITOR_ID_KEY = 'aid_vid'
const TOUCH_HISTORY_KEY = 'aid_touches'
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

type TouchResponse = {
  id: string
  visitorId: string
  channel: string
  touchedAt: string
  [key: string]: unknown
}

type StoredTouch = {
  payload: TouchPayload
  response: TouchResponse
  recordedAt: number
}

export type CheckoutSession = {
  checkoutSessionId: string
  token: string
  visitorId: string
  visitorRecordId: string
  touchIds: string[]
  touchCount: number
  expiresAt: string
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
  try {
    const storedId = localStorage.getItem(VISITOR_ID_KEY)
    if (storedId) return storedId
  } catch (error) {
    console.error('Could not read the saved attribution visitor ID from local storage.', error)
  }

  // Migrate IDs saved by the previous cookie-based tracker before creating a new one.
  const visitorId = getCookie(VISITOR_ID_KEY) || createVisitorId()

  try {
    localStorage.setItem(VISITOR_ID_KEY, visitorId)
  } catch (error) {
    console.error('Could not save the attribution visitor ID to local storage.', error)
    const secureAttribute = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie =
      `${VISITOR_ID_KEY}=${encodeURIComponent(visitorId)}; max-age=63072000; path=/; SameSite=Lax${secureAttribute}`
  }

  return visitorId
}

function getQueryParameter(params: URLSearchParams, name: string): string | null {
  return params.get(name) ?? params.get(`utm_${name}`)
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

function isStoredTouch(value: unknown): value is StoredTouch {
  if (typeof value !== 'object' || value === null || !('payload' in value) || !('response' in value)) {
    return false
  }
  const record = value as { payload?: unknown; response?: unknown; recordedAt?: unknown }
  return (
    typeof record.recordedAt === 'number' &&
    typeof record.payload === 'object' &&
    record.payload !== null &&
    typeof record.response === 'object' &&
    record.response !== null
  )
}

function readTouchHistory(): StoredTouch[] {
  try {
    const raw = localStorage.getItem(TOUCH_HISTORY_KEY)
    if (!raw) return []

    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) {
      console.error('Saved attribution touch history is not a list.')
      return []
    }
    return value.filter(isStoredTouch)
  } catch (error) {
    console.error('Could not read attribution touch history from local storage.', error)
    return []
  }
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

function shouldSendTouch(payload: TouchPayload, history: StoredTouch[]): boolean {
  const previous = history.at(-1)
  if (!previous || Date.now() - previous.recordedAt > SESSION_WINDOW_MS) return true

  const previousWasAttributed = hasMarketingSignal(previous.payload)
  const currentIsAttributed = hasMarketingSignal(payload)

  // A navigation without campaign parameters must not overwrite a recent ad touch as organic.
  if (previousWasAttributed && !currentIsAttributed) return false

  if (!currentIsAttributed) return false

  return (
    previous.payload.source !== payload.source ||
    previous.payload.campaign !== payload.campaign ||
    getTouchSignature(previous.payload) !== getTouchSignature(payload)
  )
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

async function getErrorMessage(response: Response, requestName = 'Touch request'): Promise<string> {
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
    console.error(`Could not read the ${requestName.toLowerCase()} error response.`, error)
  }
  return `${requestName} failed with HTTP ${response.status}.`
}

export async function createCheckoutSession(): Promise<CheckoutSession> {
  if (!API_KEY) {
    throw new Error('Checkout session was not created: configure VITE_ATTRIBUTION_API_KEY.')
  }

  const endpoint = `${API_BASE_URL}/v1/checkout-sessions`
  let response: Response
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': API_KEY,
      },
      body: JSON.stringify({ visitorId: getVisitorId() }),
    })
  } catch (error) {
    console.error(`Could not reach the checkout session endpoint at ${endpoint}.`, error)
    throw new Error(`Could not reach the checkout session endpoint at ${endpoint}.`, { cause: error })
  }

  if (!response.ok) {
    const message = await getErrorMessage(response, 'Checkout session request')
    console.error(message)
    throw new Error(message)
  }

  let result: unknown
  try {
    result = await response.json()
  } catch (error) {
    console.error('The checkout session endpoint returned an unreadable JSON response.', error)
    throw new Error('The checkout session endpoint returned an unreadable response.', { cause: error })
  }

  if (
    typeof result !== 'object' ||
    result === null ||
    !('checkoutSessionId' in result) ||
    typeof result.checkoutSessionId !== 'string' ||
    !('token' in result) ||
    typeof result.token !== 'string' ||
    result.token.length === 0 ||
    !('visitorId' in result) ||
    result.visitorId !== getVisitorId() ||
    !('visitorRecordId' in result) ||
    typeof result.visitorRecordId !== 'string' ||
    !('touchIds' in result) ||
    !Array.isArray(result.touchIds) ||
    !result.touchIds.every((touchId) => typeof touchId === 'string') ||
    !('touchCount' in result) ||
    typeof result.touchCount !== 'number' ||
    !Number.isInteger(result.touchCount) ||
    result.touchCount < 0 ||
    !('expiresAt' in result) ||
    typeof result.expiresAt !== 'string'
  ) {
    console.error('The checkout session endpoint returned an unexpected response format.', result)
    throw new Error('The checkout session endpoint returned an unexpected response format.')
  }

  return {
    checkoutSessionId: result.checkoutSessionId,
    token: result.token,
    visitorId: result.visitorId,
    visitorRecordId: result.visitorRecordId,
    touchIds: result.touchIds,
    touchCount: result.touchCount,
    expiresAt: result.expiresAt,
  }
}

export async function identifyVisitor(email: string): Promise<boolean> {
  if (!API_KEY) {
    console.error('Visitor identification was not sent: configure VITE_ATTRIBUTION_API_KEY.')
    return false
  }

  const payload = { visitorId: getVisitorId(), email }
  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}/v1/identify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': API_KEY,
      },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    console.error('Could not reach the Attribution System identify endpoint.', error)
    return false
  }

  if (response.status !== 200) {
    console.error(await getErrorMessage(response))
    return false
  }

  try {
    const result: unknown = await response.json()
    if (
      typeof result !== 'object' ||
      result === null ||
      !('customerId' in result) ||
      typeof result.customerId !== 'string' ||
      !('isNew' in result) ||
      typeof result.isNew !== 'boolean'
    ) {
      console.error('The identify endpoint returned an unexpected response format.', result)
      return false
    }

    console.info('Attribution visitor identified:', result)
    return true
  } catch (error) {
    console.error('The identify endpoint returned an unreadable JSON response.', error)
    return false
  }
}

function saveSuccessfulTouch(touch: StoredTouch): void {
  const history = readTouchHistory()
  history.push(touch)

  try {
    localStorage.setItem(TOUCH_HISTORY_KEY, JSON.stringify(history))
  } catch (error) {
    console.error('Touch was accepted, but its API response could not be saved to local storage.', error)
  }
}

export async function recordProductTouch(): Promise<void> {
  if (!/^\/product\/[^/]+\/?$/.test(window.location.pathname)) return

  if (!API_KEY) {
    console.error(
      'Touch tracking is not configured: set VITE_ATTRIBUTION_API_KEY in ecom/.env and restart the Vite dev server.',
    )
    return
  }

  const payload = buildPayload()
  const history = readTouchHistory()
  console.info('Attribution touch payload:', payload)
  if (!shouldSendTouch(payload, history)) {
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

  saveSuccessfulTouch({ payload, response: result, recordedAt: Date.now() })
  console.info('Attribution touch recorded:', result)
}
