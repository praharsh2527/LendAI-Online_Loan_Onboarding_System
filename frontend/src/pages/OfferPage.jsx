import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'

const fonts = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
`
const animations = `
  @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
`

export default function OfferPage() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const stored = sessionStorage.getItem(`offer_${token}`)
    if (stored) {
      setData(JSON.parse(stored))
      setTimeout(() => setVisible(true), 100)
    }
  }, [token])

  if (!data) return (
    <div style={center}>
      <style>{fonts}</style>
      <div style={{ textAlign: 'center' }}>
        <div style={shimmerBar} />
        <p style={shimmerText}>Retrieving your assessment</p>
      </div>
    </div>
  )

  const { offer, loan_data, risk, transcript, bureau, fraud, policy } = data
  const approved = offer?.status === 'pre_approved'
  const riskColor = { LOW: '#16a34a', MEDIUM: '#d97706', HIGH: '#dc2626' }[risk?.risk_band] || '#6b7280'
  const fraudHigh = fraud?.high_risk || false
  const hasFraudFlags = fraud?.fraud_flags?.length > 0
  const hasViolations = policy?.violations?.length > 0

  return (
    <div style={{ ...page, opacity: visible ? 1 : 0, transition: 'opacity 0.6s ease' }}>
      <style>{fonts + animations}</style>
      <div style={bgTexture} />

      <div style={layout}>

        {/* ── LEFT PANEL ── */}
        <div style={leftPanel}>
          <div style={brand}>
            <div style={brandMark} />
            <span style={brandName}>LendAI</span>
          </div>

          {/* Status */}
          <div style={{ ...statusBlock, animationDelay: '0.1s' }}>
            <div style={{ ...statusDot, background: approved ? '#16a34a' : '#dc2626' }} />
            <span style={statusLabel}>{approved ? 'Pre-Approved' : 'Not Approved'}</span>
          </div>

          {/* Loan amount */}
          {approved && (
            <div style={{ animation: 'fadeUp 0.5s ease both', animationDelay: '0.2s' }}>
              <p style={amountLabel}>Approved Amount</p>
              <p style={amountValue}>₹{offer.eligible_amount?.toLocaleString('en-IN')}</p>
            </div>
          )}

          {/* Loan metrics */}
          {approved && (
            <div style={{ ...metricsCol, animation: 'fadeUp 0.5s ease both', animationDelay: '0.25s' }}>
              <MetricItem label="Interest Rate" value={`${offer.interest_rate}%`} sub="per annum" />
              <div style={metricDivider} />
              <MetricItem label="Tenure" value={`${offer.tenure_months}`} sub="months" />
              <div style={metricDivider} />
              <MetricItem label="Monthly EMI" value={`₹${offer.monthly_emi?.toLocaleString('en-IN')}`} sub="estimated" />
            </div>
          )}

          {/* Bureau box */}
          {bureau && (
            <div style={{ ...bureauBox, animation: 'fadeUp 0.5s ease both', animationDelay: '0.3s' }}>
              <p style={bureauTitle}>Credit Bureau</p>
              <p style={bureauScore}>{bureau.credit_score}</p>
              <p style={bureauScoreLabel}>CIBIL Score</p>
              <div style={bureauGrid}>
                <BureauStat label="Existing Loans" value={bureau.existing_loans} />
                <BureauStat label="Payment History" value={`${Math.round((bureau.payment_history_pct || 0) * 100)}%`} />
                <BureauStat label="Credit Age" value={`${bureau.credit_age_months}mo`} />
                <BureauStat label="Default" value={bureau.previous_default ? 'Yes' : 'None'} alert={bureau.previous_default} />
              </div>
            </div>
          )}

          {/* Risk */}
          <div style={{ ...riskBadge, borderColor: riskColor, animation: 'fadeUp 0.5s ease both', animationDelay: '0.35s' }}>
            <span style={{ ...riskBandLabel, color: riskColor }}>{risk?.risk_band} RISK</span>
            <div style={riskBarTrack}>
              <div style={{ ...riskBarFill, width: `${risk?.risk_score || 0}%`, background: riskColor }} />
            </div>
            <span style={riskScoreText}>{risk?.risk_score}/100</span>
          </div>

          {/* Fraud score */}
          {fraud && (
            <div style={{ ...fraudBox, borderColor: fraudHigh ? '#fca5a5' : '#e2e8f0', animation: 'fadeUp 0.5s ease both', animationDelay: '0.4s' }}>
              <span style={{ ...fraudLabel, color: fraudHigh ? '#dc2626' : '#94a3b8' }}>
                Fraud Score · {fraud.fraud_score}/100
              </span>
              <div style={riskBarTrack}>
                <div style={{ ...riskBarFill, width: `${fraud.fraud_score}%`, background: fraudHigh ? '#dc2626' : '#94a3b8' }} />
              </div>
              <span style={riskScoreText}>{fraud.flag_count} flag{fraud.flag_count !== 1 ? 's' : ''} detected</span>
            </div>
          )}

          <p style={sessionId}>Session · {token?.slice(0, 8).toUpperCase()}</p>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={rightPanel}>

          {/* Rejection */}
          {!approved && (
            <Section title="Decision" delay="0.1s">
              <div style={rejectionCard}>
                <p style={rejectionTitle}>Application Declined</p>
                <p style={rejectionReason}>{offer?.reason || 'Does not meet current eligibility criteria.'}</p>
                {offer?.all_violations?.map((v, i) => (
                  <div key={i} style={flagRow}><div style={flagDot} /><span style={flagText}>{v}</span></div>
                ))}
              </div>
            </Section>
          )}

          {/* Fraud flags */}
          {hasFraudFlags && (
            <Section title="Fraud & Compliance Flags" delay="0.12s">
              <div style={{ ...fraudFlagsBox, borderColor: fraudHigh ? '#fecaca' : '#e2e8f0', background: fraudHigh ? '#fff8f8' : '#fafafa' }}>
                {fraud.fraud_flags.map((flag, i) => (
                  <div key={i} style={flagRow}>
                    <div style={{ ...flagDot, background: fraudHigh ? '#dc2626' : '#94a3b8' }} />
                    <span style={{ ...flagText, color: fraudHigh ? '#991b1b' : '#475569' }}>{flag}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Policy violations */}
          {hasViolations && (
            <Section title="Policy Violations" delay="0.14s">
              <div style={{ ...fraudFlagsBox, borderColor: '#fed7aa', background: '#fff7ed' }}>
                {policy.violations.map((v, i) => (
                  <div key={i} style={flagRow}>
                    <div style={{ ...flagDot, background: '#d97706' }} />
                    <span style={{ ...flagText, color: '#92400e' }}>{v}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Loan ratios — only if approved */}
          {approved && (
            <Section title="Affordability Analysis" delay="0.16s">
              <div style={ratiosGrid}>
                <RatioCard
                  label="EMI to Income"
                  value={`${((offer.emi_to_income_ratio || 0) * 100).toFixed(1)}%`}
                  sub="of monthly income"
                  safe={(offer.emi_to_income_ratio || 0) <= 0.4}
                />
                <RatioCard
                  label="Loan to Income"
                  value={`${offer.loan_to_income_ratio || 0}x`}
                  sub="income multiplier"
                  safe={(offer.loan_to_income_ratio || 0) <= 5}
                />
                <RatioCard
                  label="Credit Score"
                  value={offer.credit_score || bureau?.credit_score || '—'}
                  sub="CIBIL score"
                  safe={(offer.credit_score || bureau?.credit_score || 0) >= 700}
                />
                <RatioCard
                  label="Fraud Score"
                  value={`${offer.fraud_score || fraud?.fraud_score || 0}/100`}
                  sub="risk index"
                  safe={(offer.fraud_score || fraud?.fraud_score || 0) < 40}
                />
              </div>
            </Section>
          )}

          {/* Applicant profile */}
          <Section title="Applicant Profile" delay="0.2s">
            <div style={detailsGrid}>
              <DetailCard label="Full Name" value={loan_data?.full_name || '—'} />
              <DetailCard label="Employment" value={capitalize(loan_data?.employment_type) || '—'} />
              <DetailCard label="Monthly Income" value={loan_data?.monthly_income ? `₹${loan_data.monthly_income.toLocaleString('en-IN')}` : '—'} />
              <DetailCard label="Loan Purpose" value={capitalize(loan_data?.loan_purpose) || '—'} />
              <DetailCard label="Verbal Consent" value={loan_data?.verbal_consent_given ? 'Confirmed' : 'Not Confirmed'} highlight={loan_data?.verbal_consent_given} />
              {loan_data?.loan_amount_requested && (
                <DetailCard label="Amount Requested" value={`₹${loan_data.loan_amount_requested.toLocaleString('en-IN')}`} />
              )}
            </div>
          </Section>

          {/* Risk reasons */}
          {risk?.reasons?.length > 0 && (
            <Section title="Risk Factors" delay="0.25s">
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {risk.reasons.map((r, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                    <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '11px', color: '#cbd5e1', paddingTop: '2px', minWidth: '24px' }}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span style={{ fontSize: '14px', color: '#334155', lineHeight: '1.6' }}>{r}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Transcript */}
          {transcript && (
            <Section title="Call Transcript" delay="0.3s">
              <div style={transcriptBox}>
                <p style={transcriptText}>{transcript}</p>
              </div>
            </Section>
          )}

          <div style={footer}>
            <p style={footerText}>Preliminary assessment only. Final approval subject to document verification and credit bureau check.</p>
            <p style={footerText}>Generated {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Sub-components ── */
function Section({ title, children, delay = '0s' }) {
  return (
    <div style={{ paddingBottom: '32px', marginBottom: '32px', borderBottom: '1px solid #f1f5f9', animation: 'fadeUp 0.5s ease both', animationDelay: delay }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
        <span style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{title}</span>
        <div style={{ flex: 1, height: '1px', background: '#f1f5f9' }} />
      </div>
      {children}
    </div>
  )
}

function MetricItem({ label, value, sub }) {
  return (
    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <span style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</span>
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '20px', color: '#0f172a', fontWeight: '500' }}>{value}</span>
      <span style={{ fontSize: '10px', color: '#cbd5e1' }}>{sub}</span>
    </div>
  )
}

function BureauStat({ label, value, alert }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <span style={{ fontSize: '9px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '13px', color: alert ? '#dc2626' : '#0f172a', fontWeight: '500' }}>{value}</span>
    </div>
  )
}

function RatioCard({ label, value, sub, safe }) {
  return (
    <div style={{ background: 'white', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ fontFamily: "'DM Mono', monospace", fontSize: '20px', fontWeight: '500', color: safe ? '#16a34a' : '#d97706' }}>{value}</span>
      <span style={{ fontSize: '10px', color: '#cbd5e1' }}>{sub}</span>
    </div>
  )
}

function DetailCard({ label, value, highlight }) {
  return (
    <div style={{ background: 'white', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <span style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</span>
      <span style={{ fontSize: '14px', fontWeight: '500', color: highlight ? '#16a34a' : '#0f172a' }}>{value}</span>
    </div>
  )
}

function capitalize(str) {
  if (!str) return str
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ')
}

/* ── STYLES ── */
const center = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f7f4', fontFamily: "'DM Sans', sans-serif" }
const shimmerBar = { width: '120px', height: '2px', background: 'linear-gradient(90deg, #e2e8f0 25%, #1e293b 50%, #e2e8f0 75%)', backgroundSize: '200% 100%', animation: 'shimmer 1.5s infinite', margin: '0 auto 16px', borderRadius: '2px' }
const shimmerText = { fontFamily: "'DM Sans', sans-serif", fontSize: '13px', color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase' }
const page = { minHeight: '100vh', background: '#f8f7f4', fontFamily: "'DM Sans', sans-serif", position: 'relative', overflow: 'hidden' }
const bgTexture = { position: 'fixed', inset: 0, backgroundImage: 'radial-gradient(circle at 20% 20%, rgba(15,23,42,0.03) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(15,23,42,0.03) 0%, transparent 50%)', pointerEvents: 'none' }
const layout = { display: 'flex', minHeight: '100vh', maxWidth: '1100px', margin: '0 auto', padding: '0 24px' }

const leftPanel = { width: '300px', minWidth: '300px', padding: '48px 40px 48px 0', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '24px', position: 'sticky', top: 0, height: '100vh', overflowY: 'auto' }
const brand = { display: 'flex', alignItems: 'center', gap: '10px' }
const brandMark = { width: '28px', height: '28px', background: '#0f172a', borderRadius: '6px' }
const brandName = { fontFamily: "'DM Serif Display', serif", fontSize: '18px', color: '#0f172a', letterSpacing: '-0.02em' }
const statusBlock = { display: 'flex', alignItems: 'center', gap: '10px', animation: 'fadeUp 0.5s ease both' }
const statusDot = { width: '8px', height: '8px', borderRadius: '50%' }
const statusLabel = { fontSize: '13px', fontWeight: '600', color: '#0f172a', letterSpacing: '0.04em', textTransform: 'uppercase' }
const amountLabel = { fontSize: '11px', color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 6px' }
const amountValue = { fontFamily: "'DM Serif Display', serif", fontSize: '34px', color: '#0f172a', letterSpacing: '-0.02em', margin: 0, lineHeight: 1.1 }
const metricsCol = { display: 'flex', flexDirection: 'column', gap: '0', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }
const metricDivider = { height: '1px', background: '#e2e8f0' }

const bureauBox = { border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px 20px' }
const bureauTitle = { fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }
const bureauScore = { fontFamily: "'DM Mono', monospace", fontSize: '28px', fontWeight: '500', color: '#0f172a', margin: '0 0 2px' }
const bureauScoreLabel = { fontSize: '10px', color: '#cbd5e1', margin: '0 0 12px' }
const bureauGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }

const riskBadge = { border: '1px solid', borderRadius: '10px', padding: '14px 18px' }
const riskBandLabel = { fontSize: '10px', fontWeight: '600', letterSpacing: '0.12em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }
const riskBarTrack = { height: '3px', background: '#e2e8f0', borderRadius: '2px', marginBottom: '6px' }
const riskBarFill = { height: '100%', borderRadius: '2px', transition: 'width 1s ease' }
const riskScoreText = { fontFamily: "'DM Mono', monospace", fontSize: '10px', color: '#94a3b8' }

const fraudBox = { border: '1px solid', borderRadius: '10px', padding: '14px 18px' }
const fraudLabel = { fontSize: '10px', fontWeight: '600', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: '8px' }

const sessionId = { fontSize: '10px', color: '#cbd5e1', fontFamily: "'DM Mono', monospace", letterSpacing: '0.05em', marginTop: 'auto' }

const rightPanel = { flex: 1, padding: '48px 0 48px 48px', display: 'flex', flexDirection: 'column' }

const rejectionCard = { background: '#fff8f8', border: '1px solid #fee2e2', borderRadius: '10px', padding: '24px' }
const rejectionTitle = { fontFamily: "'DM Serif Display', serif", fontSize: '18px', color: '#991b1b', margin: '0 0 8px' }
const rejectionReason = { fontSize: '14px', color: '#7f1d1d', margin: '0 0 12px', lineHeight: '1.6' }

const fraudFlagsBox = { border: '1px solid', borderRadius: '10px', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '10px' }
const flagRow = { display: 'flex', alignItems: 'flex-start', gap: '10px' }
const flagDot = { width: '5px', height: '5px', borderRadius: '50%', background: '#dc2626', marginTop: '6px', flexShrink: 0 }
const flagText = { fontSize: '13px', lineHeight: '1.5' }

const ratiosGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: '#e2e8f0', borderRadius: '10px', overflow: 'hidden' }
const detailsGrid = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px', background: '#e2e8f0', borderRadius: '10px', overflow: 'hidden' }

const transcriptBox = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '20px 24px' }
const transcriptText = { fontFamily: "'DM Mono', monospace", fontSize: '12px', color: '#475569', lineHeight: '1.8', margin: 0 }

const footer = { marginTop: '8px', paddingTop: '24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }
const footerText = { fontSize: '11px', color: '#cbd5e1', margin: 0, lineHeight: '1.5' }