from fastapi import FastAPI, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from stt import transcribe_audio
from llm import extract_loan_data
from offer_engine import (
    get_bureau_score, evaluate_fraud_signals,
    check_policy, compute_risk_score, generate_offer
)
from face import analyze_face, check_liveness
from deepface import DeepFace
import numpy as np
import cv2
import uuid, datetime, threading, io, re, os
from PIL import Image, ImageEnhance
import pdfplumber
import pytesseract
import shutil
import json
from groq import Groq
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

# Auto-detect tesseract
tesseract_path = shutil.which('tesseract')
if tesseract_path:
    pytesseract.pytesseract.tesseract_cmd = tesseract_path
else:
    pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"

load_dotenv()
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions  = {}
ip_counts = {}

# ── WARMUP ────────────────────────────────────────────────────────
def warmup():
    try:
        dummy = np.zeros((100, 100, 3), dtype=np.uint8)
        DeepFace.analyze(dummy, actions=['age'],
                         enforce_detection=False, silent=True)
        print("✅ DeepFace warmed up")
    except Exception as e:
        print("Warmup skipped:", e)

threading.Thread(target=warmup, daemon=True).start()


# ── HELPERS ───────────────────────────────────────────────────────
def name_similarity(name1: str, name2: str) -> float:
    """
    Compares two names with fuzzy matching.
    Handles common Indian surname spelling variations:
    Agrawal/Agarwal, Singh/Sing, Kumar/Kumaar, etc.
    """
    if not name1 or not name2:
        return 0.0

    # normalize — lowercase, strip extra spaces
    n1 = name1.lower().strip()
    n2 = name2.lower().strip()

    # exact match
    if n1 == n2:
        return 1.0

    # common Indian name spelling variations
    VARIATIONS = [
        {"agrawal", "agarwal", "agraval", "agarval"},
        {"singh", "sing", "singht"},
        {"kumar", "kumaar", "kumarr"},
        {"sharma", "sarma", "sharmaa"},
        {"verma", "varma", "vermaa"},
        {"gupta", "guptha", "gupta"},
        {"patel", "patil", "patal"},
        {"shah", "shaha"},
        {"mehta", "mehtha", "metha"},
        {"joshi", "joshy"},
        {"mishra", "misra", "mishraa"},
        {"pandey", "pande", "pandey"},
        {"yadav", "yaadav", "yadav"},
    ]

    def normalize_word(word):
        """Replace known variant with canonical form."""
        for group in VARIATIONS:
            if word in group:
                return sorted(group)[0]  # use first alphabetically as canonical
        return word

    words1 = [normalize_word(w) for w in n1.split()]
    words2 = [normalize_word(w) for w in n2.split()]

    set1, set2 = set(words1), set(words2)

    # exact word overlap after normalization
    exact = len(set1 & set2) / max(len(set1), len(set2))
    if exact >= 0.5:
        return exact

    # fuzzy prefix match — handles minor OCR/speech errors
    fuzzy_matches = 0
    for w1 in words1:
        for w2 in words2:
            longer  = max(len(w1), len(w2))
            if longer == 0:
                continue
            common = sum(a == b for a, b in zip(w1, w2))
            if common / longer >= 0.75:
                fuzzy_matches += 1
                break

    return fuzzy_matches / max(len(words1), len(words2))

def preprocess_for_ocr(pil_img: Image.Image) -> Image.Image:
    """Clean up ID card image for better OCR accuracy."""
    # cap size — don't go beyond 1500px wide
    max_w = 1500
    if pil_img.width < max_w:
        scale = max_w // pil_img.width
        pil_img = pil_img.resize(
            (pil_img.width * scale, pil_img.height * scale),
            Image.LANCZOS
        )

    # enhance
    pil_img = ImageEnhance.Contrast(pil_img).enhance(2.0)
    pil_img = ImageEnhance.Sharpness(pil_img).enhance(2.0)

    # grayscale
    pil_img = pil_img.convert('L')

    # FIXED threshold — stays in L mode, no '1' conversion
    pil_img = pil_img.point(lambda x: 0 if x < 128 else 255)

    return pil_img


def extract_dob_from_text(text: str):
    """Try multiple DOB patterns on OCR text."""
    patterns = [
        r'DOB[:\s]+(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})',
        r'Date of Birth[:\s]+(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})',
        r'\b(\d{2})[\/\-\.](\d{2})[\/\-\.](\d{4})\b',
        r'\b(\d{2})\s(\d{2})\s(\d{4})\b',
        r'(\d{4})[\/\-](\d{2})[\/\-](\d{2})',  # YYYY/MM/DD
    ]
    for pattern in patterns:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            g = match.groups()
            # handle YYYY/MM/DD format
            if len(g[0]) == 4:
                year, month, day = int(g[0]), int(g[1]), int(g[2])
            else:
                day, month, year = int(g[0]), int(g[1]), int(g[2])

            if 1940 <= year <= 2006 and 1 <= month <= 12 and 1 <= day <= 31:
                today = datetime.date.today()
                age   = today.year - year - ((today.month, today.day) < (month, day))
                return f"{day:02d}/{month:02d}/{year}", age

    return None, None


def extract_income_from_pdf_text(text: str) -> int | None:
    """
    Extract monthly income from PDF text.
    Looks for salary/income keywords near numbers — not just any large number.
    """
    text_lower = text.lower()

    # keyword patterns near numbers
    patterns = [
        r'(?:net salary|net pay|take.?home|in hand)[^\d]*?(\d{4,7})',
        r'(?:gross salary|gross pay|ctc)[^\d]*?(\d{4,7})',
        r'(?:monthly income|monthly salary|monthly earnings)[^\d]*?(\d{4,7})',
        r'(?:total earnings|total salary)[^\d]*?(\d{4,7})',
        r'(?:salary|income)[^\d]*?(\d{4,7})',
    ]

    for pattern in patterns:
        match = re.search(pattern, text_lower)
        if match:
            val = int(match.group(1))
            # sanity check — monthly income in India typically 10k–10L
            if 10000 <= val <= 1000000:
                print(f"PDF income extracted: ₹{val} via pattern: {pattern}")
                return val

    # fallback — look for any number in salary range
    all_numbers = re.findall(r'\b(\d{4,7})\b', text)
    candidates  = [int(n) for n in all_numbers if 10000 <= int(n) <= 1000000]
    if candidates:
        # take median to avoid account numbers / large one-off figures
        candidates.sort()
        median_val = candidates[len(candidates) // 2]
        print(f"PDF income fallback (median): ₹{median_val}")
        return median_val

    return None


# ── ROOT ──────────────────────────────────────────────────────────
@app.get("/")
def root():
    return {"status": "backend running", "sessions": len(sessions)}


# ── CREATE SESSION ────────────────────────────────────────────────
@app.post("/api/create-session")
def create_session(request: Request):
    token = str(uuid.uuid4())
    ip    = request.client.host
    sessions[token] = {
        "status":     "pending",
        "created_at": datetime.datetime.now().isoformat(),
        "ip":         ip
    }
    return {"token": token}


# ── ANALYZE VIDEO ─────────────────────────────────────────────────
@app.post("/api/analyze-video")
async def analyze_video(
    frame1: UploadFile = File(...),
    frame2: UploadFile = File(...)
):
    try:
        f1 = await frame1.read()
        f2 = await frame2.read()
        face_result = analyze_face(f1)
        live        = check_liveness(f1, f2)
        return {
            "age":        face_result.get("age", 25),
            "valid_face": face_result.get("valid_face", False),
            "liveness":   live
        }
    except Exception as e:
        print("Analyze video error:", e)
        return {"age": 25, "valid_face": True, "liveness": True}


# ── VERIFY ID ─────────────────────────────────────────────────────
@app.post("/api/verify-id")
async def verify_id(
    id_image:   UploadFile = File(...),
    live_image: UploadFile = File(...)
):
    try:
        import base64

        id_bytes   = await id_image.read()
        live_bytes = await live_image.read()

        print(f"ID bytes: {len(id_bytes)} | Live bytes: {len(live_bytes)}")

        # ── STEP 1: LLM reads the ID card directly ────────────────
        id_b64 = base64.b64encode(id_bytes).decode('utf-8')

        llm_response = client.chat.completions.create(
            model="meta-llama/llama-4-scout-17b-16e-instruct",
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{id_b64}"
                            }
                        },
                        {
                            "type": "text",
                            "text": """This is an Indian ID card (PAN card or Aadhaar card).
Extract the following and return ONLY valid JSON, nothing else:
{
  "full_name": "name exactly as printed",
  "date_of_birth": "DD/MM/YYYY format",
  "card_type": "pan" or "aadhaar",
  "pan_number": "if visible, else null",
  "aadhaar_number": "if visible, else null",
  "father_name": "if visible, else null"
}
If a field is not visible return null. Do not guess."""
                        }
                    ]
                }
            ],
            max_tokens=300
        )

        raw = llm_response.choices[0].message.content.strip()
        print("LLM ID extraction raw:", raw)

        # parse JSON from LLM response
        import re, json
        json_match = re.search(r'\{.*\}', raw, re.DOTALL)
        id_data = {}
        if json_match:
            try:
                id_data = json.loads(json_match.group())
            except:
                id_data = {}

        print("ID data extracted:", id_data)

        # ── STEP 2: Calculate age from DOB ────────────────────────
        age = None
        dob = id_data.get("date_of_birth")

        if dob:
            try:
                dob_match = re.search(
                    r'(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})', dob
                )
                if dob_match:
                    day   = int(dob_match.group(1))
                    month = int(dob_match.group(2))
                    year  = int(dob_match.group(3))
                    today = datetime.date.today()
                    age   = today.year - year - (
                        (today.month, today.day) < (month, day)
                    )
                    print(f"DOB: {day}/{month}/{year} → Age: {age}")
            except Exception as de:
                print("DOB parse error:", de)

        # ── STEP 3: Face match (live vs ID) ───────────────────────
        face_match    = False
        similarity    = 0.0
        match_skipped = False

        try:
            id_img   = cv2.imdecode(
                np.frombuffer(id_bytes,   np.uint8), cv2.IMREAD_COLOR
            )
            live_img = cv2.imdecode(
                np.frombuffer(live_bytes, np.uint8), cv2.IMREAD_COLOR
            )

            if id_img is not None and live_img is not None:
                id_img   = cv2.resize(id_img,   (640, 480))
                live_img = cv2.resize(live_img, (640, 480))

                result = DeepFace.verify(
                    img1_path         = id_img,
                    img2_path         = live_img,
                    model_name        = "VGG-Face",
                    detector_backend  = "opencv",
                    distance_metric   = "cosine",
                    enforce_detection = False
                )
                distance   = result.get("distance", 1.0)
                face_match = distance < 0.65
                similarity = round(max(0.0, 1.0 - distance), 2)
                print(f"Face verify: distance={distance:.3f}, match={face_match}")
            else:
                match_skipped = True

        except Exception as fe:
            print("Face verify error:", fe)
            match_skipped = True

        return {
            "verified":       face_match,
            "similarity":     similarity,
            "match_skipped":  match_skipped,
            "age":            age,
            "dob":            dob,
            "card_type":      id_data.get("card_type"),
            "extracted_name": id_data.get("full_name"),
            "pan_number":     id_data.get("pan_number"),
            "aadhaar_number": id_data.get("aadhaar_number"),
            "father_name":    id_data.get("father_name")
        }

    except Exception as e:
        import traceback; traceback.print_exc()
        return {
            "verified":      False,
            "similarity":    0.0,
            "age":           None,
            "match_skipped": True,
            "error":         str(e)
        }

# ── PROCESS CALL ──────────────────────────────────────────────────
@app.post("/api/process-call")
async def process_call(
    request:       Request,
    audio:         UploadFile = File(...),
    token:         str  = Form(...),
    declared_age:  int  = Form(default=25),
    detected_age:  int  = Form(default=0),
    document_age:  int  = Form(default=0),
    liveness:      str  = Form(default="false"),
    geo_lat:       str  = Form(default=""),
    geo_lng:       str  = Form(default=""),
    id_name:       str  = Form(default=""),      # name from ID card OCR
    income_proof:  UploadFile = File(default=None)
):
    try:
        ip = request.client.host
        ip_counts[ip] = ip_counts.get(ip, 0) + 1
        session_count  = ip_counts[ip]

        session_ip  = sessions.get(token, {}).get("ip")
        ip_mismatch = bool(session_ip and session_ip != ip)

        # ── TRANSCRIBE ────────────────────────────────────────
        audio_bytes = await audio.read()
        print(f"Audio size: {len(audio_bytes)} bytes")

        transcript = ""
        if len(audio_bytes) > 5000:
            transcript = transcribe_audio(audio_bytes)
        else:
            print("Audio too small, skipping STT")

        if not transcript:
            transcript = ""
        print("Transcript:", transcript[:80] if transcript else "EMPTY")

        # ── EXTRACT LOAN DATA ─────────────────────────────────
        loan_data = extract_loan_data(transcript)
        print("Loan data:", loan_data)

        # ── PDF INCOME EXTRACTION ─────────────────────────────
        estimated_income = None
        pdf_text         = ""

        if income_proof and income_proof.filename:
            try:
                pdf_bytes = await income_proof.read()
                with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
                    for page in pdf.pages:
                        pdf_text += page.extract_text() or ""

                print("PDF text (first 200):", pdf_text[:200])
                estimated_income = extract_income_from_pdf_text(pdf_text)
                print(f"Estimated income from PDF: ₹{estimated_income}")

            except Exception as pe:
                print("PDF error:", pe)

        # ── BUREAU ────────────────────────────────────────────
        bureau = get_bureau_score(
            loan_data.get("monthly_income") or 0,
            loan_data.get("employment_type") or "unemployed"
        )

        # ── FINAL AGE ─────────────────────────────────────────
        # Priority: document > face detected > declared
        final_age = document_age or detected_age or declared_age

        # ── FRAUD ─────────────────────────────────────────────
        fraud = evaluate_fraud_signals(
            declared_age  = final_age,
            detected_age  = detected_age,
            geo_lat       = float(geo_lat) if geo_lat else None,
            geo_lng       = float(geo_lng) if geo_lng else None,
            consent_given = loan_data.get("verbal_consent_given", False),
            liveness      = liveness == "true",
            loan_data     = loan_data,
            bureau        = bureau,
            transcript    = transcript,
            document_age  = document_age or None,
            session_count = session_count
        )

        # ── EXTRA FRAUD CHECKS ────────────────────────────────


        # 2. Name mismatch — ID name vs transcript name
        transcript_name = loan_data.get("full_name") or ""
        if id_name and transcript_name:
            sim = name_similarity(id_name, transcript_name)
            print(f"Name similarity: {sim:.2f} (ID: '{id_name}' vs Transcript: '{transcript_name}')")
            if sim < 0.25:       # very low — genuinely different person
                fraud["fraud_flags"].append(
                    f"Name mismatch: ID says '{id_name}', transcript says '{transcript_name}'"
                )
                fraud["fraud_score"] = min(100, fraud["fraud_score"] + 30)
            # anything above 0.25 — don't flag at all
            # spelling variations like Agrawal/Agarwal will score 0.67+ and pass silently

        # 3. Income mismatch — PDF vs declared
        declared_income = loan_data.get("monthly_income") or 0
        if estimated_income and declared_income:
            diff_pct = abs(estimated_income - declared_income) / max(estimated_income, declared_income)
            print(f"Income diff: {diff_pct:.0%} (PDF ₹{estimated_income} vs declared ₹{declared_income})")
            if diff_pct > 0.40:
                fraud["fraud_flags"].append(
                    f"Income mismatch: PDF shows ₹{estimated_income}, declared ₹{declared_income}"
                )
                fraud["fraud_score"] = min(100, fraud["fraud_score"] + 30)
            elif diff_pct > 0.20:
                fraud["fraud_flags"].append(
                    f"Minor income discrepancy: PDF ₹{estimated_income} vs declared ₹{declared_income}"
                )
                fraud["fraud_score"] = min(100, fraud["fraud_score"] + 10)
        elif estimated_income and not declared_income:
            fraud["fraud_flags"].append("Income not declared verbally but income document uploaded")
            fraud["fraud_score"] = min(100, fraud["fraud_score"] + 15)

        # 4. IP mismatch
        if ip_mismatch:
            fraud["fraud_flags"].append("IP address changed during session")
            fraud["fraud_score"] = min(100, fraud["fraud_score"] + 20)

        # recalculate high_risk after extra checks
        # recalculate everything after all extra flags added
        fraud["flag_count"]  = len(fraud["fraud_flags"])   # ✅ update count
        fraud["high_risk"]   = fraud["fraud_score"] >= 40
        fraud["fraud_level"] = (
            "CRITICAL" if fraud["fraud_score"] >= 70
            else "HIGH"  if fraud["fraud_score"] >= 40
            else "LOW"
        )

        # ── POLICY ────────────────────────────────────────────
        policy = check_policy(loan_data, bureau, final_age)

        # ── RISK ──────────────────────────────────────────────
        risk = compute_risk_score(loan_data, bureau, fraud)

        # ── OFFER ─────────────────────────────────────────────
        # use PDF income if available and within acceptable range
        income_for_offer = (
            estimated_income
            if estimated_income and declared_income
            and abs(estimated_income - declared_income) / max(estimated_income, declared_income) < 0.40
            else declared_income
        )
        loan_data_for_offer = {**loan_data, "monthly_income": income_for_offer or declared_income}

        offer = generate_offer(
            loan_data_for_offer, risk, bureau, policy, fraud, final_age
        )

       # ── SAVE ──────────────────────────────────────────────────
        sessions[token] = {
            "status":           "completed",
            "completed_at":     datetime.datetime.now().isoformat(),
            "transcript":       transcript,          # ✅ was missing
            "loan_data":        loan_data,
            "bureau":           bureau,
            "fraud":            fraud,
            "policy":           policy,              # ✅ was missing
            "risk":             risk,
            "offer":            offer,
            "estimated_income": estimated_income,
            "declared_income":  declared_income,
            "final_age":        final_age,
            "geo":              {"lat": geo_lat, "lng": geo_lng},
            "ip":               ip
        }
        
        return sessions[token]

    except Exception as e:
        import traceback; traceback.print_exc()
        return {"error": str(e)}


# ── GET SESSION ───────────────────────────────────────────────────
@app.get("/api/session/{token}")
def get_session(token: str):
    return sessions.get(token, {"error": "not found"})


# ── AUDIT ─────────────────────────────────────────────────────────
@app.get("/api/audit")
def audit():
    done = [s for s in sessions.values() if s.get("status") == "completed"]
    return {
        "summary": {
            "total":       len(sessions),
            "completed":   len(done),
            "approved":    sum(1 for s in done if s.get("offer",{}).get("status") == "pre_approved"),
            "rejected":    sum(1 for s in done if s.get("offer",{}).get("status") == "rejected"),
            "high_fraud":  sum(1 for s in done if s.get("fraud",{}).get("high_risk")),
        },
        "sessions": [
            {
                "token":       t[:8],
                "name":        s.get("loan_data",{}).get("full_name","—"),
                "risk_band":   s.get("risk",{}).get("risk_band","—"),
                "fraud_score": s.get("fraud",{}).get("fraud_score", 0),
                "fraud_level": s.get("fraud",{}).get("fraud_level","—"),
                "offer":       s.get("offer",{}).get("status","—"),
                "flags":       s.get("fraud",{}).get("fraud_flags",[]),
                "time":        s.get("completed_at",""),
            }
            for t, s in sessions.items() if s.get("status") == "completed"
        ]
    }