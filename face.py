import cv2
import numpy as np

# 🔥 IMAGE ENHANCEMENT (for ID photos)
def enhance_id_photo(img):
    try:
        img = cv2.resize(img, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)

        kernel = np.array([[0,-1,0],[-1,5,-1],[0,-1,0]])
        img = cv2.filter2D(img, -1, kernel)

        img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        img = cv2.equalizeHist(img)

        img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

        return img
    except:
        return img


import cv2
import numpy as np

def preprocess_face(img):
    try:
        # Resize for consistency
        img = cv2.resize(img, (640, 480))

        # Convert to YCrCb for brightness correction
        ycrcb = cv2.cvtColor(img, cv2.COLOR_BGR2YCrCb)
        y, cr, cb = cv2.split(ycrcb)

        # Equalize brightness
        y = cv2.equalizeHist(y)

        # Merge back
        ycrcb = cv2.merge((y, cr, cb))
        img = cv2.cvtColor(ycrcb, cv2.COLOR_YCrCb2BGR)

        # Slight blur to remove noise
        img = cv2.GaussianBlur(img, (3, 3), 0)

        return img
    except:
        return img


# 🔥 FACE ANALYSIS (IMPROVED)
def analyze_face(image_bytes: bytes):
    try:
        from deepface import DeepFace

        np_arr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)

        if img is None:
            return {"age": None, "valid_face": False}

        img = preprocess_face(img)

        ages = []

        # 🔥 MULTIPLE PASSES (stabilizes prediction)
        for _ in range(3):
            result = DeepFace.analyze(
                img,
                actions=['age'],
                enforce_detection=False,
                detector_backend='opencv',
                silent=True
            )

            age = result[0].get('age')
            if age:
                ages.append(age)

        if not ages:
            return {"age": None, "valid_face": False}

        # 🔥 REMOVE OUTLIERS
        median_age = np.median(ages)
        filtered = [a for a in ages if abs(a - median_age) < 10]

        final_age = int(np.mean(filtered)) if filtered else int(median_age)

        print("Raw ages:", ages)
        print("Final age:", final_age)

        return {
            "age": final_age,
            "valid_face": True
        }

    except Exception as e:
        print("Face error:", e)
        return {"age": None, "valid_face": False}


# 🔥 LIVENESS CHECK
def check_liveness(frame1_bytes: bytes, frame2_bytes: bytes):
    try:
        arr1 = np.frombuffer(frame1_bytes, np.uint8)
        arr2 = np.frombuffer(frame2_bytes, np.uint8)

        img1 = cv2.imdecode(arr1, cv2.IMREAD_GRAYSCALE)
        img2 = cv2.imdecode(arr2, cv2.IMREAD_GRAYSCALE)

        if img1 is None or img2 is None:
            return False

        img2 = cv2.resize(img2, (img1.shape[1], img1.shape[0]))

        diff = cv2.absdiff(img1, img2)
        score = np.sum(diff)

        return bool(score > 200000)

    except:
        return False