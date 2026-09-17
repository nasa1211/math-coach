// components/ImageCropperModal.tsx
"use client";

import React, { useState, useCallback } from "react";
import Cropper, { Area, Point } from "react-easy-crop";
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
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const onCropChange = (newCrop: Point) => setCrop(newCrop);
  const onZoomChange = (newZoom: number) => setZoom(newZoom);

  const handleCropComplete = useCallback(
    (_croppedArea: Area, currentCroppedAreaPixels: Area) => {
      setCroppedAreaPixels(currentCroppedAreaPixels);
    },
    []
  );

  const handleDone = async () => {
    if (!croppedAreaPixels) return;
    try {
      setIsProcessing(true);
      const { blob, url } = await getCroppedImg(imageSrc, croppedAreaPixels);
      onCropComplete(blob, url);
    } catch (e) {
      console.error("크롭 처리 실패:", e);
      alert("이미지 자르기에 실패했습니다. 원본을 사용합니다.");
      onCancel();
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col w-screen h-[100dvh] overflow-hidden select-none">
      {/* 1. 상단 바: 안전 영역(Safe Area) 패딩 반영 */}
      <div className="shrink-0 px-4 py-3 bg-slate-900/90 text-white flex items-center justify-between border-b border-slate-800 pt-[env(safe-area-inset-top,12px)]">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-1.5">
            <span>✂️</span>
            <span>문제 영역 맞추기</span>
          </h3>
          <p className="text-[11px] text-slate-400">
            두 손가락으로 확대하거나 드래그하여 문제만 맞춰주세요
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

      {/* 2. 크롭 캔버스: 화면 중간 영역을 100% 꽉 채움 */}
      <div className="relative w-full flex-1 bg-black touch-none">
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={undefined} /* 자유 비율 */
          onCropChange={onCropChange}
          onZoomChange={onZoomChange}
          onCropComplete={handleCropComplete}
          showGrid={true}
          style={{
            containerStyle: {
              width: "100%",
              height: "100%",
              backgroundColor: "#000000",
            },
          }}
        />
      </div>

      {/* 3. 하단 컨트롤 바: 확대 슬라이더 + 버튼 2개 + 아이폰 하단 홈 바 여백 */}
      <div className="shrink-0 p-4 bg-slate-900/95 text-white border-t border-slate-800 space-y-3 pb-[calc(env(safe-area-inset-bottom,12px)+12px)]">
        {/* 확대 슬라이더 */}
        <div className="flex items-center gap-3 px-1">
          <span className="text-xs font-semibold text-slate-400 shrink-0">
            🔍 확대
          </span>
          <input
            type="range"
            value={zoom}
            min={1}
            max={3}
            step={0.1}
            aria-label="확대 비율"
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full accent-indigo-500 h-1.5 bg-slate-700 rounded-lg cursor-pointer"
          />
        </div>

        {/* 하단 액션 버튼 */}
        <div className="flex gap-2.5">
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
              <span>이 영역으로 선택 완료</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}