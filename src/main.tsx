import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Manrope bundled with the app (not fetched from Google Fonts), so the UI
// and the photo timestamps use the same font offline on site too
import '@fontsource-variable/manrope'
import './index.css'
import App from './App.tsx'

// Ask the browser to keep this app's storage (sites, findings, photos) even
// when the phone runs low on space, instead of treating it as a clearable
// cache. Best effort: nothing changes if it's refused or unsupported.
void navigator.storage?.persist?.().catch(() => false)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
