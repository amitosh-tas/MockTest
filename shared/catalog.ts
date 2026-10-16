import prices from './catalog-prices.json'

export type Product = {
  id: string
  name: string
  slug: string
  description: string
  price: number
  image: string
  category: string
  adCopy: string
}

export const products: Product[] = [
  {
    id: 'sonora-wireless-headphones',
    name: 'Sonora Wireless Headphones',
    slug: 'sonora-wireless-headphones',
    description: 'Immersive, balanced sound and all-day comfort for wherever life takes you.',
    price: prices['sonora-wireless-headphones'],
    image:
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1000&q=85',
    category: 'Audio',
    adCopy: 'Find your focus. Meet the headphones made for your everyday soundtrack.',
  },
  {
    id: 'fieldwork-canvas-backpack',
    name: 'Fieldwork Canvas Backpack',
    slug: 'fieldwork-canvas-backpack',
    description: 'A considered carry-all with a padded laptop sleeve and room for the little things.',
    price: prices['fieldwork-canvas-backpack'],
    image:
      'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=1000&q=85',
    category: 'Bags',
    adCopy: 'A better kind of carry. Thoughtful pockets, durable canvas, and room to roam.',
  },
  {
    id: 'arc-smart-desk-lamp',
    name: 'Arc Smart Desk Lamp',
    slug: 'arc-smart-desk-lamp',
    description: 'Warm, adjustable light with a minimal silhouette that makes every desk feel better.',
    price: prices['arc-smart-desk-lamp'],
    image:
      'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=1000&q=85',
    category: 'Workspace',
    adCopy: 'Make room for a little glow. Arc brings softer light to your everyday workspace.',
  },
  {
    id: 'everwell-insulated-bottle',
    name: 'Everwell Insulated Bottle',
    slug: 'everwell-insulated-bottle',
    description: 'A double-wall stainless steel bottle that keeps your drink just how you like it.',
    price: prices['everwell-insulated-bottle'],
    image:
      'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=1000&q=85',
    category: 'Everyday',
    adCopy: 'Take your favorite sip a little further with the Everwell insulated bottle.',
  },
  {
    id: 'switchback-mechanical-keyboard',
    name: 'Switchback Mechanical Keyboard',
    slug: 'switchback-mechanical-keyboard',
    description: 'Tactile mechanical keys and a clean, compact layout for a more satisfying setup.',
    price: prices['switchback-mechanical-keyboard'],
    image:
      'https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=1000&q=85',
    category: 'Workspace',
    adCopy: 'Give your desk a satisfying upgrade. Every detail of Switchback feels intentional.',
  },
]

export const formatPrice = (price: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(price)
