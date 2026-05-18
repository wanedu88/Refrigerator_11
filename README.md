# Refrigerator Recipe Assistant

OpenRouter API를 사용해 냉장고 사진에서 재료를 인식하고, 인식된 재료를 바탕으로 레시피를 추천하는 웹 애플리케이션입니다.

## Features

- 냉장고 이미지 업로드 및 미리보기
- OpenRouter 기반 재료 인식 API
- 인식된 재료의 추가, 수정, 삭제
- 확정된 재료를 기반으로 레시피 생성
- 레시피 카드 및 상세 보기
- Cursor 코드 리뷰어 에이전트 설정

## Requirements

- Node.js 18 이상
- OpenRouter API 키

## Setup

1. 환경변수 파일을 준비합니다.

```bash
cp .env.example .env
```

2. `.env`에 OpenRouter API 키를 입력합니다.

```env
OPENROUTER_API_KEY=sk-or-v1-your-key-here
```

3. 앱을 실행합니다.

```bash
npm start
```

4. 브라우저에서 접속합니다.

```text
http://localhost:3000
```

## API Endpoints

- `GET /api/health`: 앱과 모델 설정 확인
- `POST /api/recognize-ingredients`: 이미지에서 재료 인식
- `POST /api/generate-recipes`: 확정된 재료로 레시피 생성

## Project Structure

```text
.
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── server.js
├── PRD_step1.md
├── PRD_step2.md
├── PRD_step3.md
├── package.json
└── .env.example
```

## Security Notes

- 실제 API 키가 들어 있는 `.env`는 Git에 커밋하지 않습니다.
- 프론트엔드는 OpenRouter API 키를 직접 사용하지 않습니다.
- API 키는 서버의 환경변수에서만 읽습니다.

## Current Model Notes

PRD에 정의된 모델명이 OpenRouter에서 항상 사용 가능한 것은 아닐 수 있습니다. 실행 중 `No endpoints found` 오류가 발생하면 OpenRouter 모델 목록에서 현재 사용 가능한 무료 모델로 교체해야 합니다.
