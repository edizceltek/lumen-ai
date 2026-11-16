"use client";

import React, { useEffect, useState } from "react";
import { detectFaceLandmarks, FaceLandmarks } from "@/lib/faceLandmarker";

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
      {/* Dikey Simetri Ekseni (Alın -> Kaş -> Burun -> Çene Ucu) */}
      <line
        x1={foreheadTop.x}
        y1={foreheadTop.y}
        x2={chin.x}
        y2={chin.y}
        stroke="rgba(56, 189, 248, 0.55)"
        strokeWidth="0.35"
        strokeDasharray="1.2 1.2"
      />

      {/* Göz Bebekleri Arası Canthal Tilt / IPD Çizgisi */}
      <line
        x1={cheekLeft.x}
        y1={leftEye.y}
        x2={cheekRight.x}
        y2={rightEye.y}
        stroke="#38bdf8"
        strokeWidth="0.45"
      />

      {/* Kaş ve Elmacık Yatay Oran Çizgileri */}
      <line
        x1={cheekLeft.x}
        y1={browCenter.y}
        x2={cheekRight.x}
        y2={browCenter.y}
        stroke="rgba(56, 189, 248, 0.4)"
        strokeWidth="0.35"
      />
      <line
        x1={cheekLeft.x}
        y1={noseTip.y}
        x2={cheekRight.x}
        y2={noseTip.y}
        stroke="rgba(56, 189, 248, 0.4)"
        strokeWidth="0.35"
      />

      {/* Çene Hattı (Jawline & Gonial Açı Vektörü) */}
      <polyline
        points={`${jawLeft.x},${jawLeft.y} ${chin.x},${chin.y} ${jawRight.x},${jawRight.y}`}
        fill="none"
        stroke="#ffffff"
        strokeWidth="0.65"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Anatomik Nokta İşaretçileri */}
      {[leftEye, rightEye, chin].map((pt, i) => (
        <circle key={i} cx={pt.x} cy={pt.y} r="0.95" fill="#38bdf8" />
      ))}
      {[jawLeft, jawRight].map((pt, i) => (
        <circle key={i} cx={pt.x} cy={pt.y} r="0.95" fill="#ffffff" />
      ))}
    </svg>
  );
}