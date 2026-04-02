import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { AppDBProvider } from './db/DBContext.tsx'
import { AppErrorBoundary } from './ErrorBoundary.tsx'
import { CryptoProvider } from './crypto/CryptoContext.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <CryptoProvider>
        <AppDBProvider>
          <App />
        </AppDBProvider>
      </CryptoProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
