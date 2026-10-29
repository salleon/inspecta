import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Manrope bundled with the app (not fetched from Google Fonts), so the UI
// and the photo timestamps use the same font offline on site too
import '@fontsource-variable/manrope'
import './index.css'
import App from './App.tsx'
import { setUpOfflineCache } from './lib/offlineCache'
import { Capacitor } from '@capacitor/core'
import { clearOldExports } from './lib/cacheFile'
import { tidyPhotoStorage } from './db/db'

// Ask the browser to keep this app's storage (sites, findings, photos) even
// when the phone runs low on space, instead of treating it as a clearable
// cache. Best effort: nothing changes if it's refused or unsupported.
void navigator.storage?.persist?.().catch(() => false)

// offline cache: web only; cleared out inside the Android app
void setUpOfflineCache()

// exports shared in an earlier session are no longer needed
if (Capacitor.isNativePlatform()) void clearOldExports(0)
// a little after opening, so the first screen isn't slowed
setTimeout(() => void tidyPhotoStorage().catch(() => {}), 5000)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
