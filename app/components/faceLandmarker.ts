export interface FaceLandmarks {
  leftEye: { x: number; y: number };
  rightEye: { x: number; y: number };
  browCenter: { x: number; y: number };
  noseTip: { x: number; y: number };
  mouthCenter: { x: number; y: number };
  chin: { x: number; y: number };
  jawLeft: { x: number; y: number };
  jawRight: { x: number; y: number };
  cheekLeft: { x: number; y: number };
  cheekRight: { x: number; y: number };
  foreheadTop: { x: number; y: number };
}

let cachedLandmarker: any = null;

export async function detectFaceLandmarks(imageUrl: string): Promise<FaceLandmarks | null> {
  try {
    if (!cachedLandmarker) {
      // Disk alanı kullanmamak için paketi doğrudan jsDelivr CDN üzerinden yüklüyoruz
      const vision = await import(
        /* webpackIgnore: true */
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm"
      );
      const filesetResolver = await vision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      cachedLandmarker = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU",
        },
        outputFaceBlendshapes: false,
        runningMode: "IMAGE",
        numFaces: 1,
      });
    }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });

    const result = cachedLandmarker.detect(img);
    if (!result.faceLandmarks || result.faceLandmarks.length === 0) return null;

    const pts = result.faceLandmarks[0];
    const toPct = (idx: number) => ({
      x: Number((pts[idx].x * 100).toFixed(2)),
      y: Number((pts[idx].y * 100).toFixed(2)),
    });

    // MediaPipe 478 nokta haritasındaki kesin anatomik indeksler:
    return {
      leftEye: toPct(468),      // Sol iris merkezi
      rightEye: toPct(473),     // Sağ iris merkezi
      browCenter: toPct(9),     // İki kaş ortası (Glabella)
      noseTip: toPct(1),        // Burun ucu
      mouthCenter: toPct(13),   // Dudak orta hattı
      chin: toPct(152),         // Çene ucu (Menton)
      jawLeft: toPct(172),      // Sol çene köşesi (Gonion)
      jawRight: toPct(397),     // Sağ çene köşesi (Gonion)
      cheekLeft: toPct(234),    // Sol elmacık/şakak sınırı
      cheekRight: toPct(454),   // Sağ elmacık/şakak sınırı
      foreheadTop: toPct(10),   // Alın üst çizgisi
    };
  } catch (err) {
    console.error("MediaPipe yüz tarama hatası:", err);
    return null;
  }
}