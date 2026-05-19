import ParticleField from './components/ParticleField'

export default function App() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0A0A0C' }}>
      {/* Particle canvas — full bleed, z-index 0 */}
      <ParticleField mode="sparse" seed={2} />

      {/* Grain overlay — z-index 100 via CSS */}
      <div className="grain" />
    </div>
  )
}
