import { useState, useRef, useCallback, useEffect } from 'react'
import ChatScreen from './features/chat/ChatScreen'
import IrcScreen from './features/irc/IrcScreen'
import RssScreen from './features/rss/RssScreen'
import TerminalScreen from './features/terminal/TerminalScreen'
import ProgrammingScreen from './features/programming/ProgrammingScreen'
import SettingsScreen from './features/settings/SettingsScreen'
import RightPanel from './components/RightPanel'
import { workflowBus } from './lib/workflowBus'
import { healthCheck } from './lib/healthCheck'
import { TASK_META } from './lib/routing'
import { loadWorkflows, getWorkflow, initWorkflows, resetWorkflows } from './lib/workflows'
import { loadTheme, applyTheme } from './lib/theme'
import { loadZoom, applyZoom } from './lib/zoom'
import { loadFont, applyFont } from './lib/font'
import type { TaskType } from './lib/providers'
import { initProviders } from './lib/providers'
import { getWorkingDir, setWorkingDir } from './lib/workingDir'

export type PanelType = 'settings'

interface ChatTab {
  id: string
  label: string
  workflowType: TaskType
}

const newTab = (type: TaskType): ChatTab => {
  const meta = TASK_META[type] ?? loadWorkflows().find(w => w.type === type)
  const label = meta?.label ?? type
  return {
    id: `tab-${Date.now()}`,
    label,
    workflowType: type,
  }
}

const TABS_KEY   = 'manyai_chat_tabs'
const ACTIVE_KEY = 'manyai_active_tab'

function loadPersistedTabs(): { tabs: ChatTab[]; activeTabId: string } {
  try {
    const raw = localStorage.getItem(TABS_KEY)
    const tabs: ChatTab[] = raw ? JSON.parse(raw) : null
    if (tabs) {
      if (tabs.length === 0) return { tabs: [], activeTabId: '' }
      // Migrate old tabs that have no workflowType
      const migrated = tabs.map(t => ({ ...t, workflowType: (t.workflowType ?? 'coding') as TaskType }))
      const activeTabId = localStorage.getItem(ACTIVE_KEY) ?? migrated[0].id
      return { tabs: migrated, activeTabId }
    }
  } catch {}
  // Default first tab: General
  const t: ChatTab = { id: `tab-${Date.now()}`, label: 'Code', workflowType: 'coding' }
  return { tabs: [t], activeTabId: t.id }
}

export default function App() {
  const initial = loadPersistedTabs()
  const [tabs, setTabs] = useState<ChatTab[]>(initial.tabs)
  const [activeTabId, setActiveTabId] = useState<string>(initial.activeTabId)
  const [panel, setPanel] = useState<PanelType | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [continuousMap, setContinuousMap] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('manyai_continuous') ?? '{}') } catch { return {} }
  })
  const [workflowVersion, setWorkflowVersion] = useState(0)
  const [settingsTriggerAdd, setSettingsTriggerAdd] = useState(false)
  const [settingsInitialTab, setSettingsInitialTab] = useState<'general' | 'api' | 'workflows' | 'smartrouting' | 'health' | 'backup' | 'about'>('general')
  const [noWorkDirModal, setNoWorkDirModal] = useState(false)

  useEffect(() => {
    applyTheme(loadTheme()); applyZoom(loadZoom()); applyFont(loadFont())
    // Read durable config file first — syncs workingDir to localStorage if
    // localStorage was cleared (e.g. origin change between dev/prod).
    window.api.getConfig().then(({ config }) => {
      const saved = config.workingDir as string | undefined
      if (saved && !getWorkingDir()) {
        setWorkingDir(saved)
      }
      if (!getWorkingDir()) {
        setNoWorkDirModal(true)
      } else {
        initProviders()
        initWorkflows().then(() => setWorkflowVersion(v => v + 1))
      }
    })
  }, [])

  // ── Continuous health monitoring ─────────────────────────────────────────────
  useEffect(() => {
    const run = () => {
      const cfg = healthCheck.loadConfig()
      if (cfg.continuousEnabled) healthCheck.checkAll()
    }
    const getIntervalMs = () => healthCheck.loadConfig().intervalMinutes * 60 * 1000

    // Run once on startup if enabled, then on the configured interval.
    // Re-reads config each tick so interval changes take effect without restart.
    let timeoutId: ReturnType<typeof setTimeout>
    const schedule = () => {
      timeoutId = setTimeout(() => { run(); schedule() }, getIntervalMs())
    }
    run()
    schedule()
    return () => clearTimeout(timeoutId)
  }, [])

  // ── Workflow bus — route published payloads into their target tab ────────────
  useEffect(() => {
    return workflowBus.subscribe(({ targetTabId, payload }) => {
      const tid = targetTabId === 'active' ? activeTabId : targetTabId
      const inject = injectFns.current[tid]
      if (inject) {
        inject(payload.content)
        switchToChat(tid)
      }
    })
  }, [activeTabId])

  const injectFns = useRef<Record<string, (p: string) => void>>({})
  const [rightWidth, setRightWidth] = useState(() => {
    return parseInt(localStorage.getItem('manyai_right_width') ?? '220', 10)
  })
  const dragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartW = useRef(0)

  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true
    dragStartX.current = e.clientX
    dragStartW.current = rightWidth
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [rightWidth])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const delta = dragStartX.current - e.clientX
      const next = Math.max(160, Math.min(480, dragStartW.current + delta))
      setRightWidth(next)
    }
    const onUp = () => {
      if (!dragging.current) return
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      setRightWidth(w => { localStorage.setItem('manyai_right_width', String(w)); return w })
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [])

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
      const next = prev.filter(t => t.id !== id)
      if (activeTabId === id) {
        const idx = prev.findIndex(t => t.id === id)
        const nextActive = next.length > 0 ? next[Math.max(0, idx - 1)].id : ''
        setActiveTabId(nextActive)
        persistTabs(next, nextActive)
      } else {
        persistTabs(next, activeTabId)
      }
      localStorage.removeItem(`manyai_msgs_${id}`)
      localStorage.removeItem(`manyai_history_${id}`)
      localStorage.removeItem(`manyai_input_${id}`)
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
    setShowPicker(false)
  }

  const handleNewWorkflow = () => {
    setSettingsInitialTab('workflows')
    setSettingsTriggerAdd(true)
    setPanel('settings')
    setShowPicker(false)
  }

  const handleNoWorkDirOk = () => setNoWorkDirModal(false)

  const handleNoWorkDirNew = async () => {
    const result = await window.api.selectDirectory()
    if ('error' in result) return
    setWorkingDir(result.path)
    await window.api.ensureDir(`${result.path}/providers`)
    await window.api.ensureDir(`${result.path}/workflows`)
    await window.api.ensureDir(`${result.path}/images`)
    await window.api.ensureDir(`${result.path}/backups`)
    resetWorkflows()
    await initProviders()
    await initWorkflows()
    setNoWorkDirModal(false)
  }

  const toggleContinuous = (workflowType: string) => {
    setContinuousMap(prev => {
      const next = { ...prev, [workflowType]: !(prev[workflowType] ?? true) }
      localStorage.setItem('manyai_continuous', JSON.stringify(next))
      return next
    })
  }

  return (
    <div className="app-shell">
      <div className="app-main">
        {/* Chat tab bar */}
        <div className="chat-tab-bar">
          {tabs.map(t => {
            const meta = TASK_META[t.workflowType] ?? loadWorkflows().find(w => w.type === t.workflowType)
            return (
              <div
                key={t.id}
                className={`chat-tab ${activeTabId === t.id && !panel ? 'active' : ''}`}
                onClick={() => switchToChat(t.id)}
                title={`${meta?.label ?? t.workflowType} — ${t.label}`}
              >
                <span className="chat-tab-label">
                  <span style={{ marginRight: 4 }}>{meta?.icon ?? '🔧'}</span>
                  {t.label}
                </span>
                <button
                  className="chat-tab-close"
                  onClick={e => { e.stopPropagation(); closeTab(t.id) }}
                >×</button>
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
              {t.workflowType === 'irc' ? (
                <IrcScreen />
              ) : t.workflowType === 'terminal' ? (
                <TerminalScreen />
              ) : t.workflowType === 'programming' ? (
                <ProgrammingScreen tabId={t.id} />
              ) : t.workflowType === 'rss' ? (
                <RssScreen
                  availableTabs={tabs
                    .filter(x => x.workflowType !== 'rss' && x.workflowType !== 'irc')
                    .map(x => ({ id: x.id, label: x.label, workflowType: x.workflowType }))}
                />
              ) : (
                <ChatScreen
                  tabId={t.id}
                  workflowType={t.workflowType}
                  continuousState={continuousMap[t.workflowType] ?? true}
                  onInjectReady={(fn) => { injectFns.current[t.id] = fn }}
                  onFirstMessage={() => {}}
                />
              )}
            </div>
          ))}

          {panel === 'settings' && (
            <SettingsScreen
              initialTab={settingsInitialTab}
              triggerAdd={settingsTriggerAdd}
              onTriggerAddConsumed={() => setSettingsTriggerAdd(false)}
            />
          )}
        </div>
      </div>

      {noWorkDirModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 10, padding: '28px 32px', maxWidth: 420, width: '90%',
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>No Working Directory Found</div>
            <div style={{ fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
              The working directory could not be located. It may be on shared storage that is temporarily unavailable.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-ghost" onClick={handleNoWorkDirOk}>OK</button>
              <button className="btn-primary" onClick={handleNoWorkDirNew}>NEW</button>
            </div>
          </div>
        </div>
      )}

      <div className="right-panel-wrapper" style={{ width: rightWidth }}>
        <div className="panel-resize-handle" onMouseDown={onResizeMouseDown} />
        <RightPanel
          activePanel={panel}
          onTogglePanel={togglePanel}
          showPicker={showPicker}
          onSelectWorkflow={addTab}
          onCancelPicker={() => setShowPicker(false)}
          onNewWorkflow={handleNewWorkflow}
          activeWorkflowType={tabs.find(t => t.id === activeTabId)?.workflowType ?? ''}
          activeWorkflow={(() => {
            const t = tabs.find(t => t.id === activeTabId)
            if (!t) return null
            void workflowVersion // forces re-derivation after edits
            return getWorkflow(t.workflowType) ?? null
          })()}
          continuousState={(() => { const t = tabs.find(t => t.id === activeTabId); return continuousMap[t?.workflowType ?? ''] ?? true })()}
          onToggleContinuous={() => { const t = tabs.find(t => t.id === activeTabId); if (t) toggleContinuous(t.workflowType) }}
          onWorkflowSaved={() => setWorkflowVersion(v => v + 1)}
        />
      </div>
    </div>
  )
}
