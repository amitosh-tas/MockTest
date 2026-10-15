# Morrow social mock

Standalone React/Vite social feed at `http://localhost:5174`. From the workspace root, install with `cd smedia; npm install` and start with `npm run dev`.

The `/` feed keeps organic posts as accessible skeleton placeholders and displays sponsored cards for all five products in the shared `../shared/catalog.ts` file. Ad links default to Northstar Supply at `http://localhost:5173`; set `VITE_STORE_ORIGIN` at build time to change the destination origin. Each sponsored click randomly sets `source=google` or `source=meta`, adds `medium=ctc` and `campaign=affiliate`, includes the product ID as `content`, and generates a fresh `touch_id` UUID. These query parameters label the redirect but do not transmit events.

See the workspace [README](../README.md) for route details, attribution instrumentation points, and CDN build instructions.
