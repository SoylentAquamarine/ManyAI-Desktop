/**
 * modelTester.ts — Per-capability model testing.
 *
 * testModel()    — tests declared capabilities only (used by "Test" / "Test All")
 * discoverModel() — tests ALL capabilities regardless of what's declared (used by "Discover")
 *
 * Testers: chat, image, vision, audio (TTS + STT)
 * Not auto-testable: video (async/expensive), agent (environment-specific)
 */

import { getAllProviders } from './providers'
import { callProvider } from './callProvider'
import { callImageProvider } from './callImageProvider'
import type { WorkflowType } from './workflowTypes'

export interface CapabilityResult {
  capability: WorkflowType
  passed: boolean
  latencyMs: number
  grade: 'A' | 'B' | 'C' | 'F'
  note?: string
  skipped?: boolean
}

export interface ModelTestResult {
  provider: string
  providerName: string
  model: string
  modelName: string
  ts: string
  results: CapabilityResult[]
  discover?: boolean
}

export interface TestRecommendation {
  provider: string
  providerName: string
  model: string
  modelName: string
  action: 'enable' | 'disable'
  capability: WorkflowType
  reason: string
}

// ── Test fixtures ──────────────────────────────────────────────────────────────

// 1×1 transparent PNG for vision tests
const PIXEL_PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

// Minimal silent WAV — 100ms @ 8kHz mono 8-bit (44-byte header + 800 bytes silence)
function makeSilentWav(): Uint8Array {
  const dataLen = 800
  const buf = new Uint8Array(44 + dataLen)
  const w32 = (off: number, v: number) => { buf[off]=v&0xff; buf[off+1]=(v>>8)&0xff; buf[off+2]=(v>>16)&0xff; buf[off+3]=(v>>24)&0xff }
  const w16 = (off: number, v: number) => { buf[off]=v&0xff; buf[off+1]=(v>>8)&0xff }
  // RIFF header
  ;[0x52,0x49,0x46,0x46].forEach((b,i) => { buf[i]=b })         // "RIFF"
  w32(4, 36 + dataLen)                                            // file size - 8
  ;[0x57,0x41,0x56,0x45].forEach((b,i) => { buf[8+i]=b })       // "WAVE"
  // fmt chunk
  ;[0x66,0x6D,0x74,0x20].forEach((b,i) => { buf[12+i]=b })      // "fmt "
  w32(16, 16); w16(20, 1); w16(22, 1)                            // chunk=16, PCM, mono
  w32(24, 8000); w32(28, 8000); w16(32, 1); w16(34, 8)           // 8kHz, byte rate, align, bits
  // data chunk
  ;[0x64,0x61,0x74,0x61].forEach((b,i) => { buf[36+i]=b })      // "data"
  w32(40, dataLen)
  buf.fill(128, 44)  // 128 = silence for 8-bit unsigned PCM
  return buf
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function gradeLatency(ms: number, fast: number, slow: number): 'A' | 'B' | 'C' | 'F' {
  if (ms < fast)       return 'A'
  if (ms < slow)       return 'B'
  if (ms < slow * 2)   return 'C'
  return 'F'
}

function getBaseUrl(provider: string): string | null {
  return getAllProviders()[provider]?.baseUrl ?? null
}

// ── Individual capability testers ──────────────────────────────────────────────

async function testChat(provider: string, model: string, apiKey: string | undefined): Promise<CapabilityResult> {
  const p = getAllProviders()[provider]
  if (!p) return { capability: 'chat', passed: false, latencyMs: 0, grade: 'F', note: 'Provider not found' }
  const t0 = Date.now()
  try {
    const res = await callProvider({ ...p, model }, 'Reply with exactly the word "pong" and nothing else.', apiKey)
    const latencyMs = res.latencyMs ?? (Date.now() - t0)
    if (res.error) return { capability: 'chat', passed: false, latencyMs, grade: 'F', note: res.error }
    return { capability: 'chat', passed: true, latencyMs, grade: gradeLatency(latencyMs, 2000, 8000) }
  } catch (e) {
    return { capability: 'chat', passed: false, latencyMs: Date.now() - t0, grade: 'F', note: e instanceof Error ? e.message : String(e) }
  }
}

async function testImage(provider: string, model: string, apiKey: string | undefined): Promise<CapabilityResult> {
  const t0 = Date.now()
  try {
    await callImageProvider('a tiny red circle on white background', provider, model, apiKey)
    const latencyMs = Date.now() - t0
    return { capability: 'image', passed: true, latencyMs, grade: gradeLatency(latencyMs, 5000, 15000) }
  } catch (e) {
    return { capability: 'image', passed: false, latencyMs: Date.now() - t0, grade: 'F', note: e instanceof Error ? e.message : String(e) }
  }
}

async function testVision(provider: string, model: string, apiKey: string | undefined): Promise<CapabilityResult> {
  const p = getAllProviders()[provider]
  if (!p) return { capability: 'vision', passed: false, latencyMs: 0, grade: 'F', note: 'Provider not found' }
  const t0 = Date.now()
  try {
    const res = await callProvider(
      { ...p, model },
      'What is shown in this image? Reply in three words or fewer.',
      apiKey,
      PIXEL_PNG_B64,
      'image/png',
    )
    const latencyMs = res.latencyMs ?? (Date.now() - t0)
    if (res.error) return { capability: 'vision', passed: false, latencyMs, grade: 'F', note: res.error }
    return { capability: 'vision', passed: true, latencyMs, grade: gradeLatency(latencyMs, 3000, 10000) }
  } catch (e) {
    return { capability: 'vision', passed: false, latencyMs: Date.now() - t0, grade: 'F', note: e instanceof Error ? e.message : String(e) }
  }
}

/** Audio test: tries TTS first, then STT with a tiny silent WAV. */
async function testAudio(provider: string, model: string, apiKey: string | undefined): Promise<CapabilityResult> {
  const baseUrl = getBaseUrl(provider)
  if (!baseUrl) return { capability: 'audio', passed: false, latencyMs: 0, grade: 'F', note: 'No base URL' }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

  // ── TTS probe ──────────────────────────────────────────────────────────────
  const ttsT0 = Date.now()
  try {
    const ttsRes = await fetch(`${baseUrl}/audio/speech`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, input: 'test', voice: 'alloy' }),
      signal: AbortSignal.timeout(20_000),
    })
    if (ttsRes.ok) {
      const latencyMs = Date.now() - ttsT0
      return { capability: 'audio', passed: true, latencyMs, grade: gradeLatency(latencyMs, 3000, 10000), note: 'TTS OK' }
    }
    // Explicit 404/501 → endpoint not supported
    if (ttsRes.status === 404 || ttsRes.status === 501) {
      // Fall through to STT probe
    }
  } catch { /* network error — fall through */ }

  // ── STT probe ──────────────────────────────────────────────────────────────
  const sttT0 = Date.now()
  try {
    const wav = makeSilentWav()
    const form = new FormData()
    form.append('file', new Blob([wav], { type: 'audio/wav' }), 'test.wav')
    form.append('model', model)
    const sttHeaders: Record<string, string> = {}
    if (apiKey) sttHeaders['Authorization'] = `Bearer ${apiKey}`
    const sttRes = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST',
      headers: sttHeaders,
      body: form,
      signal: AbortSignal.timeout(20_000),
    })
    if (sttRes.ok) {
      const latencyMs = Date.now() - sttT0
      return { capability: 'audio', passed: true, latencyMs, grade: gradeLatency(latencyMs, 3000, 10000), note: 'STT OK' }
    }
    const body = await sttRes.text().catch(() => '')
    return { capability: 'audio', passed: false, latencyMs: Date.now() - sttT0, grade: 'F', note: `STT ${sttRes.status}: ${body.slice(0, 80)}` }
  } catch (e) {
    return { capability: 'audio', passed: false, latencyMs: Date.now() - sttT0, grade: 'F', note: e instanceof Error ? e.message : String(e) }
  }
}

// video and agent are not auto-testable
function skipResult(cap: WorkflowType, reason: string): CapabilityResult {
  return { capability: cap, passed: false, latencyMs: 0, grade: 'F', note: reason, skipped: true }
}

// ── Tester registry ────────────────────────────────────────────────────────────

type Tester = (pk: string, mid: string, key: string | undefined) => Promise<CapabilityResult>

const TESTERS: Partial<Record<WorkflowType, Tester>> = {
  chat:   testChat,
  image:  testImage,
  vision: testVision,
  audio:  testAudio,
}

// Capabilities that can be probed in discover mode (order matters for display)
const DISCOVERABLE: WorkflowType[] = ['chat', 'vision', 'image', 'audio']
const SKIPPABLE: WorkflowType[]    = ['video', 'agent']

// ── Public API ─────────────────────────────────────────────────────────────────

/** Test only the capabilities declared for this model. */
export async function testModel(
  provider: string,
  modelId: string,
  apiKey: string | undefined,
  onCapability?: (result: CapabilityResult) => void,
): Promise<ModelTestResult> {
  const allProviders = getAllProviders()
  const p = allProviders[provider]
  const m = p?.models.find(x => x.id === modelId)
  const capabilities = (m?.capabilities ?? ['chat']) as WorkflowType[]

  const results: CapabilityResult[] = []
  for (const cap of capabilities) {
    const tester = TESTERS[cap]
    if (!tester) continue
    const r = await tester(provider, modelId, apiKey)
    results.push(r)
    onCapability?.(r)
  }

  return {
    provider, providerName: p?.name ?? provider,
    model: modelId, modelName: m?.name ?? modelId,
    ts: new Date().toISOString(), results,
  }
}

/** Test ALL capabilities regardless of what the model declares. */
export async function discoverModel(
  provider: string,
  modelId: string,
  apiKey: string | undefined,
  onCapability?: (result: CapabilityResult) => void,
): Promise<ModelTestResult> {
  const allProviders = getAllProviders()
  const p = allProviders[provider]
  const m = p?.models.find(x => x.id === modelId)

  const results: CapabilityResult[] = []

  for (const cap of DISCOVERABLE) {
    const tester = TESTERS[cap]!
    const r = await tester(provider, modelId, apiKey)
    results.push(r)
    onCapability?.(r)
  }

  for (const cap of SKIPPABLE) {
    const r = skipResult(cap, cap === 'video' ? 'Video gen is async/costly — test manually' : 'Agent capability is environment-specific — test manually')
    results.push(r)
    onCapability?.(r)
  }

  return {
    provider, providerName: p?.name ?? provider,
    model: modelId, modelName: m?.name ?? modelId,
    ts: new Date().toISOString(), results, discover: true,
  }
}

/** Build recommendations from a set of test results (works for both test and discover). */
export function buildRecommendations(results: ModelTestResult[]): TestRecommendation[] {
  const recs: TestRecommendation[] = []
  for (const r of results) {
    const allProviders = getAllProviders()
    const m = allProviders[r.provider]?.models.find(x => x.id === r.model)
    const declared = new Set<WorkflowType>((m?.capabilities ?? ['chat']) as WorkflowType[])

    for (const cr of r.results) {
      if (cr.skipped) continue
      if (cr.passed && !declared.has(cr.capability)) {
        recs.push({
          provider: r.provider, providerName: r.providerName,
          model: r.model, modelName: r.modelName,
          action: 'enable', capability: cr.capability,
          reason: `Test passed (${(cr.latencyMs / 1000).toFixed(1)}s, grade ${cr.grade})${cr.note ? ` — ${cr.note}` : ''} — not yet enabled`,
        })
      }
      if (!cr.passed && declared.has(cr.capability)) {
        recs.push({
          provider: r.provider, providerName: r.providerName,
          model: r.model, modelName: r.modelName,
          action: 'disable', capability: cr.capability,
          reason: cr.note ? `Test failed: ${cr.note}` : 'Test failed — consider disabling this capability',
        })
      }
    }
  }
  return recs
}
