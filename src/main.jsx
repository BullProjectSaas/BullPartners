import { StrictMode, Component } from 'react'

class Boundary extends Component {
  state = { err: null }
  static getDerivedStateFromError(err) { return { err } }
  render() {
    if (!this.state.err) return this.props.children
    return <div className="login"><div className="login-card"><h2>Algo salió mal</h2><p className="muted sm">{String(this.state.err.message || this.state.err)}</p><button className="btn mt" onClick={() => location.reload()}>Recargar</button></div></div>
  }
}
import { createRoot } from 'react-dom/client'
import { StoreProvider } from './store.jsx'
import App from './App.jsx'
import './styles.css'
import { applyStoredTheme } from './ui.jsx'

applyStoredTheme()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Boundary><StoreProvider><App /></StoreProvider></Boundary>
  </StrictMode>,
)
