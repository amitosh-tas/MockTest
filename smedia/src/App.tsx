import { useState } from 'react'
import { formatPrice, products, type Product } from '../../shared/catalog'
import './App.css'

const storeOrigin = (import.meta.env.VITE_STORE_ORIGIN || 'http://localhost:5173').replace(/\/$/, '')
const sponsoredProducts = [products[0], products[2], products[4], products[1], products[3]]

function SkeletonPost({ index }: { index: number }) {
  return (
    <article className="feed-card skeleton-card" aria-label={`Organic feed placeholder ${index + 1}`}>
      <div className="post-heading">
        <span className="skeleton avatar-skeleton" />
        <div className="skeleton-user"><span className="skeleton skeleton-line username-line" /><span className="skeleton skeleton-line time-line" /></div>
        <span className="skeleton menu-skeleton" />
      </div>
      <div className="skeleton media-skeleton" />
      <div className="skeleton-post-copy"><span className="skeleton skeleton-line" /><span className="skeleton skeleton-line medium-line" /><span className="skeleton skeleton-line short-line" /></div>
      <div className="skeleton-actions"><span className="skeleton skeleton-line" /><span className="skeleton skeleton-line" /></div>
      <span className="placeholder-caption">Organic post placeholder</span>
    </article>
  )
}

function SponsoredAd({ product }: { product: Product }) {
  function handleSponsoredProductClick() {
    const destinationUrl = new URL(`/product/${product.slug}`, storeOrigin)
    destinationUrl.searchParams.set('source', Math.random() < 0.5 ? 'google' : 'meta')
    destinationUrl.searchParams.set('medium', 'ctc')
    destinationUrl.searchParams.set('campaign', 'affiliate')
    destinationUrl.searchParams.set('content', product.id)
    destinationUrl.searchParams.set('touch_id', crypto.randomUUID())
    // TODO: Add the attribution click hook here; keep its source identifiers aligned with these query values.
    window.location.assign(destinationUrl.toString())
  }

  return (
    <article className="feed-card sponsored-card">
      <div className="sponsored-heading">
        <div className="advertiser"><span className="advertiser-mark">n</span><div><strong>northstar supply</strong><span>Sponsored</span></div></div>
        <button className="more-button" type="button" aria-label={`More options for ${product.name} ad`}>···</button>
      </div>
      <p className="ad-copy">{product.adCopy}</p>
      <button className="ad-image-button" type="button" onClick={handleSponsoredProductClick} aria-label={`Shop ${product.name}`}>
        <img src={product.image} alt={product.name} loading="lazy" />
      </button>
      <div className="ad-product-line"><div><h2>{product.name}</h2><span>{product.category}</span></div><strong>{formatPrice(product.price)}</strong></div>
      <div className="ad-footer"><span>northstarsupply.example</span><button type="button" onClick={handleSponsoredProductClick}>Shop Now <span aria-hidden="true">↗</span></button></div>
      <div className="ad-social"><span>♡ &nbsp; ○ &nbsp; ↗</span><span>See what people are saying</span></div>
    </article>
  )
}

function App() {
  const [search, setSearch] = useState('')
  const [activeNav, setActiveNav] = useState('Home')
  const navItems = [{ name: 'Home', icon: '⌂' }, { name: 'Explore', icon: '⌕' }, { name: 'Saved', icon: '♡' }, { name: 'Profile', icon: '◉' }]

  return (
    <div className="social-app">
      <header className="social-header">
        <a href="/" className="social-brand" aria-label="Morrow home"><span className="social-brand-icon">m</span><span>morrow</span></a>
        <label className="search-box"><span aria-hidden="true">⌕</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Morrow" aria-label="Search Morrow" /></label>
        <button className="profile-button" type="button" aria-label="Your profile"><span>J</span></button>
      </header>
      <div className="social-layout">
        <aside className="left-nav" aria-label="Main navigation">
          {navItems.map((item) => <button className={`nav-item ${activeNav === item.name ? 'active' : ''}`} key={item.name} type="button" onClick={() => setActiveNav(item.name)}><span>{item.icon}</span>{item.name}</button>)}
          <div className="left-nav-note"><strong>A little breathing room.</strong><span>Your feed is just getting started.</span></div>
        </aside>
        <main className="feed">
          <div className="feed-topline"><div><span className="eyebrow">YOUR LITTLE CORNER OF THE INTERNET</span><h1>Your feed</h1></div><button className="feed-filter" type="button" aria-label="Feed view: For you">For you <span>⌄</span></button></div>
          <div className="placeholder-notice"><span className="placeholder-dot" /><span><strong>Organic feed placeholders</strong> &nbsp;—&nbsp; Grey cards are intentional and won’t load real posts.</span></div>
          <div className="stories-row" aria-label="Stories placeholders">{['Your story', 'mina', 'studio june', 'the good list', 'elliot'].map((label, index) => <div className="story" key={label}><div className={`story-ring story-${index}`}><span>{index === 0 ? '+' : label.charAt(0).toUpperCase()}</span></div><span>{label}</span></div>)}</div>
          <div className="feed-list">
            <SkeletonPost index={0} />
            <SponsoredAd product={sponsoredProducts[0]} />
            <SkeletonPost index={1} />
            <SponsoredAd product={sponsoredProducts[1]} />
            <SkeletonPost index={2} />
            <SponsoredAd product={sponsoredProducts[2]} />
            <SkeletonPost index={3} />
            <SponsoredAd product={sponsoredProducts[3]} />
            <SkeletonPost index={4} />
            <SponsoredAd product={sponsoredProducts[4]} />
          </div>
        </main>
        <aside className="right-sidebar">
          <section className="profile-summary"><div className="profile-avatar">J</div><div><strong>jules.parker</strong><span>Jules Parker</span></div><button type="button">Switch</button></section>
          <section className="suggestions"><div className="side-heading"><strong>People to know</strong><button type="button">See all</button></div>{[['Mina Park','mina.makes','M'],['Studio June','studio.june','S'],['The Good List','thegoodlist','G']].map(([name, handle, initial]) => <div className="suggestion" key={handle}><span className="suggestion-avatar" aria-label={name}>{initial}</span><div><strong>{handle}</strong><span>Suggested for you</span></div><button type="button">Follow</button></div>)}</section>
          <section className="sponsored-note"><span className="eyebrow">A GOOD FIND</span><h2>Small things,<br />big everyday energy.</h2><p>Thoughtful goods from Northstar Supply.</p><a href={`${storeOrigin}/#shop`}>Explore the edit ↗</a></section>
          <div className="side-footer">About · Help · Privacy · Terms<br />© 2026 Morrow</div>
        </aside>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">{navItems.map((item) => <button className={activeNav === item.name ? 'active' : ''} key={item.name} type="button" onClick={() => setActiveNav(item.name)}><span>{item.icon}</span>{item.name}</button>)}</nav>
    </div>
  )
}

export default App
