import { useState, useRef } from 'react'
import ChatScreen from './screens/ChatScreen'
import SettingsScreen from './screens/SettingsScreen'
import SavedScreen from './screens/SavedScreen'
import ApiScreen from './screens/ApiScreen'
import ProvidersScreen from './screens/ProvidersScreen'
import RoutingScreen from './screens/RoutingScreen'
import RightPanel from './components/RightPanel'

type Tab = 'chat' | 'saved' | 'routing' | 'api' | 'providers' | 'settings'

export default function App() {
  const [tab, setTab] = useState<Tab>('chat')
  const injectPromptRef = useRef<((p: string) => void) | null>(null)

  const handleWorkflow = (prompt: string) => {
    setTab('chat')
    // slight delay so ChatScreen is mounted before injecting
    setTimeout(() => injectPromptRef.current?.(prompt), 50)
  }

  return (
    <div className="app-shell">
      <div className="app-main">
        <div className="tabs">
          {(['chat','saved','routing','api','providers','settings'] as Tab[]).map(t => (
            <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
              {t === 'chat'      && '✦ Chat'}
              {t === 'saved'     && '📂 Saved'}
              {t === 'routing'   && '🔀 Routing'}
              {t === 'api'       && '🔑 API'}
              {t === 'providers' && '⚡ Providers'}
              {t === 'settings'  && '⚙ Settings'}
            </button>
          ))}
        </div>
        <div className="tab-content">
          {tab === 'chat'      && <ChatScreen injectPromptRef={injectPromptRef} />}
          {tab === 'saved'     && <SavedScreen />}
          {tab === 'routing'   && <RoutingScreen />}
          {tab === 'api'       && <ApiScreen />}
          {tab === 'providers' && <ProvidersScreen />}
          {tab === 'settings'  && <SettingsScreen />}
        </div>
      </div>
      <RightPanel onWorkflow={handleWorkflow} />
    </div>
  )
}
