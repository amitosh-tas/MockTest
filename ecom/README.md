# Northstar Supply storefront

Standalone React/Vite storefront for the mock advertising journey. From the workspace root, install with `cd ecom; npm install` and start at `http://localhost:5173` with `npm run dev`.

Routes are `/` (collection), `/product/:slug`, `/cart`, `/checkout`, and `/order-confirmation`. The shared five-product catalog lives in `../shared/catalog.ts`. The cart persists in local storage. Checkout uses a mock payment screen; after simulated payment success it creates a checkout session through `POST /v1/checkout-sessions` with the saved visitor ID. It does not collect a real payment or fulfill orders, and it only shows order confirmation after the session API succeeds.

See the workspace [README](../README.md) for the Morrow app, route table, shared sponsored-product destinations, attribution instrumentation points, and CDN build instructions.
