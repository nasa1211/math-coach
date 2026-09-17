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
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      {/* 모달 박스: 모바일 주소창을 고려해 90dvh / flex-col 구성 */}
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[90dvh] max-h-[750px] min-h-[460px] border border-slate-200 dark:border-slate-800 transition-colors">
        {/* 1. 상단 타이틀 바 */}
        <div className="px-5 py-3.5 shrink-0 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>✂️</span>
              <span>문제 영역 자르기</span>
            </h3>
            <p className="text-[11px] sm:text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              분석할 문제 영역만 사각형 안에 맞춰주세요
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs sm:text-sm font-bold px-2 py-1 transition-colors"
          >
            취소
          </button>
        </div>

        {/* 2. 핵심 크롭 캔버스 뷰포트 (높이가 0이 되지 않도록 w-full flex-1 relative min-h-[260px] 명시) */}
        <div className="relative w-full flex-1 min-h-[260px] bg-slate-950 overflow-hidden select-none touch-none">
          <Cropper
            image={imageSrc}
            crop={crop}
            zoom={zoom}
            aspect={undefined} /* 자유 비율 (가로/세로 문제 모양에 맞춤) */
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={handleCropComplete}
            showGrid={true}
            style={{
              containerStyle: {
                width: "100%",
                height: "100%",
                backgroundColor: "#020617",
              },
            }}
          />
        </div>

        {/* 3. 하단 확대 조절 슬라이더 및 액션 버튼 바 */}
        <div className="p-4 shrink-0 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 space-y-3">
          {/* 줌 조절 슬라이더 */}
          <div className="flex items-center gap-3 px-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0">
              🔍 확대
            </span>
            <input
              type="range"
              value={zoom}
              min={1}
              max={3}
              step={0.1}
              aria-label="줌 조절"
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-full accent-indigo-600 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg cursor-pointer"
            />
          </div>

          {/* 버튼 영역 */}
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-xs sm:text-sm transition-colors"
            >
              원본 전체 사용
            </button>
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleDone}
              className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md shadow-indigo-200 dark:shadow-none transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
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
    </div>
  );
}