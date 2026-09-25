import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Manrope bundled with the app (not fetched from Google Fonts), so the UI
// and the photo timestamps use the same font offline on site too
import '@fontsource-variable/manrope'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
