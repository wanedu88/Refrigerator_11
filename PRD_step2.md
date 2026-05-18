# PRD Step 2: Recipe Generation

## 1. Overview

Step 2 uses the confirmed ingredient list from Step 1 to generate practical recipe recommendations. The app sends the ingredients and optional user preferences to OpenRouter using `deepseek/deepseek-chat-v3.1:free`.

The output of this step is a set of recipe cards with ingredients, cooking steps, time estimates, and notes about missing optional ingredients.

## 2. Goals

- Generate recipes from recognized refrigerator ingredients.
- Use `deepseek/deepseek-chat-v3.1:free` through OpenRouter.
- Produce recipes that are realistic, concise, and easy to cook.
- Highlight which ingredients are used and which optional ingredients may be needed.
- Let users regenerate or refine recipes based on preferences.

## 3. Non-Goals

- Saving recipes to a user profile is not included in Step 2.
- Full nutrition calculation is not required.
- Shopping cart integration is not included.
- Step 2 does not re-analyze images directly.

## 4. Inputs

Step 2 depends on the confirmed output from Step 1.

Required input:

- Confirmed ingredient list.

Optional input:

- Cuisine preference.
- Meal type such as breakfast, lunch, dinner, snack, or side dish.
- Cooking time limit.
- Difficulty preference.
- Dietary notes such as vegetarian, low carb, spicy, or no seafood.
- Available kitchen tools.

## 5. User Flow

1. User confirms ingredients from Step 1.
2. App opens the recipe generation screen.
3. User optionally selects preferences.
4. User clicks "Generate Recipes".
5. Backend sends ingredients and preferences to OpenRouter.
6. App displays recipe cards.
7. User can regenerate recipes, adjust preferences, or return to edit ingredients.
8. User chooses a recipe to view full details.

## 6. Functional Requirements

### 6.1 Recipe Generation

- The backend must use `deepseek/deepseek-chat-v3.1:free`.
- The frontend must not expose the OpenRouter API key.
- The app must generate at least 3 recipe suggestions by default.
- Each recipe must be based primarily on the provided ingredients.
- The model must clearly mark optional or missing ingredients.

### 6.2 Recipe Card

Each generated recipe card must include:

- Recipe title.
- Short description.
- Estimated cooking time.
- Difficulty level.
- Main ingredients used.
- Missing or optional ingredients.
- One-line reason why the recipe fits the available ingredients.

### 6.3 Recipe Detail

Each recipe detail view must include:

- Full ingredient list.
- Step-by-step cooking instructions.
- Serving size.
- Preparation time and cooking time.
- Substitution suggestions when useful.
- Storage or leftover notes when useful.

### 6.4 Refinement

- Users must be able to regenerate recipe recommendations.
- Users should be able to change preferences and generate again.
- Users should be able to remove an ingredient from the generation context.
- Users should be able to request simpler recipes.

### 6.5 Output Structure

- The backend should request valid JSON from the model.
- The backend must validate the response before sending it to the frontend.
- If the response cannot be parsed, the backend should retry once with a stricter JSON-only prompt.

## 7. Suggested API Contract

### Endpoint

`POST /api/generate-recipes`

### Request

```json
{
  "ingredients": [
    {
      "name": "egg",
      "quantity_hint": "about 6"
    },
    {
      "name": "green onion"
    }
  ],
  "preferences": {
    "meal_type": "dinner",
    "max_cooking_minutes": 30,
    "difficulty": "easy",
    "dietary_notes": []
  }
}
```

### Response

```json
{
  "recipes": [
    {
      "title": "Green Onion Egg Rice Bowl",
      "description": "A quick rice bowl using eggs and green onion.",
      "servings": 1,
      "prep_minutes": 5,
      "cook_minutes": 10,
      "difficulty": "easy",
      "ingredients_used": ["egg", "green onion"],
      "optional_ingredients": ["soy sauce", "sesame oil"],
      "missing_ingredients": [],
      "steps": [
        "Beat the eggs.",
        "Cook the green onion briefly.",
        "Add eggs and scramble until just set."
      ],
      "fit_reason": "Uses the main available ingredients with minimal extras."
    }
  ],
  "model": "deepseek/deepseek-chat-v3.1:free"
}
```

## 8. Prompt Requirements

The backend prompt should instruct the model to:

- Use the provided ingredients as the main constraint.
- Avoid inventing many unavailable ingredients.
- Prefer common home-cooking recipes.
- Return valid JSON only.
- Include missing ingredients separately from available ingredients.
- Keep cooking steps specific and executable.
- Respect user preferences when provided.

## 9. Error Handling

- If there are no ingredients, redirect the user to Step 1 or manual entry.
- If OpenRouter returns a rate limit error, show a retry message.
- If recipe generation fails, preserve the ingredient list and preferences.
- If the model returns unsafe or irrelevant output, show a generic failure and allow regeneration.

## 10. Success Metrics

- At least 90% of recipe generation requests return parseable recipe data.
- Users receive recipes within 30 seconds in normal conditions.
- Each generated recipe uses at least one recognized ingredient.
- Users can regenerate recipes without repeating image recognition.

## 11. Acceptance Criteria

- A user can generate recipes from the confirmed Step 1 ingredient list.
- The backend calls `deepseek/deepseek-chat-v3.1:free`.
- The result contains structured recipe data.
- The UI shows recipe cards and a recipe detail view.
- Users can regenerate recipes or adjust preferences.
