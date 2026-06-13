import os
import tempfile
from groq import Groq
from dotenv import load_dotenv

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))


def transcribe_audio(audio_bytes: bytes) -> str:
    with tempfile.NamedTemporaryFile(suffix=".webm", delete=False) as f:
        f.write(audio_bytes)
        path = f.name

    try:
        print("Audio size:", len(audio_bytes))

        with open(path, "rb") as audio_file:
            result = client.audio.translations.create(
                model="whisper-large-v3",
                file=audio_file,
                response_format="text",
                temperature=0.0,
                prompt="Loan application."   # ✅ short prompt only
            )

        transcript = str(result).strip()
        print("Transcript:", transcript)
        return transcript

    except Exception as e:
        print("STT Error:", e)
        return ""

    finally:
        try:
            os.unlink(path)
        except:
            pass