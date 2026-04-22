import { useState, useRef } from 'react'
import ChatScreen from './screens/ChatScreen'
import SettingsScreen from './screens/SettingsScreen'
import SavedScreen from './screens/SavedScreen'
import ApiScreen from './screens/ApiScreen'
import ProvidersScreen from './screens/ProvidersScreen'
import RoutingScreen from './screens/RoutingScreen'
import RightPanel from './components/RightPanel'

export type PanelType = 'saved' | 'routing' | 'api' | 'providers' | 'settings'

interface ChatTab {
  id: string
  label: string
}

let tabCounter = 1
const newTab = (): ChatTab => ({ id: `tab-${Date.now()}`, label: `Chat ${tabCounter++}` })

export default function App() {
  const [tabs, setTabs] = useState<ChatTab[]>([newTab()])
  const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id)
  const [panel, setPanel] = useState<PanelType | null>(null)

  const injectFns = useRef<Record<string, (p: string) => void>>({})

  const handleWorkflow = (prompt: string) => {
    setPanel(null)
    setTimeout(() => injectFns.current[activeTabId]?.(prompt), 50)
  }

  const addTab = () => {
    const t = newTab()
    setTabs(prev => [...prev, t])
    setActiveTabId(t.id)
    setPanel(null)
  }

  const closeTab = (id: string) => {
    setTabs(prev => {
      if (prev.length === 1) return prev  // never close last tab
      const next = prev.filter(t => t.id !== id)
      if (activeTabId === id) {
        const idx = prev.findIndex(t => t.id === id)
        setActiveTabId(next[Math.max(0, idx - 1)].id)
      }
      return next
    })
  }

  const switchToChat = (id: string) => {
    setActiveTabId(id)
    setPanel(null)
  }

  const togglePanel = (p: PanelType) => {
    setPanel(prev => prev === p ? null : p)
  }

  const updateTabLabel = (id: string, label: string) => {
    setTabs(prev => prev.map(t => t.id === id ? { ...t, label } : t))
  }

  return (
    <div className="app-shell">
      <div className="app-main">
        {/* Chat tab bar */}
        <div className="chat-tab-bar">
          {tabs.map(t => (
            <div
              key={t.id}
              className={`chat-tab ${activeTabId === t.id && !panel ? 'active' : ''}`}
              onClick={() => switchToChat(t.id)}
            >
              <span className="chat-tab-label">✦ {t.label}</span>
              {tabs.length > 1 && (
                <button
                  className="chat-tab-close"
                  onClick={e => { e.stopPropagation(); closeTab(t.id) }}
                >×</button>
              )}
            </div>
          ))}
          <button className="chat-tab-add" onClick={addTab} title="New chat">+</button>
        </div>

        {/* Content area */}
        <div className="tab-content">
          {/* Chat instances — all mounted, only active one visible */}
          {tabs.map(t => (
            <div
              key={t.id}
              style={{ display: panel === null && activeTabId === t.id ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden' }}
            >
              <ChatScreen
                tabId={t.id}
                onInjectReady={(fn) => { injectFns.current[t.id] = fn }}
                onFirstMessage={(text) => updateTabLabel(t.id, text.slice(0, 24) || t.label)}
              />
            </div>
          ))}

          {/* Settings panels */}
          {panel === 'saved'     && <SavedScreen />}
          {panel === 'routing'   && <RoutingScreen />}
          {panel === 'api'       && <ApiScreen />}
          {panel === 'providers' && <ProvidersScreen />}
          {panel === 'settings'  && <SettingsScreen />}
        </div>
      </div>

      <RightPanel
        onWorkflow={handleWorkflow}
        activePanel={panel}
        onTogglePanel={togglePanel}
      />
    </div>
  )
}
