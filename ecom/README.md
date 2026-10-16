# Northstar Supply storefront

Standalone React/Vite storefront for the mock advertising journey with Razorpay Checkout integration. From the workspace root, install with `cd ecom; npm install` and start at `http://localhost:5173` with `npm run dev`.

Routes are `/` (collection), `/product/:slug`, `/cart`, `/checkout`, and `/order-confirmation`. The shared five-product catalog lives in `../shared/catalog.ts`; each product currently costs ₹1. The cart persists in local storage. Checkout obtains the checkout session before creating a Razorpay order, then passes the session token to the payment backend as Razorpay order `notes.sessionToken`. Razorpay Checkout offers UPI and verifies payment server-side. Order fulfillment is not implemented.

Copy `.env.example` to `.env` and set the Attribution System publishable key and Razorpay credentials. Begin with Razorpay test keys. Both the backend and Vite load `.env`; Vite exposes only the `VITE_*` values to the browser. Keep `RAZORPAY_KEY_SECRET` server-side; it is not exposed to Vite. Run `npm run server` and `npm run dev` in separate terminals. The payment server defaults to port 3001, while the Attribution System API uses port 5000.

See the workspace [README](../README.md) for the Morrow app, route table, shared sponsored-product destinations, attribution instrumentation points, and CDN build instructions.
