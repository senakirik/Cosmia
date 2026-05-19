import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ParticleField from './components/ParticleField'
import ComponentsSheet from './pages/ComponentsSheet'

function Canvas() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0A0A0C' }}>
      <ParticleField mode="sparse" seed={2} />
      <div className="grain" />
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Canvas />} />
        <Route path="/components" element={<ComponentsSheet />} />
      </Routes>
    </BrowserRouter>
  )
}
