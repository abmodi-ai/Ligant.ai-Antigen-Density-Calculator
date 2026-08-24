import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import CytotoxicityApp from './apps/CytotoxicityApp'
import './theme'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CytotoxicityApp />
  </StrictMode>,
)
