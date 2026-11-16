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

    const toPct = (idx: number): Point => {
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

interface Props {
  imageSrc: string;
  showLines: boolean;
}

export default function FaceMeshOverlay({ imageSrc, showLines }: Props) {
  const [landmarks, setLandmarks] = useState<FaceLandmarks | null>(null);

  useEffect(() => {
    let active = true;
    detectFaceLandmarks(imageSrc).then((data) => {
      if (active && data) setLandmarks(data);
    });
    return () => {
      active = false;
    };
  }, [imageSrc]);

  if (!showLines || !landmarks) return null;

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
      className="pointer-events-none absolute inset-0 h-full w-full"
    >
      <line
        x1={foreheadTop.x}
        y1={foreheadTop.y}
        x2={chin.x}
        y2={chin.y}
        stroke="rgba(56, 189, 248, 0.55)"
        strokeWidth="0.35"
        strokeDasharray="1.5 1.5"
      />
      <line
        x1={cheekLeft.x}
        y1={leftEye.y}
        x2={cheekRight.x}
        y2={rightEye.y}
        stroke="#38BDF8"
        strokeWidth="0.4"
      />
      <line
        x1={cheekLeft.x}
        y1={browCenter.y}
        x2={cheekRight.x}
        y2={browCenter.y}
        stroke="rgba(56, 189, 248, 0.45)"
        strokeWidth="0.35"
      />
      <line
        x1={cheekLeft.x}
        y1={noseTip.y}
        x2={cheekRight.x}
        y2={noseTip.y}
        stroke="rgba(56, 189, 248, 0.45)"
        strokeWidth="0.35"
      />
      <polyline
        points={`${jawLeft.x},${jawLeft.y} ${chin.x},${chin.y} ${jawRight.x},${jawRight.y}`}
        fill="none"
        stroke="#FAFAFA"
        strokeWidth="0.55"
        strokeOpacity="0.85"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {[leftEye, rightEye, chin].map((pt, i) => (
        <circle key={i} cx={pt.x} cy={pt.y} r="0.9" fill="#38BDF8" />
      ))}
      {[jawLeft, jawRight].map((pt, i) => (
        <circle key={i} cx={pt.x} cy={pt.y} r="0.9" fill="#FAFAFA" />
      ))}
    </svg>
  );
}
