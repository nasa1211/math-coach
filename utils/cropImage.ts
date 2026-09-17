// utils/cropImage.ts
import { PixelCrop } from "react-image-crop";

export default async function getCroppedImg(
  image: HTMLImageElement,
  crop: PixelCrop
): Promise<{ blob: Blob; url: string }> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas context를 생성할 수 없습니다.");
  }

  // 화면에 렌더링된 이미지와 실제 원본 이미지 해상도의 비율 계산
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  // 잘라낼 실제 픽셀 크기
  const cropX = crop.x * scaleX;
  const cropY = crop.y * scaleY;
  const cropWidth = crop.width * scaleX;
  const cropHeight = crop.height * scaleY;

  canvas.width = Math.floor(cropWidth);
  canvas.height = Math.floor(cropHeight);

  // 안티앨리어싱 및 이미지 품질 보정
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(
    image,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    Math.floor(cropWidth),
    Math.floor(cropHeight)
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("캔버스 변환 실패"));
          return;
        }
        const fileUrl = URL.createObjectURL(blob);
        resolve({ blob, url: fileUrl });
      },
      "image/jpeg",
      0.98
    );
  });
}