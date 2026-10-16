type CartItem = { productId: string; quantity: number }

export type RazorpayPaymentResponse = {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

type RazorpayOrder = {
  orderId: string
  amount: number
  currency: string
  keyId: string
}

type RazorpayCheckoutOptions = {
  key: string
  amount: number
  currency: string
  name: string
  description: string
  order_id: string
  prefill: { email: string }
  theme: { color: string }
  config: {
    display: {
      blocks: {
        highlighted: {
          name: string
          instruments: Array<{ method: 'upi' }>
        }
      }
      sequence: ['block.highlighted']
      preferences: { show_default_blocks: true }
    }
  }
  handler: (response: RazorpayPaymentResponse) => void
  modal: { ondismiss: () => void }
}

type RazorpayCheckout = {
  open: () => void
  on: (event: 'payment.failed', handler: (response: { error?: { description?: string } }) => void) => void
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayCheckout
  }
}

const PAYMENT_API_URL = (import.meta.env.VITE_PAYMENT_API_URL || 'http://localhost:3001').replace(/\/+$/, '')
const CHECKOUT_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js'

async function readApiError(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string') {
      return body.message
    }
  } catch (error) {
    console.error('Could not read the payment server error response.', error)
  }
  return fallback
}

async function post<T>(path: string, payload: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${PAYMENT_API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    console.error(`Could not reach the payment server at ${PAYMENT_API_URL}.`, error)
    throw new Error(`Could not reach the payment server at ${PAYMENT_API_URL}.`, { cause: error })
  }

  if (!response.ok) {
    const message = await readApiError(response, `Payment server request failed with HTTP ${response.status}.`)
    throw new Error(message)
  }

  return response.json() as Promise<T>
}

export async function createRazorpayOrder(
  items: CartItem[],
  expectedAmount: number,
  sessionToken: string,
): Promise<RazorpayOrder> {
  const order = await post<RazorpayOrder>('/api/create-order', { items, sessionToken })
  if (
    typeof order.orderId !== 'string' ||
    !Number.isSafeInteger(order.amount) ||
    order.amount <= 0 ||
    order.currency !== 'INR' ||
    typeof order.keyId !== 'string'
  ) {
    throw new Error('The payment server returned an invalid Razorpay order.')
  }
  if (order.amount !== expectedAmount) {
    throw new Error(
      `The payment server total (${order.amount / 100} INR) does not match your cart (${expectedAmount / 100} INR). Restart the payment server to load the latest catalog prices, then try again.`,
    )
  }
  return order
}

export async function verifyRazorpayPayment(payment: RazorpayPaymentResponse): Promise<void> {
  const result = await post<{ verified: boolean }>('/api/verify-payment', payment)
  if (result.verified !== true) throw new Error('Razorpay payment could not be verified.')
}

export function loadRazorpayCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve()

  return new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${CHECKOUT_SCRIPT_URL}"]`)
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true })
      existingScript.addEventListener('error', () => reject(new Error('Could not load Razorpay Checkout.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = CHECKOUT_SCRIPT_URL
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Could not load Razorpay Checkout.'))
    document.body.appendChild(script)
  })
}

export function openRazorpayCheckout(
  order: RazorpayOrder,
  email: string,
  onSuccess: (response: RazorpayPaymentResponse) => void,
  onFailure: (message: string) => void,
  onDismiss: () => void,
): void {
  if (!window.Razorpay) throw new Error('Razorpay Checkout did not finish loading.')
  const checkout = new window.Razorpay({
    key: order.keyId,
    amount: order.amount,
    currency: order.currency,
    name: 'Northstar Supply',
    description: 'Your Northstar Supply order',
    order_id: order.orderId,
    prefill: { email },
    theme: { color: '#29382e' },
    config: {
      display: {
        blocks: {
          highlighted: {
            name: 'Pay with UPI',
            instruments: [{ method: 'upi' }],
          },
        },
        sequence: ['block.highlighted'],
        preferences: { show_default_blocks: true },
      },
    },
    handler: onSuccess,
    modal: { ondismiss: onDismiss },
  })
  checkout.on('payment.failed', (response) => {
    onFailure(response.error?.description || 'Razorpay could not complete the payment. Please try again.')
  })
  checkout.open()
}
