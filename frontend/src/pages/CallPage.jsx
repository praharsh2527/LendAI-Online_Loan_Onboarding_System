import React, { useRef, useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'

const BACKEND = import.meta.env.VITE_BACKEND_URL

const fonts = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap');
`
const animations = `
  @keyframes fadeUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
`

export default function CallPage() {
  const { token } = useParams()
  const navigate = useNavigate()

  const [step, setStep] = useState(0)
  const [seconds, setSeconds] = useState(0)
  const [faceData, setFaceData] = useState(null)
  const [error, setError] = useState('')
  const [geoData, setGeoData] = useState(null)
  const [incomeFile, setIncomeFile] = useState(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [idFile,    setIdFile]    = useState(null)
  const [idResult,  setIdResult]  = useState(null)
  const recorderRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  useEffect(() => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      .then(stream => {
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        setCameraReady(true)
      })
      .catch(() => setError('Camera permission denied. Please allow camera access and reload.'))

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => setGeoData({ lat: coords.latitude, lng: coords.longitude }),
      () => setGeoData({ lat: null, lng: null })
    )

    return () => { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()) }
  }, [])

  const captureFrame = () => {
    const video = videoRef.current
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    canvas.getContext('2d').drawImage(video, 0, 0)
    return new Promise(resolve => canvas.toBlob(blob => resolve(blob), 'image/jpeg'))
  }

async function verifyFace() {
  setStep(1)
  setError('')

  try {
    // ── capture two frames for liveness ──────────────────────────
    const frame1 = await captureFrame()
    await new Promise(r => setTimeout(r, 1500))
    const frame2 = await captureFrame()

    // ── STEP 1: liveness + age ────────────────────────────────────
    const fd1 = new FormData()
    fd1.append('frame1', frame1)
    fd1.append('frame2', frame2)

    const res1  = await fetch(`${BACKEND}/api/analyze-video`, { method: 'POST', body: fd1 })
    const data1 = await res1.json()
    console.log('Liveness result:', data1)

    if (!data1.valid_face) {
      setError('Face not detected. Ensure good lighting and face the camera directly.')
      setStep(0)
      return
    }

    if (!data1.liveness) {
      setError('Liveness check failed. Please move your head slightly and retry.')
      setStep(0)
      return
    }

    if (data1.age < 18) {
      setError(`Age detected as ${data1.age}. Applicant must be 18 or older.`)
      setStep(0)
      return
    }

    // ── STEP 2: face vs ID match ──────────────────────────────────
    // ID upload is mandatory — block if not provided
    if (!idFile) {
      setError('Please upload your ID card (PAN / Aadhaar) before proceeding.')
      setStep(0)
      return
    }

    const fd2 = new FormData()
    fd2.append('id_image', idFile)
    fd2.append('live_image', frame2)

    const res2  = await fetch(`${BACKEND}/api/verify-id`, { method: 'POST', body: fd2 })
    const data2 = await res2.json()
    console.log('ID verify result:', data2)

    // if image quality was too poor to compare — ask to retry
    if (data2.match_skipped) {
      setError('Could not read ID card clearly. Please upload a clearer photo of your ID.')
      setStep(0)
      return
    }

    // hard block — face does not match ID
    if (!data2.verified) {
      setError(
        `Face does not match ID document (${Math.round((data2.similarity || 0) * 100)}% similarity). ` +
        `Please ensure you are holding your own ID card.`
      )
      setStep(0)
      return
    }

    // ── STEP 3: ID age eligibility check ─────────────────────────
    const docAge = data2.age || 0

    if (docAge > 0 && docAge < 18) {
      setError(
        `ID shows date of birth ${data2.dob}. ` +
        `Applicant age ${docAge} is below the minimum eligible age of 18.`
      )
      setStep(0)
      return
    }

    // ── all checks passed ─────────────────────────────────────────
    setIdResult(data2)
    setFaceData({
      age:          data1.age,
      valid_face:   true,
      liveness:     true,
      face_match:   true,
      document_age: docAge,
    })

    setStep(2)

  } catch (err) {
    // no silent fallback — show the actual error
    console.error('Verification error:', err)
    setError('Verification failed due to a network or camera error. Please refresh and try again.')
    setStep(0)
  }
}
  async function startRecording() {
  try {
    // Request fresh audio-only stream — never reuse video stream
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 44100
      },
      video: false
    })

    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    chunksRef.current = []

    recorder.ondataavailable = e => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data)
        console.log('Audio chunk received:', e.data.size, 'bytes')
      }
    }

    recorder.start(500) // collect chunk every 500ms — more reliable than 100ms
    recorderRef.current = recorder
    setStep(3)
    setSeconds(0)
    timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000)
  } catch (err) {
    setError('Microphone access failed: ' + err.message)
  }
}

async function stopAndProcess() {
  clearInterval(timerRef.current)

  // Guard: must record at least 3 seconds
  if (seconds < 3) {
    setError('Please speak for at least 3 seconds before submitting.')
    return
  }

  setStep(4)

  recorderRef.current.onstop = async () => {
    try {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      console.log('Final audio blob size:', blob.size, 'bytes')

      if (blob.size < 10000) {
        setError('Audio recording too short or empty. Please try again.')
        setStep(3)
        return
      }

      const fd = new FormData()
      fd.append('audio', blob, 'call.webm')
      fd.append('token', token)
      fd.append('declared_age', String(faceData?.age || 25))
      fd.append('detected_age', String(faceData?.age || 0))
      fd.append('document_age', String(faceData?.document_age || 0))
      fd.append('liveness', faceData?.liveness ? 'true' : 'false')
      fd.append('geo_lat', geoData?.lat ? String(geoData.lat) : '')
      fd.append('geo_lng', geoData?.lng ? String(geoData.lng) : '')
      if (incomeFile) fd.append('income_proof', incomeFile)
      fd.append('document_age',  idResult?.age      || 0)
      fd.append('id_name',       idResult?.extracted_name || '')

      const res = await axios.post(`${BACKEND}/api/process-call`, fd)
      sessionStorage.setItem(`offer_${token}`, JSON.stringify({
        ...res.data,
        face: faceData,
        geo: geoData
      }))
      navigate(`/offer/${token}`)
    } catch (err) {
      console.error('Processing error:', err)
      setError('Processing failed. Please try again.')
      setStep(3)
    }
  }

  recorderRef.current.stop()
  recorderRef.current.stream.getTracks().forEach(t => t.stop())
}

  const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

  if (step === 4) return (
    <div style={processingPage}>
      <style>{fonts + animations}</style>
      <div style={processingCard}>
        <div style={brandRowSmall}><div style={brandMarkSm} /><span style={brandNameSm}>LendAI</span></div>
        <div style={spinnerRing} />
        <h2 style={processingTitle}>Analysing your application</h2>
        <p style={processingBody}>Our AI is reviewing your transcript and generating a credit decision.</p>
        <div style={processingSteps}>
          {['Transcribing audio', 'Extracting financial data', 'Computing risk score', 'Generating offer'].map((s, i) => (
            <div key={i} style={processingStep}><div style={processingStepDot} /><span style={processingStepText}>{s}</span></div>
          ))}
        </div>
      </div>
    </div>
  )

  return (
    <div style={page}>
      <style>{fonts + animations}</style>

      <div style={leftPanel}>
        <div style={leftBrand}>
          <div style={brandMark} />
          <span style={brandNameLeft}>LendAI</span>
          <div style={livePill}>
            <div style={{ ...liveDot, animation: step === 3 ? 'pulse 1.2s infinite' : 'none', background: step === 3 ? '#ef4444' : '#475569' }} />
            <span style={liveText}>{step === 3 ? 'Recording' : 'Live'}</span>
          </div>
        </div>

        <div style={videoContainer}>
          <video ref={videoRef} autoPlay muted playsInline style={videoEl} />
          <div style={videoOverlay} />
          <div style={{ ...corner, top: 12, left: 12, borderTop: '2px solid rgba(255,255,255,0.3)', borderLeft: '2px solid rgba(255,255,255,0.3)' }} />
          <div style={{ ...corner, top: 12, right: 12, borderTop: '2px solid rgba(255,255,255,0.3)', borderRight: '2px solid rgba(255,255,255,0.3)' }} />
          <div style={{ ...corner, bottom: 12, left: 12, borderBottom: '2px solid rgba(255,255,255,0.3)', borderLeft: '2px solid rgba(255,255,255,0.3)' }} />
          <div style={{ ...corner, bottom: 12, right: 12, borderBottom: '2px solid rgba(255,255,255,0.3)', borderRight: '2px solid rgba(255,255,255,0.3)' }} />
          {step === 3 && (
            <div style={recBadge}><div style={recDot} /><span style={recText}>{fmt(seconds)}</span></div>
          )}
        </div>

        <div style={geoRow}>
          <div style={{ ...geoDot, background: geoData?.lat ? '#16a34a' : '#475569' }} />
          <span style={geoText}>
            {geoData === null ? 'Locating...' : geoData?.lat ? `${geoData.lat.toFixed(4)}, ${geoData.lng.toFixed(4)}` : 'Location unavailable'}
          </span>
        </div>

        <div style={stepsRow}>
          {['Verify', 'Record', 'Submit'].map((label, i) => {
            const active = step === i + 1 || (step === 3 && i === 1)
            const done = step > i + 1 || (step >= 3 && i === 0) || (step >= 4 && i === 1)
            return (
              <div key={i} style={stepItem}>
                <div style={{ ...stepDot, background: done ? '#16a34a' : active ? 'white' : 'rgba(255,255,255,0.1)', color: done ? 'white' : active ? '#0f172a' : 'rgba(255,255,255,0.3)' }}>
                  {done ? '✓' : i + 1}
                </div>
                <span style={{ ...stepLabel, color: done || active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.3)' }}>{label}</span>
              </div>
            )
          })}
        </div>
      </div>

      <div style={rightPanel}>
        <div style={{ animation: 'fadeUp 0.5s ease both' }}>
          <p style={eyebrow}>Video Assessment</p>
          <h1 style={rightTitle}>Loan Application<br /><span style={rightItalic}>Interview</span></h1>
          <p style={rightBody}>Your session is encrypted and secure. Follow the steps on the left and speak clearly into your microphone.</p>
        </div>

        {error && (
          <div style={errorBox}><div style={errorDot} /><span style={errorText}>{error}</span></div>
        )}

        <div style={scriptCard}>
        {/* 🔥 ID Upload */}
<div style={{ marginTop: '12px' }}>
  <p style={{ fontSize: '12px', color: '#64748b' }}>
    Upload ID (Aadhaar / PAN)
  </p>

  <input
    type="file"
    accept="image/*"
    onChange={(e) => setIdFile(e.target.files[0])}
  />

  {idFile && (
    <p style={{ fontSize: '11px', color: '#16a34a' }}>
      ✔ {idFile.name}
    </p>
  )}
</div>
        {/* 🔥 Income Proof Upload */}
<div style={{
  marginTop: '12px',
  padding: '16px',
  border: '1px dashed #cbd5e1',
  borderRadius: '10px',
  background: '#f8fafc'
}}>
  <p style={{
    fontSize: '12px',
    color: '#64748b',
    marginBottom: '8px'
  }}>
    Upload income proof (optional)
  </p>

  <input
    type="file"
    accept="application/pdf"
    onChange={(e) => setIncomeFile(e.target.files[0])}
    style={{ fontSize: '12px' }}
  />

  {incomeFile && (
    <p style={{ fontSize: '11px', color: '#16a34a', marginTop: '6px' }}>
      ✔ {incomeFile.name}
    </p>
  )}
</div>
          <p style={scriptHeading}>Please state the following</p>
          {['Your full name', 'Employment type — salaried or self-employed', 'Monthly income in rupees', 'Loan amount required and purpose', 'Verbal consent to process this application'].map((item, i) => (
            <div key={i} style={scriptRow}>
              <span style={scriptIndex}>{String(i + 1).padStart(2, '0')}</span>
              <span style={scriptText}>{item}</span>
            </div>
          ))}
        </div>

        {step === 3 && (
          <div style={timerBlock}>
            <span style={timerValue}>{fmt(seconds)}</span>
            <span style={timerLabel}>elapsed</span>
          </div>
        )}

        <div style={{ marginTop: '8px' }}>
          {step === 0 && (
            <button onClick={verifyFace} disabled={!cameraReady}
              style={{ ...primaryBtn, opacity: cameraReady ? 1 : 0.5, cursor: cameraReady ? 'pointer' : 'not-allowed' }}>
              Begin Face Verification
            </button>
          )}
          {step === 1 && (
            <button style={{ ...primaryBtn, background: '#f1f5f9', color: '#94a3b8', cursor: 'not-allowed' }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                <div style={btnSpinner} />Verifying identity...
              </span>
            </button>
          )}
          {step === 2 && <button onClick={startRecording} style={primaryBtn}>Start Recording</button>}
          {step === 3 && <button onClick={stopAndProcess} style={{ ...primaryBtn, background: '#dc2626' }}>End Call &amp; Submit</button>}
        </div>

        <p style={disclaimer}>Session {token?.slice(0, 8).toUpperCase()} · Encrypted · RBI compliant</p>
      </div>
    </div>
  )
}

const page = { display: 'flex', minHeight: '100vh', fontFamily: "'DM Sans', sans-serif", background: '#f8f7f4' }
const processingPage = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f7f4', fontFamily: "'DM Sans', sans-serif" }
const processingCard = { maxWidth: '440px', width: '100%', padding: '48px 40px', textAlign: 'center' }
const brandRowSmall = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '40px' }
const brandMarkSm = { width: '22px', height: '22px', background: '#0f172a', borderRadius: '5px' }
const brandNameSm = { fontFamily: "'DM Serif Display', serif", fontSize: '16px', color: '#0f172a' }
const spinnerRing = { width: '48px', height: '48px', border: '2px solid #e2e8f0', borderTop: '2px solid #0f172a', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 28px' }
const processingTitle = { fontFamily: "'DM Serif Display', serif", fontSize: '26px', color: '#0f172a', margin: '0 0 12px', letterSpacing: '-0.02em' }
const processingBody = { fontSize: '14px', color: '#64748b', lineHeight: '1.7', margin: '0 0 32px' }
const processingSteps = { textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '12px' }
const processingStep = { display: 'flex', alignItems: 'center', gap: '12px' }
const processingStepDot = { width: '6px', height: '6px', borderRadius: '50%', background: '#cbd5e1', flexShrink: 0 }
const processingStepText = { fontSize: '13px', color: '#94a3b8' }
const leftPanel = { width: '52%', background: '#0f172a', display: 'flex', flexDirection: 'column', padding: '32px', gap: '20px' }
const leftBrand = { display: 'flex', alignItems: 'center', gap: '10px' }
const brandMark = { width: '26px', height: '26px', background: 'white', borderRadius: '6px' }
const brandNameLeft = { fontFamily: "'DM Serif Display', serif", fontSize: '16px', color: 'white', flex: 1 }
const livePill = { display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid rgba(255,255,255,0.12)', padding: '4px 10px', borderRadius: '20px' }
const liveDot = { width: '6px', height: '6px', borderRadius: '50%' }
const liveText = { fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.1em' }
const videoContainer = { flex: 1, position: 'relative', borderRadius: '12px', overflow: 'hidden', background: '#1e293b' }
const videoEl = { width: '100%', height: '100%', display: 'block', objectFit: 'cover' }
const videoOverlay = { position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(15,23,42,0.6) 0%, transparent 40%)', pointerEvents: 'none' }
const corner = { position: 'absolute', width: '16px', height: '16px' }
const recBadge = { position: 'absolute', top: '14px', left: '14px', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(220,38,38,0.9)', backdropFilter: 'blur(8px)', padding: '6px 14px', borderRadius: '99px' }
const recDot = { width: '7px', height: '7px', borderRadius: '50%', background: 'white', animation: 'pulse 1s infinite' }
const recText = { fontFamily: "'DM Mono', monospace", fontSize: '12px', color: 'white', fontWeight: '500' }
const verifiedBadge = { position: 'absolute', bottom: '14px', left: '14px', display: 'flex', alignItems: 'center', gap: '7px', background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(8px)', padding: '6px 14px', borderRadius: '99px', border: '1px solid rgba(22,163,74,0.4)' }
const verifiedDot = { width: '6px', height: '6px', borderRadius: '50%', background: '#16a34a', flexShrink: 0 }
const verifiedText = { fontSize: '11px', color: 'rgba(255,255,255,0.85)', fontFamily: "'DM Mono', monospace" }
const geoRow = { display: 'flex', alignItems: 'center', gap: '8px' }
const geoDot = { width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0 }
const geoText = { fontFamily: "'DM Mono', monospace", fontSize: '10px', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.04em' }
const stepsRow = { display: 'flex', gap: '24px', alignItems: 'center' }
const stepItem = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }
const stepDot = { width: '30px', height: '30px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '600', transition: 'all 0.3s ease' }
const stepLabel = { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', transition: 'color 0.3s ease' }
const rightPanel = { flex: 1, padding: '48px 48px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '24px' }
const eyebrow = { fontSize: '11px', fontWeight: '600', color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase', margin: '0 0 12px' }
const rightTitle = { fontFamily: "'DM Serif Display', serif", fontSize: '42px', color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1.1, margin: '0 0 16px' }
const rightItalic = { fontStyle: 'italic', color: '#475569' }
const rightBody = { fontSize: '14px', color: '#64748b', lineHeight: '1.7', margin: 0 }
const errorBox = { display: 'flex', alignItems: 'flex-start', gap: '10px', background: '#fff8f8', border: '1px solid #fecaca', borderRadius: '10px', padding: '14px 16px' }
const errorDot = { width: '6px', height: '6px', borderRadius: '50%', background: '#dc2626', flexShrink: 0, marginTop: '5px' }
const errorText = { fontSize: '13px', color: '#991b1b', lineHeight: '1.5' }
const scriptCard = { background: '#f8f7f4', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }
const scriptHeading = { fontSize: '11px', fontWeight: '600', color: '#94a3b8', letterSpacing: '0.1em', textTransform: 'uppercase', margin: '0 0 4px' }
const scriptRow = { display: 'flex', alignItems: 'flex-start', gap: '14px' }
const scriptIndex = { fontFamily: "'DM Mono', monospace", fontSize: '11px', color: '#cbd5e1', paddingTop: '2px', flexShrink: 0, minWidth: '20px' }
const scriptText = { fontSize: '14px', color: '#334155', lineHeight: '1.5' }
const timerBlock = { display: 'flex', alignItems: 'baseline', gap: '8px' }
const timerValue = { fontFamily: "'DM Mono', monospace", fontSize: '40px', color: '#0f172a', fontWeight: '500', letterSpacing: '-0.02em' }
const timerLabel = { fontSize: '12px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }
const primaryBtn = { width: '100%', padding: '14px', background: '#0f172a', color: 'white', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '500', letterSpacing: '0.02em', cursor: 'pointer', transition: 'background 0.2s' }
const btnSpinner = { width: '14px', height: '14px', border: '2px solid #e2e8f0', borderTop: '2px solid #94a3b8', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }
const disclaimer = { fontFamily: "'DM Mono', monospace", fontSize: '10px', color: '#cbd5e1', letterSpacing: '0.04em' }