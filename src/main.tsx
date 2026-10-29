import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import './components/form-layout.css'
import './shell.css'
import './workspace-simple.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
