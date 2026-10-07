import { convertToPixelCrop, type Crop, type PixelCrop } from "react-image-crop";

export function selectionPixelCrop(
  completedCrop: PixelCrop | null,
  crop: Crop | undefined,
  width: number,
  height: number
): PixelCrop | null {
  if (completedCrop && completedCrop.width > 0 && completedCrop.height > 0) {
    return completedCrop;
  }
  if (!crop || width <= 0 || height <= 0) return null;

  const pixel = convertToPixelCrop(crop, width, height);
  if (pixel.width <= 0 || pixel.height <= 0) return null;
  return pixel;
}
