import os
import json
from groq import Groq
from dotenv import load_dotenv

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))


def extract_loan_data(transcript: str) -> dict:
    if not transcript or len(transcript.strip()) < 10:
        return {}

    try:
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": "You are a loan officer assistant. Extract information from transcripts and return valid JSON only."
                },
                {
                    "role": "user",
                    "content": f"""Extract the following fields from this loan application transcript and return as a JSON object:
- full_name (string or null)
- employment_type ("salaried", "self_employed", "unemployed", or null)
- monthly_income (number in rupees or null)
- loan_purpose (string or null)
- loan_amount_requested (number or null)
- verbal_consent_given (true or false)

If a field is not mentioned, return null for it.

Transcript:
{transcript}"""
                }
            ],
            timeout=8
        )

        content = response.choices[0].message.content
        print("LLM RAW:", content)
        return json.loads(content)

    except Exception as e:
        print("❌ LLM Extraction Error:", e)
        return {}


def classify_risk(loan_data: dict) -> dict:
    if not loan_data:
        return {
            "risk_band": "HIGH",
            "risk_score": 90,
            "reasons": ["No data extracted from call"],
            "eligible": False
        }

    try:
        response = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": "You are an NBFC credit risk classifier. Analyze applicant data and return a JSON risk assessment."
                },
                {
                    "role": "user",
                    "content": f"""Assess the credit risk for this loan applicant and return a JSON object with fields: risk_band, risk_score, reasons, eligible.

Applicant details:
- Employment: {loan_data.get('employment_type')}
- Monthly Income: ₹{loan_data.get('monthly_income')}
- Loan Purpose: {loan_data.get('loan_purpose')}
- Verbal Consent Given: {loan_data.get('verbal_consent_given')}

Return JSON with:
- risk_band: "LOW", "MEDIUM", or "HIGH"
- risk_score: number 0-100
- reasons: array of strings explaining the assessment
- eligible: true or false"""
                }
            ],
            timeout=8
        )

        content = response.choices[0].message.content
        print("Risk RAW:", content)
        return json.loads(content)

    except Exception as e:
        print("❌ Risk Error:", e)
        return {
            "risk_band": "HIGH",
            "risk_score": 95,
            "reasons": ["Risk classification failed"],
            "eligible": False
        }