# 초·중등 수학 홈코치

문제집 사진을 올리면 Gemini가 채점하거나, 아직 풀지 않은 문제의 풀이와 지도 팁을 정리합니다.

## 실행

```bash
npm install
npm run dev
```

브라우저에서 [http://localhost:3000](http://localhost:3000)을 엽니다.

## 환경 변수

`.env.example`을 참고해 로컬 또는 배포 환경에 넣습니다.

- `GEMINI_API_KEY`: Gemini API 키
- `ACCESS_PASSCODE`: 화면 잠금에 쓰는 접근 암호

기본 채점 모델은 Gemini 3.6 Flash입니다. 설정에서 더 정확하게를 켜면 Gemini 3.1 Pro를 사용합니다.
