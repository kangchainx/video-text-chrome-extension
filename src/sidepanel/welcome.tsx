import React from 'react'
import ReactDOM from 'react-dom/client'
import WelcomeApp from './WelcomeApp'
import '../index.css'
import '../i18n'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WelcomeApp />
  </React.StrictMode>,
)
