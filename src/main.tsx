import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Manrope bundled with the app (not fetched from Google Fonts), so the UI
// and the photo timestamps use the same font offline on site too
import '@fontsource-variable/manrope'
// Sora Bold, only for the Inspecta logotype in Contractor mode
// (components/InspectaWordmark)
import '@fontsource/sora/700.css'
import './index.css'
import App from './App.tsx'
import { removeOldOfflineCache } from './lib/offlineCache'
import { Capacitor } from '@capacitor/core'
import { clearOldExports } from './lib/cacheFile'
import { splitSiteTests, tidyPhotoStorage } from './db/db'
import { applyTheme, repairLogo } from './lib/company'

// the company's colours in the Contractor app, before the first paint
applyTheme()
// a logo saved before logos were checked is made a PNG (or dropped)
void repairLogo()

// Ask the browser to keep this app's storage (sites, findings, photos) even
// when the phone runs low on space, instead of treating it as a clearable
// cache. Best effort: nothing changes if it's refused or unsupported.
void navigator.storage?.persist?.().catch(() => false)

// an offline cache left by an older version is cleared out
void removeOldOfflineCache()

// exports shared in an earlier session are no longer needed
if (Capacitor.isNativePlatform()) void clearOldExports(0)
// a little after opening, so the first screen isn't slowed
setTimeout(() => void tidyPhotoStorage().catch(() => {}), 5000)
// ask the phone not to clear the app's data when it runs short of space
// (everything lives only on the phone until it's backed up)
void navigator.storage?.persist?.().catch(() => {})

// tests made inside AFSS and project sites before test jobs move into their
// own attached jobs (db testJobs), before the first screen reads them
void splitSiteTests()
  .catch((err) => console.error('splitting site tests failed', err))
  .finally(() =>
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  )
