"use client";

import React, { useEffect, useState } from "react";

interface Point {
  x: number;
  y: number;
}

interface FaceLandmarks {
  leftEye: Point;
  rightEye: Point;
  browCenter: Point;
  noseTip: Point;
  chin: Point;
  jawLeft: Point;
  jawRight: Point;
  cheekLeft: Point;
  cheekRight: Point;
  foreheadTop: Point;
}

const FALLBACK_LANDMARKS: FaceLandmarks = {
  foreheadTop: { x: 50, y: 17 },
  browCenter: { x: 50, y: 36 },
  leftEye: { x: 40, y: 42 },
  rightEye: { x: 60, y: 42 },
  cheekLeft: { x: 32, y: 49 },
  cheekRight: { x: 68, y: 49 },
  noseTip: { x: 50, y: 56 },
  jawLeft: { x: 35, y: 69 },
  jawRight: { x: 65, y: 69 },
  chin: { x: 50, y: 83 },
};

let cachedLandmarker: any = null;

async function detectFaceLandmarks(imageUrl: string): Promise<FaceLandmarks | null> {
  try {
    if (!cachedLandmarker) {
      const cdnUrl = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/+esm";
      const dynamicImport = new Function("u", "return import(u)");
      const vision = await dynamicImport(cdnUrl);
      const filesetResolver = await vision.FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
      );
      cachedLandmarker = await vision.FaceLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
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
    if (!result?.faceLandmarks || result.faceLandmarks.length === 0) return null;

    const pts = result.faceLandmarks[0];
    const targetAspect = 4 / 3;
    const imgAspect = img.naturalWidth / img.naturalHeight;

    const mapRaw = (rawX: number, rawY: number): Point => {
      let x = rawX;
      let y = rawY;
      if (imgAspect > targetAspect) {
        const scale = imgAspect / targetAspect;
        x = (x - 0.5) * scale + 0.5;
      } else {
        const scale = targetAspect / imgAspect;
        y = (y - 0.5) * scale + 0.5;
      }
      return {
        x: Math.max(5, Math.min(95, Number((x * 100).toFixed(2)))),
        y: Math.max(5, Math.min(95, Number((y * 100).toFixed(2)))),
      };
    };

    const toPct = (idx: number): Point => mapRaw(pts[idx].x, pts[idx].y);
    const midPct = (a: number, b: number): Point =>
      mapRaw((pts[a].x + pts[b].x) / 2, (pts[a].y + pts[b].y) / 2);

    return {
      leftEye: midPct(33, 133),
      rightEye: midPct(362, 263),
      browCenter: toPct(9),
      noseTip: toPct(1),
      chin: toPct(152),
      jawLeft: toPct(172),
      jawRight: toPct(397),
      cheekLeft: toPct(234),
      cheekRight: toPct(454),
      foreheadTop: toPct(10),
    };
  } catch {
    return null;
  }
}

interface Props {
  imageSrc: string;
  showLines: boolean;
}

export default function FaceMeshOverlay({ imageSrc, showLines }: Props) {
  const [landmarks, setLandmarks] = useState<FaceLandmarks>(FALLBACK_LANDMARKS);

  useEffect(() => {
    let active = true;
    setLandmarks(FALLBACK_LANDMARKS);
    detectFaceLandmarks(imageSrc).then((data) => {
      if (active && data) setLandmarks(data);
    });
    return () => {
      active = false;
    };
  }, [imageSrc]);

  if (!showLines) return null;

  const {
    leftEye,
    rightEye,
    browCenter,
    noseTip,
    chin,
    jawLeft,
    jawRight,
    cheekLeft,
    cheekRight,
    foreheadTop,
  } = landmarks;

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 z-10 h-full w-full"
    >
      {/* Dikey simetri ekseni */}
      <line
        x1={foreheadTop.x}
        y1={foreheadTop.y}
        x2={chin.x}
        y2={chin.y}
        stroke="rgba(56, 189, 248, 0.75)"
        strokeWidth="0.55"
        strokeDasharray="1.8 1.4"
      />
      {/* Göz hizası yatay ekseni */}
      <line
        x1={cheekLeft.x}
        y1={leftEye.y}
        x2={cheekRight.x}
        y2={rightEye.y}
        stroke="#38BDF8"
        strokeWidth="0.65"
      />
      {/* Kaş ve burun üçlü oran çizgileri */}
      <line
        x1={cheekLeft.x}
        y1={browCenter.y}
        x2={cheekRight.x}
        y2={browCenter.y}
        stroke="rgba(56, 189, 248, 0.55)"
        strokeWidth="0.5"
      />
      <line
        x1={cheekLeft.x}
        y1={noseTip.y}
        x2={cheekRight.x}
        y2={noseTip.y}
        stroke="rgba(56, 189, 248, 0.55)"
        strokeWidth="0.5"
      />
      {/* Elmacık - çene dış konturu */}
      <polyline
        points={`${cheekLeft.x},${cheekLeft.y} ${jawLeft.x},${jawLeft.y} ${chin.x},${chin.y} ${jawRight.x},${jawRight.y} ${cheekRight.x},${cheekRight.y}`}
        fill="none"
        stroke="#FAFAFA"
        strokeWidth="0.8"
        strokeOpacity="0.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Ölçüm düğüm noktaları */}
      {[leftEye, rightEye, chin, noseTip, browCenter].map((pt, i) => (
        <g key={`ice-${i}`}>
          <circle cx={pt.x} cy={pt.y} r="1.8" fill="rgba(56, 189, 248, 0.28)" />
          <circle cx={pt.x} cy={pt.y} r="0.95" fill="#38BDF8" />
        </g>
      ))}
      {[jawLeft, jawRight, cheekLeft, cheekRight].map((pt, i) => (
        <circle key={`jaw-${i}`} cx={pt.x} cy={pt.y} r="0.95" fill="#FAFAFA" />
      ))}
    </svg>
  );
}
