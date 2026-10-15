import { useEffect, useState } from 'react'
import { formatPrice, products, type Product } from '../../shared/catalog'
import { createCheckoutSession, identifyVisitor, recordProductTouch } from './touch-tracking'
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
  const [paymentSucceeded, setPaymentSucceeded] = useState(false)
  const [checkoutError, setCheckoutError] = useState('')

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

  async function handlePlaceTestOrder(event: React.SubmitEvent<HTMLFormElement>) {
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
      setPaymentSucceeded(false)
      setCheckoutError('')
      setCheckoutStep('payment')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMockPayment(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting || cartProducts.length === 0) return
    const form = event.currentTarget
    if (!form.reportValidity()) return

    setSubmitting(true)
    setCheckoutError('')
    try {
      setPaymentSucceeded(true)
      await createCheckoutSession()
      const completedOrder = {
        id: `NS-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        email: checkoutEmail,
        items: cart,
        emailIdentified: checkoutEmailIdentified,
      }
      setOrder(completedOrder)
      setCart([])
      navigate('/order-confirmation')
    } catch (error) {
      console.error('The payment was simulated, but the checkout session could not be created.', error)
      setCheckoutError(error instanceof Error ? error.message : 'The checkout session could not be created.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="store-app">
      <div className="announcement">A little something extra: complimentary shipping over $100</div>
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
              </article>)}</div><aside className="summary-box"><h2>Order summary</h2><div className="summary-row"><span>Subtotal</span><span>{formatPrice(subtotal)}</span></div><div className="summary-row"><span>Shipping</span><span>{subtotal >= 100 ? 'Complimentary' : 'Calculated at checkout'}</span></div><div className="summary-row summary-total"><span>Estimated total</span><strong>{formatPrice(subtotal)}</strong></div><button className="button button-dark full-button" type="button" onClick={() => navigate('/checkout')}>Continue to checkout <span>↗</span></button><p className="test-note">Test checkout only — no real payment or fulfillment.</p></aside></div>}
          </section>
        )}
        {route.page === 'checkout' && (
          <section className="section-wrap page-section">
            <span className="eyebrow">A TEST CHECKOUT</span><h1 className="page-title">Almost yours.</h1>
            {cartProducts.length === 0 ? <div className="empty-state"><p>Your bag is empty, so there’s nothing to check out just yet.</p><a className="button button-dark" href="/#shop">Browse the collection</a></div> :
              <div className="checkout-layout">
                {checkoutStep === 'details' ? <form className="checkout-form" onSubmit={handlePlaceTestOrder}>
                  <div className="test-banner"><strong>Just a test, promise.</strong><span>No payment is collected and no order will be fulfilled.</span></div>
                  <h2>Contact</h2><label htmlFor="email">Email address</label><input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com" required />
                  <h2>Shipping address</h2><div className="form-row"><div><label htmlFor="firstName">First name</label><input id="firstName" name="firstName" autoComplete="given-name" required /></div><div><label htmlFor="lastName">Last name</label><input id="lastName" name="lastName" autoComplete="family-name" required /></div></div>
                  <label htmlFor="address">Address</label><input id="address" name="address" autoComplete="street-address" required />
                  <div className="form-row"><div><label htmlFor="city">City</label><input id="city" name="city" autoComplete="address-level2" required /></div><div><label htmlFor="postal">ZIP code</label><input id="postal" name="postal" autoComplete="postal-code" required /></div></div>
                  <button className="button button-dark full-button" type="submit" disabled={submitting}>{submitting ? 'Saving details…' : 'Continue to payment'} <span>↗</span></button>
                </form> : <form className="checkout-form gateway-form" onSubmit={handleMockPayment}>
                  <div className="gateway-heading"><span className="eyebrow">NORTHSTAR MOCK GATEWAY</span><strong>Secure test payment</strong></div>
                  <div className="test-banner"><strong>Simulated payment only</strong><span>These test details are not saved or sent to a payment provider.</span></div>
                  <label htmlFor="cardName">Name on card</label><input id="cardName" name="cardName" autoComplete="cc-name" placeholder="Alex Morgan" required />
                  <label htmlFor="cardNumber">Card number</label><input id="cardNumber" name="cardNumber" inputMode="numeric" autoComplete="cc-number" placeholder="4242 4242 4242 4242" pattern="[0-9 ]{12,23}" required />
                  <div className="form-row"><div><label htmlFor="cardExpiry">Expiry date</label><input id="cardExpiry" name="cardExpiry" autoComplete="cc-exp" placeholder="MM / YY" pattern="(0[1-9]|1[0-2])\\s*/\\s*[0-9]{2}" required /></div><div><label htmlFor="cardCvc">Security code</label><input id="cardCvc" name="cardCvc" inputMode="numeric" autoComplete="cc-csc" placeholder="CVC" pattern="[0-9]{3,4}" required /></div></div>
                  <div className="gateway-total"><span>Amount due</span><strong>{formatPrice(subtotal)}</strong></div>
                  {paymentSucceeded && <p className="payment-status" role="status">Mock payment succeeded. Confirming your checkout with Northstar…</p>}
                  {checkoutError && <p className="checkout-error" role="alert">Payment was simulated, but order confirmation is waiting for the checkout service: {checkoutError}</p>}
                  <button className="button button-dark full-button" type="submit" disabled={submitting}>{submitting ? 'Confirming checkout…' : paymentSucceeded ? 'Retry order confirmation' : `Pay ${formatPrice(subtotal)}`} <span>↗</span></button>
                  <button className="button button-outline full-button" type="button" onClick={() => { setCheckoutStep('details'); setCheckoutError('') }} disabled={submitting || paymentSucceeded}>Back to shipping details</button>
                </form>}
                <aside className="summary-box checkout-summary"><h2>Order summary</h2>{cartProducts.map(({ product: item, quantity }) => <div className="checkout-item" key={item.id}><img src={item.image} alt="" /><span>{item.name} × {quantity}</span><strong>{formatPrice(item.price * quantity)}</strong></div>)}<div className="summary-row summary-total"><span>Total</span><strong>{formatPrice(subtotal)}</strong></div></aside>
              </div>}
          </section>
        )}
        {route.page === 'confirmation' && (
          order ? <section className="confirmation"><span className="confirmation-mark">✓</span><span className="eyebrow">TEST ORDER COMPLETE</span><h1>That’s a wrap.</h1><p>Your simulated order is confirmed. Nothing has been charged or shipped.</p><p className={`identify-result ${order.emailIdentified ? 'identify-success' : 'identify-failure'}`} role="status">{order.emailIdentified ? 'Email linked to this visitor in the Attribution System.' : 'Order confirmed, but email identification could not be confirmed.'}</p><div className="confirmation-card"><span>Mock order number</span><strong>{order.id}</strong><span>Confirmation sent to (for this session only)</span><strong>{order.email}</strong><span>Items in this test order</span><strong>{order.items.reduce((total, item) => total + item.quantity, 0)}</strong></div><a className="button button-dark" href="/">Back to Northstar <span>↗</span></a></section> : <section className="empty-state"><h1>No order to show yet.</h1><a className="button button-dark" href="/">Back to the store</a></section>
        )}
      </main>
      <footer className="store-footer"><a className="store-brand" href="/"><span className="brand-mark">N</span><span>northstar<span className="brand-light"> supply</span></span></a><span>Thoughtful things for everyday life.</span><span>© 2026 Northstar Supply · Test storefront</span></footer>
    </div>
  )
}

export default App
