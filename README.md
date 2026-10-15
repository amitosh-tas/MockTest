# Northstar Supply + Morrow mock websites

Two separate React, Vite, and TypeScript frontends for exercising an advertising-to-store journey. They are frontend-only: there is no analytics SDK, attribution backend, payment processing, or real order fulfillment.

## Run locally

Install the dependencies in each app:

```powershell
cd ecom
npm install
cd ..\smedia
npm install
```

Start each app in its own terminal:

```powershell
cd ecom
npm run dev
```

```powershell
cd smedia
npm run dev
```

The storefront is served at `http://localhost:5173`; the social mock is served at `http://localhost:5174`. Both ports are configured as strict ports so a silently shifted URL does not break sponsored destinations.

## Routes

### Northstar Supply (`ecom`, port 5173)

| Route | Page |
| --- | --- |
| `/` | Store homepage and five-product collection |
| `/product/:slug` | Product details |
| `/cart` | Persistent shopping bag and order subtotal |
| `/checkout` | Test contact/shipping form and summary |
| `/order-confirmation` | In-session mock order confirmation |

### Morrow (`smedia`, port 5174)

| Route | Page |
| --- | --- |
| `/` | Social-style feed with organic-feed skeleton placeholders and sponsored product cards |

The Morrow search field and navigation controls are local UI interactions only. Organic posts intentionally remain skeleton placeholders.

## Shared catalog and sponsored links

`shared/catalog.ts` is the single source for product IDs, names, slugs, descriptions, prices, categories, images, and ad copy. Both apps import these exact records. Sponsored image and **Shop Now** buttons link to `http://localhost:5173/product/:slug` by default. If the storefront is hosted at another origin, configure `VITE_STORE_ORIGIN` in the social app environment at build time, for example:

```powershell
$env:VITE_STORE_ORIGIN = "https://store.example.test"
npm run build
```

Each ad opens its matching Northstar Supply product details page with these query parameters:

| Parameter | Value |
| --- | --- |
| `source` | Randomly selected as `google` or `meta` per click |
| `medium` | `ctc` |
| `campaign` | `affiliate` |
| `content` | The matching product's stable catalog ID |
| `touch_id` | A newly generated UUID for each sponsored click |

For example, each Sonora ad click redirects to `/product/sonora-wireless-headphones?source=google&medium=ctc&campaign=affiliate&content=sonora-wireless-headphones&touch_id=<new-uuid>` (or `source=meta`). The source is randomized per click; the remaining campaign labels stay consistent, while the unique `touch_id` distinguishes each click. These query parameters are URL labels only; they do not send events to the Attribution System. From the product page a visitor can add the item to the bag, update or remove quantities, and complete the simulated checkout.

## Production/CDN builds

Build each static site independently:

```powershell
cd ecom
npm run build
```

```powershell
cd smedia
npm run build
```

The production assets are written to `ecom/dist/` and `smedia/dist/`. Deploy each directory to its own CDN/static host with SPA fallback to its `index.html`. Set `VITE_STORE_ORIGIN` for the Morrow build to the deployed Northstar Supply origin. The apps contain no API/backend runtime dependency; product photos and fonts are loaded from their configured external image/font hosts.

## Instrumentation points for the next phase

- Storefront `handleOpenProduct` in `ecom/src/App.tsx`: product-detail opens from collection cards.
- Storefront `handleAddToCart` in `ecom/src/App.tsx`: add-to-bag action.
- Morrow `handleSponsoredProductClick` in `smedia/src/App.tsx`: sponsored image and **Shop Now** clicks.
- Storefront `handlePlaceTestOrder` in `ecom/src/App.tsx`: successful test checkout, after native form validation.

The sponsored redirect carries the documented query parameters. The handlers do not send events to an analytics SDK or Attribution System. No conversion events or additional source-identification strings are implemented. The successful checkout captures the email in in-memory React state for this app session. Only the cart is stored in local storage.
