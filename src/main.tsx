import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AppDBProvider } from './db/DBContext'
import './index.css'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppDBProvider>
      <App />
    </AppDBProvider>
  </React.StrictMode>,
)
