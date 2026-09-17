// utils/exportImage.ts
import { toPng, toBlob } from "html-to-image";

/**
 * 특정 HTML 요소를 PNG 이미지로 다운로드하거나 모바일 공유 시트(카카오톡 등)를 띄웁니다.
 */
export async function shareOrDownloadElement(
  element: HTMLElement,
  fileName: string = "math-coach-report",
  title: string = "수학 홈코치 AI 분석 리포트"
) {
  try {
    // 1. 고화질 이미지 Blob 생성 (scale: 2로 레티나/고해상도 대응)
    const blob = await toBlob(element, {
      quality: 0.95,
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: document.documentElement.classList.contains("dark")
        ? "#0f172a"
        : "#ffffff",
    });

    if (!blob) {
      throw new Error("이미지 생성에 실패했습니다.");
    }

    const file = new File([blob], `${fileName}.png`, { type: "image/png" });

    // 2. 모바일 네이티브 공유(카카오톡, 에어드롭, 메시지 등) 지원 여부 확인
    if (
      typeof navigator !== "undefined" &&
      navigator.canShare &&
      navigator.canShare({ files: [file] })
    ) {
      await navigator.share({
        title,
        text: "수학 홈코치 AI 분석 결과입니다.",
        files: [file],
      });
      return { success: true, method: "share" };
    }

    // 3. 네이티브 파일 공유가 미지원되는 브라우저/PC에서는 다운로드 진행
    const dataUrl = await toPng(element, {
      quality: 0.95,
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: document.documentElement.classList.contains("dark")
        ? "#0f172a"
        : "#ffffff",
    });

    const link = document.createElement("a");
    link.download = `${fileName}.png`;
    link.href = dataUrl;
    link.click();

    return { success: true, method: "download" };
  } catch (error: any) {
    // 사용자가 모바일 공유창에서 '취소'를 누른 경우는 에러로 처리하지 않음
    if (error.name === "AbortError") {
      return { success: false, aborted: true };
    }
    console.error("이미지 내보내기/공유 에러:", error);
    throw error;
  }
}