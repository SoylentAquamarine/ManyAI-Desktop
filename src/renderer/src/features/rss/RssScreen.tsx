/**
 * RssScreen.tsx — RSS/Atom feed reader workflow tab.
 *
 * Acts as a data source in the workflow engine: feed items can be sent
 * directly to any other workflow tab via workflowBus.publish().
 *
 * Layout (top to bottom):
 *   1. Feed bar     — add/remove feed URLs, select active feed, refresh, auto-poll
 *   2. Item list    — scrollable cards for the active feed
 *   3. Item detail  — expanded view of selected item + "Send to workflow" controls
 *
 * Data flow:
 *   fetch-url IPC → parseXml() → FeedItem[] → user selects item
 *   → workflowBus.publish() → App.tsx injects text into target tab
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { workflowBus } from '../../lib/workflowBus'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AvailableTab {
  id: string
  label: string
  workflowType: string
}

interface FeedItem {
  id: string
  title: string
  link: string
  /** Plain-text description (HTML stripped) */
  description: string
  pubDate: string
  feedTitle: string
  feedUrl: string
}

interface Feed {
  url: string
  title: string
  items: FeedItem[]
  loading: boolean
  error?: string
  lastFetched?: string
}

interface Props {
  /** Chat/workflow tabs available as send targets — passed down from App.tsx */
  availableTabs: AvailableTab[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const LS_FEEDS_KEY = 'manyai_rss_feeds'
const DEFAULT_POLL_INTERVAL = 0 // minutes; 0 = manual only

// ── XML parsing ───────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function parseXml(text: string, feedUrl: string): { title: string; items: FeedItem[] } {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const parseError = doc.querySelector('parsererror')
  if (parseError) throw new Error('Invalid XML — not a valid RSS or Atom feed')

  const isAtom = !!doc.querySelector('feed')

  if (isAtom) {
    const feedTitle = doc.querySelector('feed > title')?.textContent?.trim() ?? feedUrl
    const entries = [...doc.querySelectorAll('entry')]
    return {
      title: feedTitle,
      items: entries.map((e, i) => ({
        id:          e.querySelector('id')?.textContent?.trim() ?? `${feedUrl}-${i}`,
        title:       e.querySelector('title')?.textContent?.trim() ?? '(no title)',
        link:        e.querySelector('link')?.getAttribute('href') ?? '',
        description: stripHtml(e.querySelector('content, summary')?.textContent ?? ''),
        pubDate:     e.querySelector('published, updated')?.textContent?.trim() ?? '',
        feedTitle,
        feedUrl,
      })),
    }
  }

  // RSS 2.0
  const feedTitle = doc.querySelector('channel > title')?.textContent?.trim() ?? feedUrl
  const items = [...doc.querySelectorAll('item')]
  return {
    title: feedTitle,
    items: items.map((e, i) => ({
      id:          e.querySelector('guid')?.textContent?.trim()
                    ?? e.querySelector('link')?.textContent?.trim()
                    ?? `${feedUrl}-${i}`,
      title:       e.querySelector('title')?.textContent?.trim() ?? '(no title)',
      link:        e.querySelector('link')?.textContent?.trim() ?? '',
      description: stripHtml(e.querySelector('description')?.textContent ?? ''),
      pubDate:     e.querySelector('pubDate')?.textContent?.trim() ?? '',
      feedTitle,
      feedUrl,
    })),
  }
}

function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  try {
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}

// ── Persistence ───────────────────────────────────────────────────────────────

function loadFeedUrls(): string[] {
  try { return JSON.parse(localStorage.getItem(LS_FEEDS_KEY) ?? '[]') } catch { return [] }
}

function saveFeedUrls(urls: string[]): void {
  localStorage.setItem(LS_FEEDS_KEY, JSON.stringify(urls))
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RssScreen({ availableTabs }: Props) {
  const [feeds, setFeeds]               = useState<Feed[]>(() =>
    loadFeedUrls().map(url => ({ url, title: url, items: [], loading: false }))
  )
  const [activeFeedUrl, setActiveFeedUrl] = useState<string | null>(
    () => loadFeedUrls()[0] ?? null
  )
  const [urlInput, setUrlInput]         = useState('')
  const [selectedItem, setSelectedItem] = useState<FeedItem | null>(null)
  const [sendTarget, setSendTarget]     = useState<string>('')
  const [pollInterval, setPollInterval] = useState(DEFAULT_POLL_INTERVAL)
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const urlInputRef  = useRef<HTMLInputElement>(null)

  // Set a default send target when available tabs change
  useEffect(() => {
    if (!sendTarget && availableTabs.length > 0) setSendTarget(availableTabs[0].id)
  }, [availableTabs, sendTarget])

  // ── Feed fetching ───────────────────────────────────────────────────────────

  const fetchFeed = useCallback(async (url: string) => {
    setFeeds(prev => prev.map(f => f.url === url ? { ...f, loading: true, error: undefined } : f))
    const result = await window.api.fetchUrl(url)
    if ('error' in result) {
      setFeeds(prev => prev.map(f =>
        f.url === url ? { ...f, loading: false, error: result.error } : f
      ))
      return
    }
    try {
      const { title, items } = parseXml(result.content, url)
      setFeeds(prev => prev.map(f =>
        f.url === url
          ? { ...f, loading: false, title, items, lastFetched: new Date().toISOString() }
          : f
      ))
    } catch (e) {
      setFeeds(prev => prev.map(f =>
        f.url === url
          ? { ...f, loading: false, error: e instanceof Error ? e.message : String(e) }
          : f
      ))
    }
  }, [])

  const fetchAll = useCallback(() => {
    feeds.forEach(f => fetchFeed(f.url))
  }, [feeds, fetchFeed])

  // Fetch all feeds on mount
  useEffect(() => {
    if (feeds.length > 0) fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-poll timer
  useEffect(() => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    if (pollInterval > 0) {
      pollTimerRef.current = setInterval(fetchAll, pollInterval * 60 * 1000)
    }
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current) }
  }, [pollInterval, fetchAll])

  // ── Feed management ─────────────────────────────────────────────────────────

  const addFeed = () => {
    const url = urlInput.trim()
    if (!url || feeds.some(f => f.url === url)) { setUrlInput(''); return }
    const newFeed: Feed = { url, title: url, items: [], loading: false }
    setFeeds(prev => {
      const next = [...prev, newFeed]
      saveFeedUrls(next.map(f => f.url))
      return next
    })
    setActiveFeedUrl(url)
    setUrlInput('')
    fetchFeed(url)
  }

  const removeFeed = (url: string) => {
    setFeeds(prev => {
      const next = prev.filter(f => f.url !== url)
      saveFeedUrls(next.map(f => f.url))
      return next
    })
    if (activeFeedUrl === url) {
      setActiveFeedUrl(feeds.find(f => f.url !== url)?.url ?? null)
    }
    if (selectedItem?.feedUrl === url) setSelectedItem(null)
  }

  // ── Send to workflow ────────────────────────────────────────────────────────

  const sendToWorkflow = (item: FeedItem, tabId: string) => {
    if (!tabId) return
    const content = [
      item.title,
      item.link ? `Source: ${item.link}` : '',
      '',
      item.description,
    ].filter(Boolean).join('\n')

    workflowBus.publish({
      targetTabId: tabId,
      payload: {
        source:      'rss',
        contentType: 'article',
        timestamp:   item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
        content,
        title:       item.title,
        url:         item.link,
        metadata: {
          feedTitle: item.feedTitle,
          feedUrl:   item.feedUrl,
        },
      },
    })
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const activeFeed = feeds.find(f => f.url === activeFeedUrl)
  const items = activeFeed?.items ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Feed bar ──────────────────────────────────────────────────────── */}
      <div style={{
        padding: '8px 12px', background: 'var(--bg2)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0,
      }}>
        {/* Add feed row */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            ref={urlInputRef}
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addFeed()}
            placeholder="https://example.com/feed.xml"
            style={{ flex: 1, fontSize: 12, padding: '4px 8px' }}
          />
          <button className="btn-primary" onClick={addFeed} style={{ fontSize: 12, padding: '4px 12px', whiteSpace: 'nowrap' }}>
            + Add Feed
          </button>
          <button className="btn-ghost" onClick={fetchAll} style={{ fontSize: 12, padding: '4px 10px', whiteSpace: 'nowrap' }}
            title="Refresh all feeds">
            ↺ Refresh
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
            Auto-poll
            <select
              value={pollInterval}
              onChange={e => setPollInterval(Number(e.target.value))}
              style={{ fontSize: 11 }}
            >
              <option value={0}>Off</option>
              <option value={5}>5 min</option>
              <option value={15}>15 min</option>
              <option value={30}>30 min</option>
              <option value={60}>1 hr</option>
            </select>
          </label>
        </div>

        {/* Feed tabs */}
        {feeds.length > 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {feeds.map(f => (
              <div key={f.url} style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                <button
                  onClick={() => { setActiveFeedUrl(f.url); setSelectedItem(null) }}
                  title={f.url}
                  style={{
                    padding: '3px 10px', fontSize: 11, borderRadius: '4px 0 0 4px',
                    border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                    maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis',
                    background: activeFeedUrl === f.url ? 'var(--accent)' : 'var(--bg)',
                    color:      activeFeedUrl === f.url ? 'var(--accent-text, #fff)' : 'var(--text)',
                    borderRight: '1px solid var(--border)',
                  }}
                >
                  {f.loading ? '⟳ ' : ''}{f.title !== f.url ? f.title : new URL(f.url.startsWith('http') ? f.url : `https://${f.url}`).hostname}
                </button>
                <button
                  onClick={() => removeFeed(f.url)}
                  title="Remove feed"
                  style={{
                    padding: '3px 6px', fontSize: 10, borderRadius: '0 4px 4px 0',
                    border: 'none', cursor: 'pointer',
                    background: activeFeedUrl === f.url ? 'var(--accent)' : 'var(--bg)',
                    color: activeFeedUrl === f.url ? 'var(--accent-text, #fff)' : 'var(--text-dim)',
                  }}
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Error bar ─────────────────────────────────────────────────────── */}
      {activeFeed?.error && (
        <div style={{ padding: '6px 12px', background: 'rgba(238,85,85,0.1)', fontSize: 12, color: '#e55', borderBottom: '1px solid var(--border)' }}>
          ✗ {activeFeed.error}
        </div>
      )}

      {/* ── Item list + detail (side by side if item selected) ────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Item list */}
        <div style={{
          flex: selectedItem ? '0 0 340px' : 1,
          overflowY: 'auto',
          borderRight: selectedItem ? '1px solid var(--border)' : 'none',
        }}>
          {feeds.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
              Add an RSS or Atom feed URL above to get started.
            </div>
          )}
          {feeds.length > 0 && !activeFeed && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
              Select a feed above.
            </div>
          )}
          {activeFeed?.loading && items.length === 0 && (
            <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-dim)', fontSize: 13 }}>
              Loading…
            </div>
          )}
          {items.map(item => (
            <div
              key={item.id}
              onClick={() => setSelectedItem(prev => prev?.id === item.id ? null : item)}
              style={{
                padding: '10px 14px',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                background: selectedItem?.id === item.id ? 'var(--bg2)' : 'transparent',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3, marginBottom: 3 }}>
                {item.title}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>
                {item.feedTitle !== item.feedUrl && <span style={{ marginRight: 6 }}>{item.feedTitle}</span>}
                {formatDate(item.pubDate)}
              </div>
              {item.description && (
                <div style={{
                  fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5,
                  overflow: 'hidden',
                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                }}>
                  {item.description}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Item detail panel */}
        {selectedItem && (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4 }}>
              {selectedItem.title}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              {selectedItem.feedTitle} · {formatDate(selectedItem.pubDate)}
            </div>

            {selectedItem.description && (
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {selectedItem.description}
              </div>
            )}

            {selectedItem.link && (
              <a
                href={selectedItem.link}
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: 12, color: 'var(--accent)', wordBreak: 'break-all' }}
              >
                {selectedItem.link}
              </a>
            )}

            {/* ── Send to workflow ──────────────────────────────────────── */}
            <div style={{
              marginTop: 'auto', paddingTop: 16,
              borderTop: '1px solid var(--border)',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
                Send to Workflow
              </div>
              {availableTabs.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                  Open a chat or workflow tab to send this article there.
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={sendTarget}
                    onChange={e => setSendTarget(e.target.value)}
                    style={{ fontSize: 12, padding: '4px 8px', flex: 1, minWidth: 140 }}
                  >
                    {availableTabs.map(t => (
                      <option key={t.id} value={t.id}>{t.label}</option>
                    ))}
                  </select>
                  <button
                    className="btn-primary"
                    onClick={() => sendToWorkflow(selectedItem, sendTarget)}
                    disabled={!sendTarget}
                    style={{ fontSize: 12, padding: '5px 14px', whiteSpace: 'nowrap' }}
                  >
                    → Send
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => {
                      workflowBus.publish({
                        targetTabId: 'active',
                        payload: {
                          source: 'rss', contentType: 'article',
                          timestamp: new Date().toISOString(),
                          content: [selectedItem.title, selectedItem.link ? `Source: ${selectedItem.link}` : '', '', selectedItem.description].filter(Boolean).join('\n'),
                          title: selectedItem.title, url: selectedItem.link,
                          metadata: { feedTitle: selectedItem.feedTitle, feedUrl: selectedItem.feedUrl },
                        },
                      })
                    }}
                    style={{ fontSize: 12, padding: '5px 14px', whiteSpace: 'nowrap' }}
                    title="Send to whichever chat tab is currently active"
                  >
                    → Active Tab
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
