import vtxLogo from '../../assets/vtx-logo.png'

const DONATE_LINKS = [
  {
    name: 'PayPal',
    handle: 'Donate!',
    url: 'https://www.paypal.com/donate/?business=L8TLNTRBQSF3Q&no_recurring=0&item_name=Thank+you+for+contributing+to+the+ManyAI+project.++Those+Claude+tokens+are+not+cheap%21&currency_code=USD',
  },
  {
    name: 'Cash App',
    handle: '$StevePleasants9',
    url: 'https://cash.app/$StevePleasants9',
  },
  {
    name: 'Venmo',
    handle: '@StevePleasants9',
    url: 'https://venmo.com/StevePleasants9',
  },
]

export default function AboutScreen() {
  const open = (url: string) => window.open(url, '_blank')

  return (
    <div style={{ padding: '24px 28px', maxWidth: 600 }}>

      {/* Logo + company name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 24 }}>
        <img
          src={vtxLogo}
          alt="VTX Consulting Group LLC"
          style={{
            width: 72, height: 72, borderRadius: 8,
            border: '2px solid var(--accent)', objectFit: 'contain', flexShrink: 0,
            background: 'var(--bg2)',
          }}
        />
        <div>
          <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)' }}>VTX Consulting Group LLC</div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 3 }}>Designer &amp; product owner</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 1 }}>All code by Claude (Anthropic), under the direction of VTX Consulting Group LLC</div>
        </div>
      </div>

      {/* Description */}
      <p style={{ fontSize: 13, lineHeight: 1.75, color: 'var(--text)', margin: '0 0 12px' }}>
        <strong>ManyAI Desktop</strong> is a multi-AI chat client for Windows, Mac, and Linux. It lets you
        query multiple AI providers side-by-side in parallel tabs, automatically routing to the best available
        model for each task — text, image, code, and more.
      </p>
      <p style={{ fontSize: 13, lineHeight: 1.75, color: 'var(--text)', margin: '0 0 12px' }}>
        If one provider is slow, rate-limited, or fails, the others keep working independently. You can run
        the same prompt across every provider at once and compare answers in real time.
      </p>
      <p style={{ fontSize: 13, lineHeight: 1.75, color: 'var(--text)', margin: '0 0 24px' }}>
        All API keys are stored locally on this device only. Nothing is ever sent to a ManyAI server.{' '}
        ManyAI Desktop is <strong>shareware</strong> — free to use, supported by optional donations.
      </p>

      {/* Donate section */}
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-dim)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        💛 Donate — use free, tip if it's worth it
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {DONATE_LINKS.map(({ name, handle, url }) => (
          <button
            key={name}
            className="btn-ghost"
            onClick={() => open(url)}
            style={{ textAlign: 'left', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
              <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 2 }}>{handle}</div>
            </div>
            <span style={{ color: 'var(--text-dim)', fontSize: 16 }}>›</span>
          </button>
        ))}
      </div>

      {/* GitHub */}
      <button
        className="btn-ghost"
        onClick={() => open('https://github.com/SoylentAquamarine')}
        style={{ width: '100%', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}
      >
        <span style={{ fontWeight: 600, fontSize: 13 }}>GitHub: SoylentAquamarine</span>
        <span style={{ color: 'var(--text-dim)', fontSize: 16 }}>›</span>
      </button>

      {/* Copyright */}
      <div style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>
        © 2026 VTX Consulting Group LLC. All rights reserved.
      </div>
    </div>
  )
}
