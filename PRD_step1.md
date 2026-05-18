# PRD Step 1: Refrigerator Image Recognition

## 1. Overview

Step 1 builds the first usable version of the web application. Users upload or capture a refrigerator photo, and the app uses OpenRouter with `google/gemma-3-27b-it:free` to recognize visible ingredients.

The output of this step is a structured ingredient list that can be reviewed by the user and passed to Step 2 for recipe generation.

## 2. Goals

- Let users submit a refrigerator image from desktop or mobile.
- Send the image to OpenRouter securely through the backend.
- Use `google/gemma-3-27b-it:free` for image recognition.
- Extract visible ingredients into a structured list.
- Allow users to edit, remove, or add ingredients before continuing.

## 3. Non-Goals

- Recipe generation is not included in Step 1.
- User accounts and saved recipes are not included in Step 1.
- Nutrition analysis, allergy filtering, and grocery ordering are out of scope.
- The app does not guarantee detection of hidden, expired, or unlabeled ingredients.

## 4. Target Users

- People who want to decide what to cook from ingredients already in their refrigerator.
- Users who prefer taking a photo instead of manually entering ingredients.
- Mobile-first users who may upload a quick refrigerator photo from a phone.

## 5. User Flow

1. User opens the web app.
2. User uploads or captures a refrigerator image.
3. App previews the selected image.
4. User clicks "Analyze Image".
5. Backend sends the image to OpenRouter using `google/gemma-3-27b-it:free`.
6. App displays detected ingredients with confidence or notes when available.
7. User edits the ingredient list.
8. User confirms the list for the next step.

## 6. Functional Requirements

### 6.1 Image Input

- The app must support image upload from local files.
- The app should support mobile camera capture through the browser when available.
- Supported formats: JPEG, PNG, and WebP.
- Maximum image size should be limited before upload, initially 10 MB.
- The UI must show a preview before analysis.

### 6.2 Image Validation

- The app must reject unsupported file types.
- The app must show a clear error if the image is too large.
- The app should warn users when the image is blurry, dark, or likely not a refrigerator photo if the model indicates that.

### 6.3 OpenRouter Integration

- The frontend must never receive or expose `OPENROUTER_API_KEY`.
- The backend must read `OPENROUTER_API_KEY` from `.env`.
- The backend must call OpenRouter Chat Completions API.
- The model must be `google/gemma-3-27b-it:free`.
- The request must include the image as a data URL or another provider-compatible format.

### 6.4 Ingredient Recognition

- The model prompt must ask for visible refrigerator ingredients only.
- The model response should be requested as JSON.
- The app must parse the response into an editable ingredient list.
- Each ingredient should include:
  - `name`: normalized ingredient name.
  - `quantity_hint`: optional visible quantity estimate.
  - `confidence`: optional low, medium, or high.
  - `notes`: optional description such as "partially visible" or "brand label unclear".

### 6.5 Ingredient Review

- Users must be able to add ingredients manually.
- Users must be able to rename ingredients.
- Users must be able to delete incorrect ingredients.
- The final confirmed list must be stored in client state for Step 2.

## 7. Suggested API Contract

### Endpoint

`POST /api/recognize-ingredients`

### Request

```json
{
  "image": "data:image/jpeg;base64,..."
}
```

### Response

```json
{
  "ingredients": [
    {
      "name": "egg",
      "quantity_hint": "about 6",
      "confidence": "high",
      "notes": "visible in carton"
    }
  ],
  "image_quality_notes": [],
  "model": "google/gemma-3-27b-it:free"
}
```

## 8. Prompt Requirements

The backend prompt should instruct the model to:

- Identify only food ingredients visible in the image.
- Avoid guessing hidden items.
- Normalize names into common cooking ingredient names.
- Return valid JSON only.
- Include uncertainty in `confidence` or `notes`.

## 9. Error Handling

- If OpenRouter returns a rate limit error, show a retry message.
- If the model returns invalid JSON, attempt one server-side repair or retry.
- If no ingredients are found, let the user manually add ingredients.
- If API authentication fails, show a generic service configuration error without exposing secrets.

## 10. Success Metrics

- At least 90% of valid image uploads complete without technical failure.
- Users can correct the ingredient list within one screen.
- Median image recognition response time is under 20 seconds.
- The confirmed ingredient list is available for Step 2 without re-uploading the image.

## 11. Acceptance Criteria

- A user can upload a refrigerator photo and receive an ingredient list.
- The OpenRouter API key is used only on the backend.
- The backend calls `google/gemma-3-27b-it:free`.
- The user can edit the detected ingredient list.
- The final ingredient list is represented as structured data ready for recipe generation.
