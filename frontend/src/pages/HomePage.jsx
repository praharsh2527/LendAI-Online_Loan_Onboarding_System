import React, { useState } from 'react'
import axios from 'axios'

const BACKEND = import.meta.env.VITE_BACKEND_URL

const fonts = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
`

const animations = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(16px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0; }
  }
`

export default function HomePage() {
  const [loading, setLoading] = useState(false)
  const [generatedLink, setGeneratedLink] = useState('')
  const [token, setToken] = useState('')
  const [copied, setCopied] = useState(false)

  async function createSession() {
    setLoading(true)
    setGeneratedLink('')
    try {
      const res = await axios.post(`${BACKEND}/api/create-session`)
      const tok = res.data.token
      const link = `${window.location.origin}/call/${tok}`
      setToken(tok)
      setGeneratedLink(link)
    } catch (err) {
      alert('Error creating session. Is the backend running?')
    }
    setLoading(false)
  }

  function copyLink() {
    navigator.clipboard.writeText(generatedLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div style={page}>
      <style>{fonts + animations}</style>

      {/* Background */}
      <div style={bgLeft} />
      <div style={bgRight} />

      <div style={wrapper}>

        {/* Header */}
        <div style={header}>
          <div style={brandRow}>
            <div style={brandMark} />
            <span style={brandName}>LendAI</span>
          </div>
          
        </div>

        {/* Main content */}
        <div style={main}>

          {/* Left — hero text */}
          <div style={heroCol}>
            <p style={eyebrow}>Loan Origination System</p>
            <h1 style={heroTitle}>
              Initiate a<br />
              <span style={heroItalic}>video assessment</span>
            </h1>
            <p style={heroBody}>
              Generate a secure, single-use session link for your applicant.
              The AI will conduct the interview, extract financials, and deliver
              a real-time credit decision.
            </p>

            <div style={statsRow}>
              <Stat value="3 min" label="Avg. call duration" />
              <div style={statDivider} />
              <Stat value="Zero" label="Manual data entry" />
            </div>
          </div>

          {/* Right — action card */}
          <div style={actionCard}>

            <div style={cardTop}>
              <p style={cardLabel}>New Session</p>
              <div style={{ ...statusPill, background: loading ? '#fef3c7' : generatedLink ? '#dcfce7' : '#f1f5f9' }}>
                <div style={{
                  ...pillDot,
                  background: loading ? '#d97706' : generatedLink ? '#16a34a' : '#cbd5e1',
                  animation: loading ? 'blink 1s infinite' : 'none'
                }} />
                <span style={{
                  ...pillText,
                  color: loading ? '#92400e' : generatedLink ? '#166534' : '#94a3b8'
                }}>
                  {loading ? 'Generating' : generatedLink ? 'Ready' : 'Idle'}
                </span>
              </div>
            </div>

            <button
              onClick={createSession}
              disabled={loading}
              style={{ ...generateBtn, opacity: loading ? 0.7 : 1, cursor: loading ? 'not-allowed' : 'pointer' }}
            >
              {loading ? (
                <span style={loadingInner}>
                  <div style={spinner} />
                  Generating session...
                </span>
              ) : 'Generate Session Link'}
            </button>

            {generatedLink && (
              <div style={linkSection}>

                <div style={linkBox}>
                  <p style={linkBoxLabel}>Session link</p>
                  <p style={linkText}>{generatedLink}</p>
                  <div style={tokenRow}>
                    <span style={tokenLabel}>ID</span>
                    <span style={tokenValue}>{token.slice(0, 8).toUpperCase()}</span>
                  </div>
                </div>

                <div style={actionRow}>
                  <button onClick={copyLink} style={copyBtn}>
                    {copied ? 'Copied' : 'Copy Link'}
                  </button>
                  <a href={generatedLink} style={openBtn}>
                    Open Call
                  </a>
                </div>

                <p style={disclaimer}>
                  This link is single-use and expires after the call ends.
                  Share it directly with the applicant via WhatsApp or email.
                </p>
              </div>
            )}

          </div>
        </div>

        {/* Footer */}
        <div style={footer}>
          <p style={footerText}>LendAI · Agentic Loan Origination</p>
          <p style={footerText}>All sessions are encrypted and compliant with RBI KYC guidelines</p>
        </div>

      </div>
    </div>
  )
}

function Stat({ value, label }) {
  return (
    <div style={statItem}>
      <span style={statValue}>{value}</span>
      <span style={statLabel}>{label}</span>
    </div>
  )
}

/* ─── STYLES ─── */

const page = {
  minHeight: '100vh',
  background: '#f8f7f4',
  fontFamily: "'DM Sans', sans-serif",
  position: 'relative',
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column'
}

const bgLeft = {
  position: 'fixed',
  top: '-200px', left: '-200px',
  width: '600px', height: '600px',
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(15,23,42,0.04) 0%, transparent 70%)',
  pointerEvents: 'none'
}

const bgRight = {
  position: 'fixed',
  bottom: '-200px', right: '-200px',
  width: '600px', height: '600px',
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(15,23,42,0.04) 0%, transparent 70%)',
  pointerEvents: 'none'
}

const wrapper = {
  maxWidth: '1100px',
  margin: '0 auto',
  padding: '0 32px',
  width: '100%',
  flex: 1,
  display: 'flex',
  flexDirection: 'column'
}

const header = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '32px 0',
  borderBottom: '1px solid #e2e8f0'
}

const brandRow = {
  display: 'flex', alignItems: 'center', gap: '10px'
}

const brandMark = {
  width: '28px', height: '28px',
  background: '#0f172a',
  borderRadius: '6px'
}

const brandName = {
  fontFamily: "'DM Serif Display', serif",
  fontSize: '18px', color: '#0f172a',
  letterSpacing: '-0.02em'
}

const headerBadge = {
  fontSize: '11px', fontWeight: '500',
  color: '#94a3b8', letterSpacing: '0.1em',
  textTransform: 'uppercase',
  border: '1px solid #e2e8f0',
  padding: '6px 12px', borderRadius: '20px'
}

const main = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  gap: '80px',
  padding: '80px 0'
}

const heroCol = {
  flex: 1,
  animation: 'fadeUp 0.6s ease both'
}

const eyebrow = {
  fontSize: '11px', fontWeight: '600',
  color: '#94a3b8', letterSpacing: '0.12em',
  textTransform: 'uppercase',
  margin: '0 0 20px'
}

const heroTitle = {
  fontFamily: "'DM Serif Display', serif",
  fontSize: '52px', color: '#0f172a',
  letterSpacing: '-0.02em', lineHeight: 1.1,
  margin: '0 0 24px'
}

const heroItalic = {
  fontStyle: 'italic', color: '#334155'
}

const heroBody = {
  fontSize: '15px', color: '#64748b',
  lineHeight: '1.7', margin: '0 0 40px',
  maxWidth: '420px'
}

const statsRow = {
  display: 'flex', alignItems: 'center', gap: '24px'
}

const statItem = {
  display: 'flex', flexDirection: 'column', gap: '4px'
}

const statValue = {
  fontFamily: "'DM Mono', monospace",
  fontSize: '20px', color: '#0f172a', fontWeight: '500'
}

const statLabel = {
  fontSize: '11px', color: '#94a3b8',
  textTransform: 'uppercase', letterSpacing: '0.06em'
}

const statDivider = {
  width: '1px', height: '36px', background: '#e2e8f0'
}

const actionCard = {
  width: '400px',
  minWidth: '400px',
  background: 'white',
  borderRadius: '16px',
  border: '1px solid #e2e8f0',
  padding: '32px',
  boxShadow: '0 4px 32px rgba(15,23,42,0.06)',
  animation: 'fadeUp 0.6s ease 0.1s both'
}

const cardTop = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '24px'
}

const cardLabel = {
  fontFamily: "'DM Serif Display', serif",
  fontSize: '20px', color: '#0f172a', margin: 0
}

const statusPill = {
  display: 'flex', alignItems: 'center', gap: '6px',
  padding: '5px 12px', borderRadius: '20px'
}

const pillDot = {
  width: '6px', height: '6px', borderRadius: '50%'
}

const pillText = {
  fontSize: '11px', fontWeight: '500',
  letterSpacing: '0.06em', textTransform: 'uppercase'
}

const generateBtn = {
  width: '100%',
  padding: '14px',
  background: '#0f172a',
  color: 'white',
  border: 'none',
  borderRadius: '10px',
  fontSize: '14px',
  fontWeight: '500',
  letterSpacing: '0.02em',
  transition: 'background 0.2s'
}

const loadingInner = {
  display: 'flex', alignItems: 'center',
  justifyContent: 'center', gap: '10px'
}

const spinner = {
  width: '14px', height: '14px',
  border: '2px solid rgba(255,255,255,0.3)',
  borderTop: '2px solid white',
  borderRadius: '50%',
  animation: 'spin 0.8s linear infinite'
}

const linkSection = {
  marginTop: '20px',
  animation: 'fadeUp 0.4s ease both'
}

const linkBox = {
  background: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '10px',
  padding: '16px 18px',
  marginBottom: '12px'
}

const linkBoxLabel = {
  fontSize: '10px', color: '#94a3b8',
  textTransform: 'uppercase', letterSpacing: '0.1em',
  margin: '0 0 8px'
}

const linkText = {
  fontFamily: "'DM Mono', monospace",
  fontSize: '11px', color: '#334155',
  wordBreak: 'break-all', margin: '0 0 12px',
  lineHeight: '1.6'
}

const tokenRow = {
  display: 'flex', alignItems: 'center', gap: '8px'
}

const tokenLabel = {
  fontSize: '9px', fontWeight: '600',
  color: '#94a3b8', letterSpacing: '0.12em',
  textTransform: 'uppercase',
  background: '#e2e8f0', padding: '2px 6px',
  borderRadius: '4px'
}

const tokenValue = {
  fontFamily: "'DM Mono', monospace",
  fontSize: '11px', color: '#64748b'
}

const actionRow = {
  display: 'flex', gap: '8px', marginBottom: '16px'
}

const copyBtn = {
  flex: 1, padding: '10px',
  background: 'white',
  color: '#0f172a',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  fontSize: '13px', fontWeight: '500',
  cursor: 'pointer'
}

const openBtn = {
  flex: 1, padding: '10px',
  background: '#0f172a',
  color: 'white',
  border: 'none',
  borderRadius: '8px',
  fontSize: '13px', fontWeight: '500',
  cursor: 'pointer',
  textDecoration: 'none',
  textAlign: 'center',
  display: 'flex', alignItems: 'center', justifyContent: 'center'
}

const disclaimer = {
  fontSize: '11px', color: '#94a3b8',
  lineHeight: '1.6', margin: 0,
  textAlign: 'center'
}

const footer = {
  padding: '24px 0',
  borderTop: '1px solid #e2e8f0',
  display: 'flex',
  justifyContent: 'space-between'
}

const footerText = {
  fontSize: '11px', color: '#cbd5e1', margin: 0
}