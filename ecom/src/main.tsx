import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './touch-tracking.v2'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
