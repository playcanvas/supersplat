import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Application } from '@playcanvas/react'
import { FILLMODE_FILL_WINDOW, RESOLUTION_AUTO } from 'playcanvas'

const queryClient = new QueryClient()

const graphicsOptions = {
  antialias: false,
  depth: false,
  highResolution: true,
  stencil: false,
  fillMode: FILLMODE_FILL_WINDOW,
  resizeMode: RESOLUTION_AUTO,
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Application graphicsOptions={graphicsOptions} high-resolution="true" stencil="false" fillMode={FILLMODE_FILL_WINDOW} resizeMode={RESOLUTION_AUTO}>
        <App />
      </Application>
    </QueryClientProvider>
  </StrictMode>,
)
