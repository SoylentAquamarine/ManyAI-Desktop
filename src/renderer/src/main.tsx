import './styles/globals.css'
import './i18n/config'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initKeyStore } from './lib/keyStore'

initKeyStore()
  .catch(err => console.error('initKeyStore failed, continuing with empty key cache:', err))
  .then(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>
    )
  })
