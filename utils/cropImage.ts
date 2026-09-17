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

  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  const cropX = crop.x * scaleX;
  const cropY = crop.y * scaleY;
  const cropWidth = crop.width * scaleX;
  const cropHeight = crop.height * scaleY;

  canvas.width = Math.floor(cropWidth);
  canvas.height = Math.floor(cropHeight);

  // 미세한 연필선/기호 번짐 방지
  ctx.imageSmoothingEnabled = true;
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
      0.92 // 0.92: 4.5MB 한도 내에서 텍스트 윤곽선이 뭉개지지 않는 최적 수치
    );
  });
}