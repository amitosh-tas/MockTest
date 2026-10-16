# Northstar Supply + Morrow mock websites

Two separate React, Vite, and TypeScript frontends for exercising an advertising-to-store journey. The storefront sends landing-touch and checkout-session data to the configured Attribution System endpoint and processes payments through Razorpay. Order fulfillment is not implemented.

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
| `/checkout` | Contact form and Razorpay Checkout |
| `/order-confirmation` | In-session order confirmation after verified payment and checkout-session API success |

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

For example, each Sonora ad click redirects to `/product/sonora-wireless-headphones?source=google&medium=ctc&campaign=affiliate&content=sonora-wireless-headphones&touch_id=<new-uuid>` (or `source=meta`). The source is randomized per click; the remaining campaign labels stay consistent, while the unique `touch_id` distinguishes each click. The storefront calls `recordProductTouch` only when a product page is visited (including in-app navigation), and submits the documented payload to `/v1/touches`. Cart and checkout navigation do not create touches. Checkout identifies the email through `/v1/identify`, then obtains and retains a `/v1/checkout-sessions` response before creating a Razorpay order. The payment server adds the returned token as `notes.sessionToken` on that Razorpay order. Razorpay Checkout offers UPI, and the backend verifies the payment signature and captured payment. Order confirmation follows payment verification. A failed checkout-session request prevents Razorpay order creation; failed order or payment confirmation can be retried using the existing session without creating another session. On successful touch API response, the script stores the visitor ID in local storage, reuses it across touches, and appends the full response and submitted touch details to the `aid_touches` local-storage history. Touches are sent on product views after 30 minutes or when source/campaign (or other campaign signature parameters) change.

Before starting the storefront, copy `ecom/.env.example` to `ecom/.env`. Set `VITE_ATTRIBUTION_API_KEY` to the publishable Attribution System key, and set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` to the Razorpay keys from your dashboard (use test keys while testing). Keep the secret in the ignored `.env` file only; never expose it in frontend variables or source. Both the backend and Vite load `.env`; Vite exposes only `VITE_*` variables to the browser. Start the Attribution API on `http://localhost:5000`, with `http://localhost:5173` allowlisted, and start the Razorpay payment API separately with `cd ecom; npm run server` (port 3001). Start Vite in another terminal with `cd ecom; npm run dev`. Open the store using exactly `http://localhost:5173` so browser requests match the configured origin. Restart both services after changing environment values. Enable automatic payment capture in Razorpay so verified payments have captured status. The storefront and payment server use the same INR catalog prices; the payment server independently calculates the total, so client-submitted amounts are never trusted.

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

The production assets are written to `ecom/dist/` and `smedia/dist/`. Deploy each directory to its own CDN/static host with SPA fallback to its `index.html`. Set `VITE_STORE_ORIGIN` for the Morrow build to the deployed Northstar Supply origin and set `VITE_PAYMENT_API_URL` to the deployed HTTPS payment backend. Deploy `ecom/backend/server.js` and `shared/catalog-prices.json` as a separate Node service with server-side Razorpay credentials and the production storefront origin in `STOREFRONT_ORIGIN`. Product photos and fonts are loaded from their configured external image/font hosts.

## Instrumentation points for the next phase

- Storefront `handleOpenProduct` in `ecom/src/App.tsx`: product-detail opens from collection cards.
- Storefront `handleAddToCart` in `ecom/src/App.tsx`: add-to-bag action.
- Morrow `handleSponsoredProductClick` in `smedia/src/App.tsx`: sponsored image and **Shop Now** clicks.
- Storefront `handleContinueToPayment` in `ecom/src/App.tsx` calls `identifyVisitor` from `ecom/src/touch-tracking.ts`, sending the checkout email and stored visitor ID to `POST /v1/identify`.
- Storefront `handleStartPayment` opens Razorpay Checkout using an order created by `ecom/backend/server.js`; the backend calculates INR totals from known product IDs and verifies Razorpay signatures and payment status.
- `handleStartPayment` first gets and stores the `/v1/checkout-sessions` response; its `token` is forwarded to the payment backend and attached to the Razorpay order as `notes.sessionToken`.
- After server verification, `finishPayment` confirms the order without creating a second checkout session.

The wired touch script follows the API documentation's `POST /v1/touches` contract, using the documented local base URL `http://localhost:5000` by default, `Content-Type: application/json`, and the documented `X-Api-Key` publishable-key header. Configure it via `ecom/.env.local` with `VITE_ATTRIBUTION_API_KEY` and optionally `VITE_ATTRIBUTION_API_URL` (base URL, not the endpoint path). The API requires the site/key origin to be allowlisted. The script includes the documented touch fields, reads `fbc`, `fbp`, and `ga` from `_fbc`, `_fbp`, and `_ga` cookies when present, expects `201 Created`, and logs the documented `{ message }` error response where available. It preserves the visitor ID in `aid_vid` local storage (migrating the prior cookie ID if present), and stores each successful response with its payload and timestamp in the `aid_touches` local-storage array. It reuses that history for 30-minute deduplication and sends a new touch when an explicitly tagged source, campaign, or other signature parameter changes. An untagged navigation during that window does not create an organic touch that overwrites a recent attributed touch. The frontend passes the configured key without enforcing its prefix so the API can validate the actual provisioned key.

The provided Attribution System key uses a `pk_test_` prefix, while its API documentation describes browser publishable keys with `wk_test_` or `wk_live_` prefixes. The script passes the configured key through unchanged so the API can validate it. Client-side publishable keys are visible in the browser and must not be secret keys. The Attribution System URL must use HTTPS in production. No conversion events or fulfillment are implemented. On checkout, the script sends `{ visitorId, email }` to `POST /v1/identify`; checkout can continue if identification fails, and the confirmation page reports whether identification was confirmed. Before opening Razorpay, the storefront sends `{ visitorId }` to `POST /v1/checkout-sessions`, validates and stores its response in app state, and forwards the returned `token` to the payment backend as Razorpay order `notes.sessionToken`. If the checkout-session call fails, no Razorpay order is created. Razorpay order creation and payment-signature verification use the separate server API and server-only secret key. The email and checkout-session response remain in frontend state for the current app session. The cart and touch records are stored in local storage.
