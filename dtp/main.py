import argparse
import base64
import io
import os
import cv2
import numpy as np
import tensorflow as tf
from insightface.app import FaceAnalysis
from PIL import Image
from rembg import remove
from datetime import datetime
from supabase import create_client, Client # Tambahan library Cloud

class HelmyVirtualTryOn:
    def __init__(self, model_name: str, assets_folder: str):
        self.base_dir = os.path.dirname(os.path.abspath(__file__))
        
        # ─── KONFIGURASI SUPABASE CLOUD ───
        # Ganti dengan kredensial dari dashboard Supabase Anda
        self.SUPABASE_URL = "https://your-project-id.supabase.co"
        self.SUPABASE_KEY = "your-anon-public-key"
        self.supabase: Client = create_client(self.SUPABASE_URL, self.SUPABASE_KEY)
        self.bucket_name = "tryon-images"

        # 1. Inisialisasi Detektor Wajah (InsightFace)
        self.face_app = FaceAnalysis(name='buffalo_l')
        self.face_app.prepare(ctx_id=0, det_size=(640, 640))

        # 2. Load Model Klasifikasi Bentuk Wajah
        model_path = os.path.join(self.base_dir, model_name)
        if not os.path.exists(model_path):
            raise FileNotFoundError(f'File model tidak ditemukan: {model_path}')
        self.model = tf.keras.models.load_model(model_path)
        self.class_names = ['Heart', 'Oval', 'Round', 'Square', 'Oblong']
        
        # 3. Sistem Rekomendasi
        self.recommendations = {
            'Heart': 'Kacamata Aviator / Rimless',
            'Oval': 'Hampir Semua Model (Rectangular)',
            'Round': 'Kacamata Kotak / Rectangular',
            'Square': 'Kacamata Bulat / Oval',
            'Oblong': 'Kacamata Oversized / Frame Tebal'
        }
        
        # 4. Load Assets Kacamata
        self.assets_path = os.path.join(self.base_dir, assets_folder)
        self.glasses_collection = []
        self.current_idx = 0
        self.load_and_clean_assets()

    def save_to_cloud(self, frame: np.ndarray, face_shape: str, recommendation: str):
        """Mengunggah foto langsung ke Cloud Storage & mencatat datanya di Cloud DB"""
        try:
            # 1. Konversi gambar OpenCV (numpy array) langsung ke bentuk byte di memori RAM
            _, buffer = cv2.imencode('.png', frame)
            img_bytes = buffer.tobytes()

            # 2. Buat nama file unik untuk Cloud Storage
            timestamp_str = datetime.now().strftime('%Y%m%d_%H%M%S_%f')
            filename = f"tryon_{timestamp_str}.png"
            
            # 3. Upload file langsung ke Supabase Storage Bucket
            self.supabase.storage.from_(self.bucket_name).upload(
                path=filename,
                file=img_bytes,
                file_options={"content-type": "image/png"}
            )
            
            # 4. Ambil URL Publik foto tersebut yang sudah online di internet
            img_url = self.supabase.storage.from_(self.bucket_name).get_public_url(filename)
            
            # 5. Masukkan data teks beserta URL foto ke tabel Database Supabase
            data = {
                "timestamp": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                "face_shape": face_shape,
                "recommendation": recommendation,
                "image_url": img_url
            }
            self.supabase.table('history_tryon').insert(data).execute()
            print(f"☁️ BERHASIL ONLINE! Data & Foto masuk Cloud Database.")
            print(f"🔗 Link Foto: {img_url}")
            
        except Exception as e:
            print(f"⚠️ Gagal upload ke Cloud Supabase: {e}")

    def load_and_clean_assets(self):
        print('⏳ Memproses background kacamata...')
        if not os.path.exists(self.assets_path):
            os.makedirs(self.assets_path, exist_ok=True)
            return

        files = sorted([f for f in os.listdir(self.assets_path) if f.lower().endswith(('.png', '.jpg', '.jpeg'))])
        for file_name in files:
            img_path = os.path.join(self.assets_path, file_name)
            try:
                input_image = Image.open(img_path)
                output_image = remove(input_image) 
                img_np = np.array(output_image)
                if img_np.shape[2] == 3:
                    img_np = cv2.cvtColor(img_np, cv2.COLOR_RGB2BGRA)
                elif img_np.shape[2] == 4:
                    img_np = cv2.cvtColor(img_np, cv2.COLOR_RGBA2BGRA)
                self.glasses_collection.append(img_np)
                print(f'✅ {file_name} siap.')
            except Exception as exc:
                print(f'⚠️ Gagal muat {file_name}: {exc}')

    def preprocess_face_roi(self, roi: np.ndarray) -> np.ndarray:
        roi = cv2.resize(roi, (288, 288))
        return roi / 255.0

    def classify_face_shape(self, face, frame: np.ndarray) -> str:
        bbox = face.bbox.astype(int)
        h, w, _ = frame.shape
        pad_w = int((bbox[2] - bbox[0]) * 0.15)
        pad_h = int((bbox[3] - bbox[1]) * 0.15)

        x1, y1 = max(0, bbox[0]-pad_w), max(0, bbox[1]-pad_h)
        x2, y2 = min(w, bbox[2]+pad_w), min(h, bbox[3]+pad_h)

        face_roi = frame[y1:y2, x1:x2]
        if face_roi.size == 0: return 'Unknown'
        
        face_roi_rgb = cv2.cvtColor(face_roi, cv2.COLOR_BGR2RGB)
        processed_roi = self.preprocess_face_roi(face_roi_rgb)
        pred = self.model.predict(np.expand_dims(processed_roi, axis=0), verbose=0)
        return self.class_names[int(np.argmax(pred))]

    def overlay_logic(self, frame: np.ndarray, face, glasses_img: np.ndarray) -> np.ndarray:
        kps = face.kps
        left_eye, right_eye = kps[0], kps[1]
        dist = np.linalg.norm(right_eye - left_eye)
        w_glass = int(dist * 2.4)
        h_glass = int(glasses_img.shape[0] * (w_glass / glasses_img.shape[1]))
        cx, cy = int((left_eye[0] + right_eye[0]) / 2), int((left_eye[1] + right_eye[1]) / 2)
        x1, y1 = cx - (w_glass // 2), cy - (h_glass // 2)
        x2, y2 = x1 + w_glass, y1 + h_glass
        if x1 < 0 or y1 < 0 or x2 > frame.shape[1] or y2 > frame.shape[0]:
            return frame
        overlay = cv2.resize(glasses_img, (w_glass, h_glass))
        alpha = overlay[:, :, 3] / 255.0
        for c in range(3):
            frame[y1:y2, x1:x2, c] = (alpha * overlay[:, :, c] + (1 - alpha) * frame[y1:y2, x1:x2, c])
        return frame

    def run_desktop(self) -> None:
        cap = cv2.VideoCapture(0)
        print("Desktop Mode: 'N' Ganti Kacamata, 'S' UPLOAD KE CLOUD DB, 'Q' Keluar.")
        
        last_shape, last_saran = "Unknown", ""
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret: break
            frame = cv2.flip(frame, 1)
            faces = self.face_app.get(frame)

            for face in faces:
                shape = self.classify_face_shape(face, frame)
                saran = self.recommendations.get(shape, "")
                last_shape, last_saran = shape, saran
                bbox = face.bbox.astype(int)

                cv2.putText(frame, f'Bentuk: {shape}', (bbox[0], bbox[1] - 35), 0, 0.7, (0, 255, 0), 2)
                cv2.putText(frame, f'Saran: {saran}', (bbox[0], bbox[1] - 10), 0, 0.6, (0, 255, 255), 2)

                if self.glasses_collection:
                    frame = self.overlay_logic(frame, face, self.glasses_collection[self.current_idx])

            cv2.imshow('Helmy Virtual Try-On', frame)
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'): 
                break
            elif key == ord('n') and self.glasses_collection:
                self.current_idx = (self.current_idx + 1) % len(self.glasses_collection)
            elif key == ord('s'): 
                self.save_to_cloud(frame, last_shape, last_saran)

        cap.release()
        cv2.destroyAllWindows()

    def predict_image(self, image_bytes: bytes, glasses_index: int = 0) -> dict:
        image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        frame = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)

        faces = self.face_app.get(frame)
        result_faces = []
        final_shape, final_saran = "No Face", "No Recommendation"

        for face in faces:
            shape = self.classify_face_shape(face, frame)
            saran = self.recommendations.get(shape, "")
            final_shape, final_saran = shape, saran
            
            if self.glasses_collection:
                idx = glasses_index % len(self.glasses_collection)
                frame = self.overlay_logic(frame, face, self.glasses_collection[idx])
            result_faces.append({'shape': shape, 'recommendation': saran, 'bbox': face.bbox.astype(int).tolist()})

        # Otomatis simpan ke Cloud Database saat mendeteksi wajah via API Web
        if len(faces) > 0:
            self.save_to_cloud(frame, final_shape, final_saran)

        _, buffer = cv2.imencode('.png', frame)
        encoded_image = base64.b64encode(buffer).decode('utf-8')
        return {'image': encoded_image, 'faces': result_faces}

    def create_web_app(self):
        from fastapi import FastAPI, File, UploadFile
        from fastapi.middleware.cors import CORSMiddleware
        from fastapi.responses import HTMLResponse

        app = FastAPI()
        app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])

        @app.get('/', response_class=HTMLResponse)
        async def home():
            return """
            <html>
                <body style="font-family:sans-serif; text-align:center;">
                    <h1>Helmy Virtual Try-On API</h1>
                </body>
            </html>
            """

        @app.post('/predict')
        async def predict(file: UploadFile = File(...), glasses_index: int = 0):
            result = self.predict_image(await file.read(), glasses_index)
            return result

        return app

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--mode', choices=['desktop', 'web'], default='desktop')
    args = parser.parse_args()

    try:
        service = HelmyVirtualTryOn('face_shape_model.h5', 'assets_2d')

        if args.mode == 'desktop':
            service.run_desktop()
        else:
            import uvicorn
            app = service.create_web_app()
            uvicorn.run(app, host='0.0.0.0', port=8000)
    except Exception as e:
        print(f"Terjadi kesalahan: {e}")