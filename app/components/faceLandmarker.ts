export interface FaceLandmarks {
  leftEye: { x: number; y: number };
  rightEye: { x: number; y: number };
  browCenter: { x: number; y: number };
  noseTip: { x: number; y: number };
  chin: { x: number; y: number };
  jawLeft: { x: number; y: number };
  jawRight: { x: number; y: number };
  cheekLeft: { x: number; y: number };
  cheekRight: { x: number; y: number };
  foreheadTop: { x: number; y: number };
}

let cachedLandmarker: any = null;

async function loadVisionModule(): Promise<any> {
  const cdnUrl = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm";
  // Turbopack'in statik analizini atlatmak için dinamik Function çağrısı
  const dynamicImport = new Function("u", "return import(u)");
  return dynamicImport(cdnUrl);
}

export async function detectFaceLandmarks(imageUrl: string): Promise<FaceLandmarks | null> {
  try {
    if (!cachedLandmarker) {
      const vision = await loadVisionModule();
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
    const targetAspect = 4 / 3;
    const imgAspect = img.naturalWidth / img.naturalHeight;

    const toPct = (idx: number) => {
      let x = pts[idx].x;
      let y = pts[idx].y;

      if (imgAspect > targetAspect) {
        const scale = imgAspect / targetAspect;
        x = (x - 0.5) * scale + 0.5;
      } else {
        const scale = targetAspect / imgAspect;
        y = (y - 0.5) * scale + 0.5;
      }

      return {
        x: Number((x * 100).toFixed(2)),
        y: Number((y * 100).toFixed(2)),
      };
    };

    return {
      leftEye: toPct(468),
      rightEye: toPct(473),
      browCenter: toPct(9),
      noseTip: toPct(1),
      chin: toPct(152),
      jawLeft: toPct(172),
      jawRight: toPct(397),
      cheekLeft: toPct(234),
      cheekRight: toPct(454),
      foreheadTop: toPct(10),
    };
  } catch (err) {
    console.error("MediaPipe yüz tarama hatası:", err);
    return null;
  }
}
