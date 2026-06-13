import random
import datetime

# ── BUREAU SIMULATION ─────────────────────────
def get_bureau_score(monthly_income: float, employment_type: str) -> dict:
    random.seed(int(monthly_income or 0) % 100)

    base = {
        "salaried": 720,
        "self_employed": 680,
        "unemployed": 520
    }.get(employment_type, 600)

    if monthly_income > 100000:
        base += 30
    elif monthly_income < 20000:
        base -= 40

    score = max(300, min(900, base + random.randint(-40, 40)))

    if monthly_income > 100000:
        existing_loans = random.randint(1, 3)
    else:
        existing_loans = random.randint(0, 1)

    if score < 620:
        payment_history = round(random.uniform(0.6, 0.85), 2)
    else:
        payment_history = round(random.uniform(0.85, 1.0), 2)

    return {
        "credit_score":        score,
        "existing_loans":      existing_loans,
        "previous_default":    score < 620,
        "credit_age_months":   random.randint(12, 84),
        "payment_history_pct": payment_history
    }


# ── GEO CHECK ─────────────────────────────────
def is_in_india(lat, lng):
    try:
        return 6 <= float(lat) <= 37 and 68 <= float(lng) <= 97
    except:
        return False


# ── FRAUD ENGINE ──────────────────────────────
def evaluate_fraud_signals(
    declared_age,
    detected_age,
    geo_lat,
    geo_lng,
    consent_given,
    liveness,
    loan_data,
    bureau,
    transcript="",
    document_age=None,
    session_count=0
):
    flags = []
    score = 0

    income  = loan_data.get("monthly_income") or 0
    emp     = loan_data.get("employment_type") or "unemployed"
    purpose = (loan_data.get("loan_purpose") or "").lower()

    # Age checks
    if detected_age and abs(declared_age - detected_age) > 8:
        flags.append("Face age mismatch")
        score += 30

    if document_age and abs(declared_age - document_age) > 3:
        flags.append("Document age mismatch")
        score += 25

    if detected_age and document_age and abs(detected_age - document_age) > 6:
        flags.append("Face vs document mismatch")
        score += 30

    if declared_age < 18:
        flags.append("Underage applicant")
        score += 60

    # Liveness
    if not liveness:
        flags.append("Liveness failed")
        score += 50

    # Consent
    if not consent_given:
        flags.append("Consent missing")
        score += 40

    # Geo
    if not geo_lat or not geo_lng:
        flags.append("Location missing")
        score += 15
    elif not is_in_india(geo_lat, geo_lng):
        flags.append("Outside India")
        score += 35

    # Income fraud
    if emp == "unemployed" and income > 20000:
        flags.append("Income inconsistent with employment")
        score += 30

    if emp == "salaried" and 0 < income < 10000:
        flags.append("Unrealistic low salary")
        score += 20

    if bureau["credit_score"] < 600 and income > 100000:
        flags.append("Income-credit mismatch")
        score += 25

    if income == 0:
        flags.append("No income declared")
        score += 35

    # Transcript quality
    if len(transcript.strip()) < 30:
        flags.append("Low transcript quality")
        score += 20

    # Purpose
    if any(x in purpose for x in ["gambling", "crypto", "betting"]):
        flags.append("Restricted purpose")
        score += 60

    # Sessions
    if session_count > 3:
        flags.append("Multiple attempts detected")
        score += 25

    # Bureau
    if bureau["existing_loans"] >= 3:
        flags.append("Too many loans")
        score += 20

    if bureau["payment_history_pct"] < 0.8:
        flags.append("Poor repayment history")
        score += 15

    if bureau["previous_default"]:
        flags.append("Previous default")
        score += 25

    final_score = min(score, 100)

    if final_score >= 70:
        level = "CRITICAL"
    elif final_score >= 40:
        level = "HIGH"
    else:
        level = "LOW"

    return {
        "fraud_score": final_score,
        "fraud_flags": flags,
        "high_risk":   final_score >= 40,
        "fraud_level": level,
        "flag_count":  len(flags)
    }


# ── POLICY ENGINE ─────────────────────────────
POLICY_RULES = {
    "min_age":             18,
    "max_age":             60,
    "min_credit_score":    650,
    "min_income_salaried": 15000,
    "min_income_self_emp": 25000,
    "max_existing_loans":  3,
    "max_loan_to_income":  5,
    "max_emi_to_income":   0.40
}


def check_policy(loan_data, bureau, age):
    violations = []
    emp    = loan_data.get("employment_type") or "unemployed"
    income = loan_data.get("monthly_income") or 0

    if age < 18 or age > 60:
        violations.append("Age not eligible")

    if emp == "unemployed":
        violations.append("Unemployed not eligible")

    if emp == "salaried" and income < 15000:
        violations.append("Income too low")

    if bureau["credit_score"] < 650:
        violations.append("Low credit score")

    if bureau["previous_default"]:
        violations.append("Previous default")

    return {
        "policy_passed": len(violations) == 0,
        "violations":    violations
    }


# ── RISK ENGINE ───────────────────────────────
def compute_risk_score(loan_data, bureau, fraud):
    score = 0
    c = bureau["credit_score"]

    if c >= 750:
        score += 5
    elif c >= 700:
        score += 15
    else:
        score += 40

    score += fraud["fraud_score"] * 0.15
    score  = min(100, int(score))

    band = "LOW" if score < 30 else "MEDIUM" if score < 60 else "HIGH"
    confidence = max(0, 100 - fraud["fraud_score"])

    return {
        "risk_score": score,
        "risk_band":  band,
        "eligible":   band != "HIGH" and not fraud["high_risk"],
        "confidence": confidence
    }


# ── LOAN PRODUCTS ─────────────────────────────
LOAN_PRODUCTS = {
    ("salaried",      "LOW"):    {"rate": 10.5, "tenure": 60},
    ("salaried",      "MEDIUM"): {"rate": 13.5, "tenure": 48},
    ("self_employed", "LOW"):    {"rate": 12.0, "tenure": 48},
    ("self_employed", "MEDIUM"): {"rate": 15.5, "tenure": 36},
}

DEFAULT_PRODUCT = {"rate": 14.0, "tenure": 48}


# ── EMI CALCULATOR ────────────────────────────
def calculate_emi(p, annual_rate, n):
    if p <= 0 or n <= 0 or annual_rate <= 0:
        return 0
    r = annual_rate / 1200
    return int(p * r * (1 + r) ** n / ((1 + r) ** n - 1))


# ── OFFER ENGINE ──────────────────────────────
def generate_offer(loan_data, risk, bureau, policy, fraud,
                   age, estimated_income=None):

    # hard stops
    if not policy["policy_passed"]:
        return {
            "status":          "rejected",
            "reason":          policy["violations"][0],
            "all_violations":  policy["violations"]
        }

    if fraud["high_risk"]:
        return {
            "status":      "rejected",
            "reason":      "High fraud risk",
            "fraud_flags": fraud["fraud_flags"]
        }

    if not risk["eligible"]:
        return {
            "status": "rejected",
            "reason": "Risk score too high"
        }

    declared_income = loan_data.get("monthly_income") or 0

    # use verified income if available and not wildly different
    if estimated_income and declared_income:
        diff_pct = abs(estimated_income - declared_income) / max(estimated_income, declared_income)
        if diff_pct > 0.40:
            return {
                "status": "rejected",
                "reason": f"Income mismatch: PDF ₹{estimated_income} vs declared ₹{declared_income}"
            }
        income = estimated_income
    else:
        income = declared_income

    if income <= 0:
        return {"status": "rejected", "reason": "No valid income found"}

    emp  = loan_data.get("employment_type") or "salaried"
    band = risk["risk_band"]

    # pick product — fallback to default if combo not in table
    product = LOAN_PRODUCTS.get((emp, band), DEFAULT_PRODUCT)
    rate    = product["rate"]
    tenure  = product["tenure"]

    # max loan = 5× income, capped at 5L
    max_loan = min(500000, income * POLICY_RULES["max_loan_to_income"])

    # affordability: EMI must be ≤ 40% of income
    max_emi = income * POLICY_RULES["max_emi_to_income"]
    r       = rate / 1200
    # reverse EMI formula → max principal from max EMI
    max_from_emi = max_emi * ((1 + r) ** tenure - 1) / (r * (1 + r) ** tenure)

    eligible_amount = int(min(max_loan, max_from_emi))

    if eligible_amount < 10000:
        return {"status": "rejected", "reason": "Eligible amount too low after affordability check"}

    emi = calculate_emi(eligible_amount, rate, tenure)

    # safety guard
    if emi <= 0:
        return {"status": "rejected", "reason": "EMI calculation failed"}

    emi_to_income   = round(emi / income, 2)
    loan_to_income  = round(eligible_amount / income, 1)

    return {
        "status":               "pre_approved",
        "eligible_amount":      eligible_amount,
        "interest_rate":        rate,           # ✅ was missing
        "tenure_months":        tenure,         # ✅ was missing
        "monthly_emi":          emi,
        "risk_band":            band,
        "credit_score":         bureau["credit_score"],   # ✅ was missing
        "fraud_score":          fraud["fraud_score"],
        "confidence":           risk["confidence"],
        "emi_to_income_ratio":  emi_to_income,  # ✅ was missing
        "loan_to_income_ratio": loan_to_income, # ✅ was missing
    }