import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { createRequire } from 'node:module'
import cors from 'cors'
import express from 'express'
import Razorpay from 'razorpay'

const app = express()
const require = createRequire(import.meta.url)
const port = Number(process.env.PORT || 3001)
const storefrontOrigin = process.env.STOREFRONT_ORIGIN || 'http://localhost:5173'
const currency = 'INR'
const productPrices = new Map(Object.entries(require('../../shared/catalog-prices.json')))

app.use(cors({ origin: storefrontOrigin }))
app.use(express.json({ limit: '16kb' }))

function getRazorpayCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID
  const keySecret = process.env.RAZORPAY_KEY_SECRET
  if (!keyId || !keySecret) {
    throw new Error('Configure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the payment server.')
  }
  return { keyId, keySecret }
}

function getRazorpay() {
  const { keyId, keySecret } = getRazorpayCredentials()
  return new Razorpay({ key_id: keyId, key_secret: keySecret })
}

function calculateAmount(items) {
  if (!Array.isArray(items) || items.length === 0 || items.length > productPrices.size) {
    throw new Error('Provide a valid list of cart items.')
  }

  const seen = new Set()
  let total = 0
  for (const item of items) {
    if (
      !item ||
      typeof item.productId !== 'string' ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 99 ||
      seen.has(item.productId)
    ) {
      throw new Error('Cart item data is invalid.')
    }
    const price = productPrices.get(item.productId)
    if (price === undefined) throw new Error('Cart contains an unknown product.')
    seen.add(item.productId)
    total += price * item.quantity
  }

  const amount = total * 100
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('The checkout amount is invalid.')
  }
  return amount
}

app.post('/api/create-order', async (req, res) => {
  let amount
  try {
    const { sessionToken } = req.body || {}
    if (typeof sessionToken !== 'string' || sessionToken.trim().length === 0 || sessionToken.length > 256) {
      return res.status(400).json({ message: 'A valid checkout session token is required.' })
    }

    amount = calculateAmount(req.body?.items)
    const { keyId } = getRazorpayCredentials()
    const razorpay = getRazorpay()
    const order = await razorpay.orders.create({
      amount,
      currency,
      receipt: `ns_${randomUUID().replaceAll('-', '').slice(0, 32)}`,
      notes: { sessionToken },
    })

    console.log("ODERDERRRRRRRRRR:\n\n\n\n\n\n", order)

    res.status(201).json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId,
    })
  } catch (error) {
    const isInputError = error instanceof Error &&
      (error.message.startsWith('Provide ') ||
        error.message.startsWith('Cart ') ||
        error.message.startsWith('The checkout amount'))
    const isConfigurationError = error instanceof Error && error.message.startsWith('Configure ')
    const status = isInputError ? 400 : isConfigurationError ? 503 : 502
    console.error('Could not create a Razorpay order:', error)
    res.status(status).json({ message: error instanceof Error ? error.message : 'Could not create payment order.' })
  }
})

app.post('/api/verify-payment', async (req, res) => {
  const {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
  } = req.body || {}

  if (
    typeof orderId !== 'string' ||
    typeof paymentId !== 'string' ||
    typeof signature !== 'string' ||
    !/^[a-f\d]{64}$/i.test(signature)
  ) {
    return res.status(400).json({ message: 'Payment verification data is invalid.' })
  }

  try {
    const { keySecret } = getRazorpayCredentials()
    const expectedSignature = createHmac('sha256', keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest()
    const receivedSignature = Buffer.from(signature, 'hex')
    if (
      expectedSignature.length !== receivedSignature.length ||
      !timingSafeEqual(expectedSignature, receivedSignature)
    ) {
      return res.status(400).json({ message: 'Razorpay payment signature verification failed.' })
    }

    const razorpay = getRazorpay()
    const [order, payment] = await Promise.all([
      razorpay.orders.fetch(orderId),
      razorpay.payments.fetch(paymentId),
    ])
    if (
      payment.order_id !== order.id ||
      payment.amount !== order.amount ||
      payment.currency !== currency ||
      order.currency !== currency ||
      payment.status !== 'captured'
    ) {
      return res.status(400).json({ message: 'The Razorpay payment is not captured for this order.' })
    }

    return res.status(200).json({ verified: true })
  } catch (error) {
    console.error('Could not verify Razorpay payment:', error)
    return res.status(502).json({
      message: error instanceof Error ? error.message : 'Could not verify Razorpay payment.',
    })
  }
})

app.listen(port, () => {
  console.info(`Razorpay payment server listening on http://localhost:${port}`)
})
