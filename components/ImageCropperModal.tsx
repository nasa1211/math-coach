// components/ImageCropperModal.tsx
"use client";

import React, { useState, useRef } from "react";
import ReactCrop, { Crop, PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";
import getCroppedImg from "@/utils/cropImage";

interface ImageCropperModalProps {
  imageSrc: string;
  onCropComplete: (croppedBlob: Blob, croppedUrl: string) => void;
  onCancel: () => void;
}

export default function ImageCropperModal({
  imageSrc,
  onCropComplete,
  onCancel,
}: ImageCropperModalProps) {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  // 이미지가 로드되었을 때 화면 중앙 80% 영역을 초기 사각형으로 지정
  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const { width, height } = e.currentTarget;
    const initialCrop = centerCrop(
      {
        unit: "%",
        width: 85,
        height: 60,
      },
      width,
      height
    );
    setCrop(initialCrop);
  };

  const handleDone = async () => {
    if (!imgRef.current) return;

    // 만약 사용자가 박스를 전혀 조절하지 않았다면 원본 그대로 진행
    if (!completedCrop || completedCrop.width === 0 || completedCrop.height === 0) {
      onCancel();
      return;
    }

    try {
      setIsProcessing(true);
      const { blob, url } = await getCroppedImg(imgRef.current, completedCrop);
      onCropComplete(blob, url);
    } catch (e) {
      console.error("크롭 처리 실패:", e);
      alert("영역 자르기에 실패했습니다. 원본 사진을 사용합니다.");
      onCancel();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col w-screen h-[100dvh] overflow-hidden select-none">
      {/* 1. 상단 바: 안전 영역(Safe Area) 패딩 반영 */}
      <div className="shrink-0 px-4 py-3 bg-slate-900/95 text-white flex items-center justify-between border-b border-slate-800 pt-[calc(env(safe-area-inset-top,12px)+6px)]">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-1.5">
            <span>✂️</span>
            <span>문제 영역 사각형 조절</span>
          </h3>
          <p className="text-[11px] text-slate-400">
            네 모서리나 모서리 변을 드래그해 문제 크기에 맞추세요
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="text-slate-400 hover:text-white text-xs font-bold px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 active:scale-95 transition-transform"
        >
          취소
        </button>
      </div>

      {/* 2. 크롭 영역: 사진 중앙 배치 및 터치 드래그 박스 */}
      <div className="relative w-full flex-1 bg-black flex items-center justify-center p-2 overflow-auto touch-none">
        <ReactCrop
          crop={crop}
          onChange={(_, percentCrop) => setCrop(percentCrop)}
          onComplete={(c) => setCompletedCrop(c)}
          aspect={undefined} /* 자유 비율 (가로/세로 문제 모양에 맞춤) */
          className="max-h-[75dvh] max-w-full"
        >
          <img
            ref={imgRef}
            alt="크롭 대상 문제집"
            src={imageSrc}
            onLoad={onImageLoad}
            className="max-h-[75dvh] max-w-full object-contain block"
          />
        </ReactCrop>
      </div>

      {/* 3. 하단 액션 바 */}
      <div className="shrink-0 p-4 bg-slate-900/95 text-white border-t border-slate-800 flex gap-2.5 pb-[calc(env(safe-area-inset-bottom,12px)+12px)]">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 active:bg-slate-700 text-slate-300 rounded-xl font-bold text-xs sm:text-sm transition-colors"
        >
          원본 전체 사용
        </button>
        <button
          type="button"
          disabled={isProcessing}
          onClick={handleDone}
          className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
        >
          {isProcessing ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>자르는 중...</span>
            </>
          ) : (
            <span>선택 영역 자르기 완료</span>
          )}
        </button>
      </div>
    </div>
  );
}