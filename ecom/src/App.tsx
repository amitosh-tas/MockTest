import { useEffect, useRef, useState } from 'react'
import { formatPrice, products, type Product } from '../../shared/catalog'
import {
  createCheckoutSession,
  identifyVisitor,
  recordProductTouch,
  type CheckoutSession,
} from './touch-tracking'
import {
  createRazorpayOrder,
  loadRazorpayCheckout,
  openRazorpayCheckout,
  verifyRazorpayPayment,
  type RazorpayPaymentResponse,
} from './razorpay'
import './App.css'

type CartLine = { productId: string; quantity: number }
type Order = { id: string; email: string; items: CartLine[]; emailIdentified: boolean }
type Route = { page: 'home' | 'product' | 'cart' | 'checkout' | 'confirmation'; slug?: string }

function getRoute(): Route {
  const path = window.location.pathname
  if (path === '/cart') return { page: 'cart' }
  if (path === '/checkout') return { page: 'checkout' }
  if (path === '/order-confirmation') return { page: 'confirmation' }
  const productMatch = path.match(/^\/product\/([^/]+)$/)
  if (productMatch) return { page: 'product', slug: decodeURIComponent(productMatch[1]) }
  return { page: 'home' }
}

function readCart(): CartLine[] {
  try {
    const raw = window.localStorage.getItem('northstar-cart')
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) throw new Error('Saved cart was not a list.')
    return parsed.filter(
      (line): line is CartLine =>
        typeof line?.productId === 'string' &&
        products.some((product) => product.id === line.productId) &&
        Number.isInteger(line.quantity) &&
        line.quantity > 0,
    )
  } catch (error) {
    console.error('Could not read the saved cart.', error)
    return []
  }
}

function Header({ cartCount }: { cartCount: number }) {
  return (
    <header className="store-header">
      <a className="store-brand" href="/" aria-label="Northstar Supply home">
        <span className="brand-mark">N</span>
        <span>northstar<span className="brand-light"> supply</span></span>
      </a>
      <nav className="store-nav" aria-label="Main navigation">
        <a href="/#shop">Shop</a>
        <a href="/#story">Our story</a>
      </nav>
      <a className="cart-link" href="/cart" aria-label={`Shopping bag, ${cartCount} items`}>
        <span aria-hidden="true">Bag</span><span className="cart-count">{cartCount}</span>
      </a>
    </header>
  )
}

function ProductCard({ product, onAdd, onView }: { product: Product; onAdd: (id: string) => void; onView: (slug: string) => void }) {
  return (
    <article className="product-card">
      <a className="product-image-link" href={`/product/${product.slug}`} onClick={(event) => { event.preventDefault(); onView(product.slug) }} aria-label={`View ${product.name}`}>
        <img className="product-image" src={product.image} alt={product.name} loading="lazy" />
        <span className="image-category">{product.category}</span>
      </a>
      <div className="product-info">
        <div className="product-heading">
          <a href={`/product/${product.slug}`} onClick={(event) => { event.preventDefault(); onView(product.slug) }}><h3>{product.name}</h3></a>
          <span>{formatPrice(product.price)}</span>
        </div>
        <p>{product.description}</p>
        <button className="text-action" type="button" onClick={() => onAdd(product.id)}>
          Add to bag <span aria-hidden="true">↗</span>
        </button>
      </div>
    </article>
  )
}

function App() {
  const [route, setRoute] = useState<Route>(getRoute)
  const [cart, setCart] = useState<CartLine[]>(readCart)
  const [notice, setNotice] = useState('')
  const [order, setOrder] = useState<Order | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [checkoutStep, setCheckoutStep] = useState<'details' | 'payment'>('details')
  const [checkoutEmail, setCheckoutEmail] = useState('')
  const [checkoutEmailIdentified, setCheckoutEmailIdentified] = useState(false)
  const [checkoutSession, setCheckoutSession] = useState<CheckoutSession | null>(null)
  const [paymentVerified, setPaymentVerified] = useState(false)
  const [gatewayOpen, setGatewayOpen] = useState(false)
  const [pendingPayment, setPendingPayment] = useState<RazorpayPaymentResponse | null>(null)
  const [checkoutError, setCheckoutError] = useState('')
  const finalizingPayment = useRef(false)
  const startingPayment = useRef(false)

  useEffect(() => {
    const onPopState = () => setRoute(getRoute())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (route.page === 'product') {
      void recordProductTouch()
    }
  }, [route])

  useEffect(() => {
    try {
      window.localStorage.setItem('northstar-cart', JSON.stringify(cart))
    } catch (error) {
      console.error('Could not save the cart.', error)
    }
  }, [cart])

  function navigate(path: string) {
    window.history.pushState({}, '', path)
    setRoute(getRoute())
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setNotice('')
  }

  function handleAddToCart(productId: string) {
    // TODO: Add source-identification strings and attribution tracking here in the next phase.
    setCart((current) => {
      const existing = current.find((line) => line.productId === productId)
      return existing
        ? current.map((line) => line.productId === productId ? { ...line, quantity: line.quantity + 1 } : line)
        : [...current, { productId, quantity: 1 }]
    })
    setNotice('Added to your bag.')
  }

  function handleOpenProduct(slug: string) {
    // TODO: Add source-identification strings and attribution tracking for product views here.
    navigate(`/product/${slug}`)
  }

  function updateQuantity(productId: string, quantity: number) {
    setCart((current) => quantity < 1
      ? current.filter((line) => line.productId !== productId)
      : current.map((line) => line.productId === productId ? { ...line, quantity } : line))
  }

  const cartProducts = cart.flatMap((line) => {
    const product = products.find((item) => item.id === line.productId)
    return product ? [{ ...line, product }] : []
  })
  const cartCount = cart.reduce((total, line) => total + line.quantity, 0)
  const subtotal = cartProducts.reduce((total, line) => total + line.product.price * line.quantity, 0)
  const product = products.find((item) => item.slug === route.slug)

  async function handleContinueToPayment(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting || cartProducts.length === 0) return
    const form = event.currentTarget
    if (!form.reportValidity()) return
    const email = new FormData(form).get('email')?.toString().trim()
    if (!email) return
    setSubmitting(true)
    try {
      const emailIdentified = await identifyVisitor(email)
      setCheckoutEmail(email)
      setCheckoutEmailIdentified(emailIdentified)
      setCheckoutSession(null)
      setPaymentVerified(false)
      setGatewayOpen(false)
      setPendingPayment(null)
      setCheckoutError('')
      setCheckoutStep('payment')
    } finally {
      setSubmitting(false)
    }
  }

  async function finishPayment(response: RazorpayPaymentResponse) {
    if (finalizingPayment.current) return
    finalizingPayment.current = true
    setSubmitting(true)
    setCheckoutError('')
    try {
      if (!paymentVerified) {
        await verifyRazorpayPayment(response)
        setPaymentVerified(true)
      }
      const completedOrder = {
        id: response.razorpay_order_id,
        email: checkoutEmail,
        items: cart,
        emailIdentified: checkoutEmailIdentified,
      }
      setOrder(completedOrder)
      setCart([])
      navigate('/order-confirmation')
    } catch (error) {
      console.error('Razorpay payment confirmation or checkout-session creation failed.', error)
      setCheckoutError(error instanceof Error ? error.message : 'Payment confirmation could not be completed.')
    } finally {
      finalizingPayment.current = false
      setSubmitting(false)
    }
  }

  async function handleStartPayment() {
    if (submitting || startingPayment.current || cartProducts.length === 0) return

    startingPayment.current = true
    setSubmitting(true)
    setCheckoutError('')
    try {
      let session = checkoutSession
      if (!session) {
        session = await createCheckoutSession()
        setCheckoutSession(session)
      }

      const items = cart.map(({ productId, quantity }) => ({ productId, quantity }))
      const [order] = await Promise.all([
        createRazorpayOrder(items, subtotal * 100, session.token),
        loadRazorpayCheckout(),
      ])
      let paymentCompleted = false
      openRazorpayCheckout(
        order,
        checkoutEmail,
        (response) => {
          paymentCompleted = true
          setGatewayOpen(false)
          setPendingPayment(response)
          setPaymentVerified(false)
          void finishPayment(response)
        },
        (message) => {
          setGatewayOpen(false)
          setCheckoutError(message)
          setSubmitting(false)
        },
        () => {
          if (paymentCompleted) return
          setGatewayOpen(false)
          setCheckoutError('Payment window closed. You can reopen Razorpay checkout to try again.')
          setSubmitting(false)
        },
      )
      setGatewayOpen(true)
      startingPayment.current = false
      setSubmitting(false)
    } catch (error) {
      startingPayment.current = false
      setGatewayOpen(false)
      console.error('Could not start Razorpay checkout.', error)
      setCheckoutError(error instanceof Error ? error.message : 'Could not start Razorpay checkout.')
      setSubmitting(false)
    }
  }

  return (
    <div className="store-app">
      <div className="announcement">Secure checkout powered by Razorpay</div>
      <Header cartCount={cartCount} />
      <main>
        {notice && <div className="store-notice" role="status">{notice}</div>}
        {route.page === 'home' && (
          <>
            <section className="hero">
              <div className="hero-copy">
                <span className="eyebrow">GOOD THINGS, THOUGHTFULLY MADE</span>
                <h1>Make room for<br /><em>better everyday.</em></h1>
                <p>Useful objects, considered details, and small upgrades that make a day feel a little more yours.</p>
                <a className="button button-dark" href="#shop">Explore the collection <span>↗</span></a>
              </div>
              <div className="hero-photo" role="img" aria-label="Thoughtful everyday essentials arranged in a calm studio" />
              <span className="hero-note">OBJECTS FOR THE EVERYDAY — EST. 2024</span>
            </section>
            <section className="collection section-wrap" id="shop">
              <div className="section-heading">
                <div><span className="eyebrow">THE NORTHSTAR EDIT</span><h2>Everyday, elevated.</h2></div>
                <p>Five thoughtful essentials.<br />One more intentional routine.</p>
              </div>
              <div className="product-grid">{products.map((item) => <ProductCard key={item.id} product={item} onAdd={handleAddToCart} onView={handleOpenProduct} />)}</div>
            </section>
            <section className="promo" id="story">
              <div className="promo-icon">✳</div>
              <div><span className="eyebrow">A BETTER WAY TO THE EVERYDAY</span><h2>Less noise. More of what matters.</h2><p>We believe the things you use every day should feel like the right things.</p></div>
              <a className="button button-outline" href="#shop">Meet your next favorite <span>↗</span></a>
            </section>
          </>
        )}
        {route.page === 'product' && (
          product ? <section className="detail-layout section-wrap">
            <img className="detail-image" src={product.image} alt={product.name} />
            <div className="detail-copy"><span className="eyebrow">{product.category.toUpperCase()} / NORTHSTAR EDIT</span><h1>{product.name}</h1><p className="detail-price">{formatPrice(product.price)}</p><p>{product.description}</p><button className="button button-dark" type="button" onClick={() => handleAddToCart(product.id)}>Add to bag <span>↗</span></button><p className="detail-footnote">Thoughtfully chosen. Made for the everyday.</p></div>
          </section> : <section className="empty-state"><span className="eyebrow">NOT FOUND</span><h1>That piece has wandered off.</h1><a className="button button-dark" href="/">Back to the collection</a></section>
        )}
        {route.page === 'cart' && (
          <section className="section-wrap page-section">
            <span className="eyebrow">YOUR NORTHSTAR PICKS</span><h1 className="page-title">Your bag<span className="muted-count"> ({cartCount})</span></h1>
            {cartProducts.length === 0 ? <div className="empty-state"><p>Your bag is taking a little breather.</p><a className="button button-dark" href="/#shop">Explore the collection</a></div> :
              <div className="cart-layout"><div className="cart-lines">{cartProducts.map(({ product: item, quantity }) => <article className="cart-line" key={item.id}>
                <a href={`/product/${item.slug}`}><img src={item.image} alt={item.name} /></a><div className="cart-line-main"><a href={`/product/${item.slug}`}><h2>{item.name}</h2></a><span>{formatPrice(item.price)}</span><div className="quantity-controls" aria-label={`Quantity for ${item.name}`}><button type="button" aria-label={`Decrease ${item.name} quantity`} onClick={() => updateQuantity(item.id, quantity - 1)}>−</button><span>{quantity}</span><button type="button" aria-label={`Increase ${item.name} quantity`} onClick={() => updateQuantity(item.id, quantity + 1)}>+</button></div><button className="remove-link" type="button" onClick={() => updateQuantity(item.id, 0)}>Remove</button></div>
                <strong>{formatPrice(item.price * quantity)}</strong>
              </article>)}</div><aside className="summary-box"><h2>Order summary</h2><div className="summary-row"><span>Subtotal</span><span>{formatPrice(subtotal)}</span></div><div className="summary-row"><span>Shipping</span><span>Not charged</span></div><div className="summary-row summary-total"><span>Total</span><strong>{formatPrice(subtotal)}</strong></div><button className="button button-dark full-button" type="button" onClick={() => navigate('/checkout')}>Continue to checkout <span>↗</span></button><p className="test-note">Payments via Razorpay · No fulfillment integration.</p></aside></div>}
          </section>
        )}
        {route.page === 'checkout' && (
          <section className="section-wrap page-section">
            <span className="eyebrow">SECURE CHECKOUT</span><h1 className="page-title">Almost yours.</h1>
            {cartProducts.length === 0 ? <div className="empty-state"><p>Your bag is empty, so there’s nothing to check out just yet.</p><a className="button button-dark" href="/#shop">Browse the collection</a></div> :
              <div className="checkout-layout">
                {checkoutStep === 'details' ? <form className="checkout-form" onSubmit={handleContinueToPayment}>
                  <div className="test-banner"><strong>Payment securely processed by Razorpay</strong><span>Your payment details are entered only in Razorpay Checkout.</span></div>
                  <h2>Contact</h2><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
                  <button className="button button-dark full-button" type="submit" disabled={submitting}>{submitting ? 'Saving details…' : 'Continue to payment'} <span>↗</span></button>
                </form> : <div className="checkout-form gateway-form">
                  <div className="gateway-heading"><span className="eyebrow">RAZORPAY CHECKOUT</span><strong>Secure payment</strong></div>
                  <div className="test-banner"><strong>Payment details stay with Razorpay</strong><span>You’ll complete payment in Razorpay’s secure checkout window.</span></div>
                  {checkoutSession && <p className="payment-status" role="status">Checkout session ready. Continue to open secure payment.</p>}
                  <div className="gateway-total"><span>Amount due</span><strong>{formatPrice(subtotal)}</strong></div>
                  {gatewayOpen && <p className="payment-status" role="status">Razorpay Checkout is open. Complete payment or close its window to continue.</p>}
                  {paymentVerified && <p className="payment-status" role="status">Payment verified. Confirming your checkout with Northstar…</p>}
                  {checkoutError && <p className="checkout-error" role="alert">{checkoutError}</p>}
                  {pendingPayment ? <button className="button button-dark full-button" type="button" onClick={() => void finishPayment(pendingPayment)} disabled={submitting}>{submitting ? 'Confirming checkout…' : paymentVerified ? 'Retry order confirmation' : 'Retry payment verification'} <span>↗</span></button> :
                    <button className="button button-dark full-button" type="button" onClick={() => void handleStartPayment()} disabled={submitting || gatewayOpen}>{submitting ? 'Preparing secure checkout…' : gatewayOpen ? 'Complete payment in Razorpay…' : `Continue to Razorpay · ${formatPrice(subtotal)}`} <span>↗</span></button>}
                  <button className="button button-outline full-button" type="button" onClick={() => { setCheckoutStep('details'); setCheckoutError('') }} disabled={submitting || gatewayOpen || pendingPayment !== null}>Back to shipping details</button>
                </div>}
                <aside className="summary-box checkout-summary"><h2>Order summary</h2>{cartProducts.map(({ product: item, quantity }) => <div className="checkout-item" key={item.id}><img src={item.image} alt="" /><span>{item.name} × {quantity}</span><strong>{formatPrice(item.price * quantity)}</strong></div>)}<div className="summary-row summary-total"><span>Total</span><strong>{formatPrice(subtotal)}</strong></div></aside>
              </div>}
          </section>
        )}
        {route.page === 'confirmation' && (
          order ? <section className="confirmation"><span className="confirmation-mark">✓</span><span className="eyebrow">ORDER COMPLETE</span><h1>That’s a wrap.</h1><p>Your Razorpay payment and checkout are confirmed.</p><p className={`identify-result ${order.emailIdentified ? 'identify-success' : 'identify-failure'}`} role="status">{order.emailIdentified ? 'Email linked to this visitor in the Attribution System.' : 'Order confirmed, but email identification could not be confirmed.'}</p><div className="confirmation-card"><span>Order number</span><strong>{order.id}</strong><span>Confirmation sent to</span><strong>{order.email}</strong><span>Items in this order</span><strong>{order.items.reduce((total, item) => total + item.quantity, 0)}</strong></div><a className="button button-dark" href="/">Back to Northstar <span>↗</span></a></section> : <section className="empty-state"><h1>No order to show yet.</h1><a className="button button-dark" href="/">Back to the store</a></section>
        )}
      </main>
      <footer className="store-footer"><a className="store-brand" href="/"><span className="brand-mark">N</span><span>northstar<span className="brand-light"> supply</span></span></a><span>Thoughtful things for everyday life.</span><span>© 2026 Northstar Supply · Test storefront</span></footer>
    </div>
  )
}

export default App
