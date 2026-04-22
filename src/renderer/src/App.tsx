import { useState, useRef } from 'react'
import ChatScreen from './screens/ChatScreen'
import SettingsScreen from './screens/SettingsScreen'
import SavedScreen from './screens/SavedScreen'
import ApiScreen from './screens/ApiScreen'
import ProvidersScreen from './screens/ProvidersScreen'
import RoutingScreen from './screens/RoutingScreen'
import WorkflowsScreen from './screens/WorkflowsScreen'
import RightPanel from './components/RightPanel'
import WorkflowPickerModal from './components/WorkflowPickerModal'
import { TASK_META } from './lib/routing'
import type { TaskType } from './lib/providers'

export type PanelType = 'saved' | 'workflows' | 'routing' | 'api' | 'providers' | 'settings'

interface ChatTab {
  id: string
  label: string
  workflowType: TaskType
}

let tabCounter = 2   // starts at 2 because the first tab is created at load
const newTab = (type: TaskType): ChatTab => {
  const meta = TASK_META[type]
  return {
    id: `tab-${Date.now()}`,
    label: `${meta.label} ${tabCounter++}`,
    workflowType: type,
  }
}

const TABS_KEY   = 'manyai_chat_tabs'
const ACTIVE_KEY = 'manyai_active_tab'

function loadPersistedTabs(): { tabs: ChatTab[]; activeTabId: string } {
  try {
    const raw = localStorage.getItem(TABS_KEY)
    const tabs: ChatTab[] = raw ? JSON.parse(raw) : null
    if (tabs && tabs.length > 0) {
      // Migrate old tabs that have no workflowType
      const migrated = tabs.map(t => ({ workflowType: 'general' as TaskType, ...t }))
      const activeTabId = localStorage.getItem(ACTIVE_KEY) ?? migrated[0].id
      return { tabs: migrated, activeTabId }
    }
  } catch {}
  // Default first tab: General
  const t: ChatTab = { id: `tab-${Date.now()}`, label: 'General', workflowType: 'general' }
  return { tabs: [t], activeTabId: t.id }
}

export default function App() {
  const initial = loadPersistedTabs()
  const [tabs, setTabs] = useState<ChatTab[]>(initial.tabs)
  const [activeTabId, setActiveTabId] = useState<string>(initial.activeTabId)
  const [panel, setPanel] = useState<PanelType | null>(null)
  const [showPicker, setShowPicker] = useState(false)

  const injectFns = useRef<Record<string, (p: string) => void>>({})

  const handleWorkflow = (prompt: string) => {
    setPanel(null)
    setTimeout(() => injectFns.current[activeTabId]?.(prompt), 50)
  }

  const persistTabs = (tabs: ChatTab[], activeId: string) => {
    localStorage.setItem(TABS_KEY, JSON.stringify(tabs))
    localStorage.setItem(ACTIVE_KEY, activeId)
  }

  const addTab = (type: TaskType) => {
    const t = newTab(type)
    setTabs(prev => { const next = [...prev, t]; persistTabs(next, t.id); return next })
    setActiveTabId(t.id)
    setPanel(null)
    setShowPicker(false)
  }

  const closeTab = (id: string) => {
    setTabs(prev => {
      if (prev.length === 1) return prev
      const next = prev.filter(t => t.id !== id)
      let nextActive = activeTabId
      if (activeTabId === id) {
        const idx = prev.findIndex(t => t.id === id)
        nextActive = next[Math.max(0, idx - 1)].id
        setActiveTabId(nextActive)
      }
      persistTabs(next, nextActive)
      localStorage.removeItem(`manyai_msgs_${id}`)
      localStorage.removeItem(`manyai_history_${id}`)
      return next
    })
  }

  const switchToChat = (id: string) => {
    setActiveTabId(id)
    localStorage.setItem(ACTIVE_KEY, id)
    setPanel(null)
  }

  const togglePanel = (p: PanelType) => {
    setPanel(prev => prev === p ? null : p)
  }

  const updateTabLabel = (id: string, label: string) => {
    setTabs(prev => {
      const next = prev.map(t => t.id === id ? { ...t, label } : t)
      persistTabs(next, activeTabId)
      return next
    })
  }

  return (
    <div className="app-shell">
      <div className="app-main">
        {/* Chat tab bar */}
        <div className="chat-tab-bar">
          {tabs.map(t => {
            const meta = TASK_META[t.workflowType]
            return (
              <div
                key={t.id}
                className={`chat-tab ${activeTabId === t.id && !panel ? 'active' : ''}`}
                onClick={() => switchToChat(t.id)}
                title={`${meta.label} — ${t.label}`}
              >
                <span className="chat-tab-label">
                  <span style={{ marginRight: 4 }}>{meta.icon}</span>
                  {t.label}
                </span>
                {tabs.length > 1 && (
                  <button
                    className="chat-tab-close"
                    onClick={e => { e.stopPropagation(); closeTab(t.id) }}
                  >×</button>
                )}
              </div>
            )
          })}
          <button
            className="chat-tab-add"
            onClick={() => setShowPicker(true)}
            title="New tab — choose workflow type"
          >+</button>
        </div>

        {/* Content area */}
        <div className="tab-content">
          {tabs.map(t => (
            <div
              key={t.id}
              style={{ display: panel === null && activeTabId === t.id ? 'flex' : 'none', flex: 1, flexDirection: 'column', overflow: 'hidden' }}
            >
              <ChatScreen
                tabId={t.id}
                workflowType={t.workflowType}
                onInjectReady={(fn) => { injectFns.current[t.id] = fn }}
                onFirstMessage={(text) => updateTabLabel(t.id, text.slice(0, 24) || t.label)}
              />
            </div>
          ))}

          {panel === 'saved'     && <SavedScreen />}
          {panel === 'workflows' && <WorkflowsScreen onOpenRouting={() => setPanel('routing')} />}
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

      {showPicker && (
        <WorkflowPickerModal
          onSelect={addTab}
          onCancel={() => setShowPicker(false)}
        />
      )}
    </div>
  )
}
