import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { AppDBProvider } from './db/DBContext.tsx'
import { AppErrorBoundary } from './ErrorBoundary.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <AppDBProvider>
        <App />
      </AppDBProvider>
    </AppErrorBoundary>
  </StrictMode>,
)
