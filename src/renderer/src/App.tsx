import { useState } from 'react'
import ChatScreen from './screens/ChatScreen'
import SettingsScreen from './screens/SettingsScreen'
import SavedScreen from './screens/SavedScreen'

type Tab = 'chat' | 'saved' | 'settings'

export default function App() {
  const [tab, setTab] = useState<Tab>('chat')

  return (
    <>
      <div className="tabs">
        <button className={`tab-btn ${tab === 'chat' ? 'active' : ''}`} onClick={() => setTab('chat')}>
          ✦ Chat
        </button>
        <button className={`tab-btn ${tab === 'saved' ? 'active' : ''}`} onClick={() => setTab('saved')}>
          📂 Saved
        </button>
        <button className={`tab-btn ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>
          ⚙ Settings
        </button>
      </div>
      {tab === 'chat' && <ChatScreen />}
      {tab === 'saved' && <SavedScreen />}
      {tab === 'settings' && <SettingsScreen />}
    </>
  )
}
