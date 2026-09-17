// utils/cropImage.ts
import { Area } from "react-easy-crop";

export const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image));
    image.addEventListener("error", (error) => reject(error));
    image.setAttribute("crossOrigin", "anonymous");
    image.src = url;
  });

export default async function getCroppedImg(
  imageSrc: string,
  pixelCrop: Area
): Promise<{ blob: Blob; url: string }> {
  const image = await createImage(imageSrc);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("캔버스 컨텍스트를 생성할 수 없습니다.");
  }

  // 캔버스 크기를 잘라낸 영역 크기로 설정
  canvas.width = pixelCrop.width;
  canvas.height = pixelCrop.height;

  // 원본 이미지에서 잘라낼 영역만 캔버스에 그리기
  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    pixelCrop.width,
    pixelCrop.height
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("캔버스 생성 실패"));
          return;
        }
        const fileUrl = URL.createObjectURL(blob);
        resolve({ blob, url: fileUrl });
      },
      "image/jpeg",
      0.9
    );
  });
}