# Northstar Supply + Morrow mock websites

Two separate React, Vite, and TypeScript frontends for exercising an advertising-to-store journey. The storefront can POST landing-touch data to the configured local Attribution System endpoint; there is no analytics SDK, payment processing, or real order fulfillment.

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

The storefront is served at `http://localhost:5173`; the social mock is served at `http://localhost:5174`. Both ports are configured as strict ports so a silently shifted URL does not break sponsored destinations. The storefront dev server binds to `localhost`; open it using exactly `http://localhost:5173` so its browser `Origin` matches the backend allowlist. Do not use `http://127.0.0.1:5173` or a machine IP; those are different origins.

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

For example, each Sonora ad click redirects to `/product/sonora-wireless-headphones?source=google&medium=ctc&campaign=affiliate&content=sonora-wireless-headphones&touch_id=<new-uuid>` (or `source=meta`). The source is randomized per click; the remaining campaign labels stay consistent, while the unique `touch_id` distinguishes each click. The storefront calls `recordProductTouch` only when a product page is visited (including in-app navigation), and submits the documented payload to `/v1/touches`. Cart and checkout navigation do not create touches; successful checkout has its separate `/v1/identify` request. On successful API response, the script stores the visitor ID in local storage, reuses it across touches, and appends the full response and submitted touch details to the `aid_touches` local-storage history. Touches are sent on product views after 30 minutes or when source/campaign (or other campaign signature parameters) change. From the product page a visitor can add the item to the bag, update or remove quantities, and complete the simulated checkout.

Before starting the storefront, copy `ecom/.env.example` to `ecom/.env.local`, set `VITE_ATTRIBUTION_API_KEY` to a publishable `wk_test_...` or `wk_live_...` key, and ensure the API server is running at `http://localhost:5000` with `http://localhost:5173` allowlisted. Open the store using exactly `http://localhost:5173` so the browser sends that allowed origin. Restart Vite after changing environment values. Without a valid key the app logs a configuration error and does not send a touch.

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
- Storefront `handlePlaceTestOrder` in `ecom/src/App.tsx` calls `identifyVisitor` from `ecom/src/touch-tracking.ts`, sending the checkout email and stored visitor ID to `POST /v1/identify`.

The wired touch script follows the API documentation's `POST /v1/touches` contract, using the documented local base URL `http://localhost:5000` by default, `Content-Type: application/json`, and the documented `X-Api-Key` publishable-key header. Configure it via `ecom/.env` with `VITE_ATTRIBUTION_API_KEY` and optionally `VITE_ATTRIBUTION_API_URL` (base URL, not the endpoint path). The API requires the site/key origin to be allowlisted. The script includes the documented touch fields, reads `fbc`, `fbp`, and `ga` from `_fbc`, `_fbp`, and `_ga` cookies when present, expects `201 Created`, and logs the documented `{ message }` error response where available. It preserves the visitor ID in `aid_vid` local storage (migrating the prior cookie ID if present), and stores each successful response with its payload and timestamp in the `aid_touches` local-storage array. It reuses that history for 30-minute deduplication and sends a new touch when an explicitly tagged source, campaign, or other signature parameter changes. An untagged navigation during that window does not create an organic touch that overwrites a recent attributed touch. The frontend passes the configured key without enforcing its prefix so the API can validate the actual provisioned key.

The provided key uses a `pk_test_` prefix, while the API documentation describes browser publishable keys with `wk_test_` or `wk_live_` prefixes. The script passes the configured key through unchanged rather than blocking the request based on this prefix mismatch; whether the backend accepts this key format can only be confirmed by its response. Client-side publishable keys are visible in the browser and must not be secret keys. The local API endpoint must be changed to the appropriate HTTPS base URL before production deployment. No conversion events are implemented. On checkout the script sends `{ visitorId, email }` to `POST /v1/identify`; the simulated order continues even if identification fails, and the confirmation page reports whether identification was confirmed. The email remains in frontend state for the current app session. The cart and touch records are stored in local storage.
