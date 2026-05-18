# PRD Step 3: User Profiles and Saved Recipes

## 1. Overview

Step 3 adds user profiles so users can save generated recipes, revisit them later, and build a personal cooking history. This step turns the app from a one-time recipe generator into a reusable personal refrigerator recipe assistant.

The output of this step is a profile-based experience with saved recipes and basic preference management.

## 2. Goals

- Let users create and access a personal profile.
- Let users save recipes generated in Step 2.
- Let users view, search, and delete saved recipes.
- Store basic cooking preferences for future recipe generation.
- Keep saved recipe data associated with the correct user.

## 3. Non-Goals

- Social sharing and public recipe feeds are not included.
- Paid subscriptions are not included.
- Advanced nutrition tracking is not included.
- Multi-user household management is not included in the initial Step 3 scope.

## 4. User Flow

1. User generates recipes in Step 2.
2. User clicks "Save Recipe" on a recipe card or detail page.
3. If not signed in, user is prompted to create or access a profile.
4. App saves the recipe to the user's profile.
5. User opens "My Recipes".
6. User views saved recipes, searches by title or ingredient, and opens recipe details.
7. User can delete recipes they no longer want.
8. User can update basic preferences for future recipe generation.

## 5. Functional Requirements

### 5.1 Profile Creation

- The app must support a user identity mechanism.
- For MVP, acceptable options include email login, OAuth login, or local prototype profiles.
- Each profile must have a unique user ID.
- The app should store display name and basic preferences.

### 5.2 Saved Recipes

- Users must be able to save a generated recipe.
- Users must be able to view all saved recipes.
- Users must be able to open a saved recipe detail page.
- Users must be able to delete a saved recipe.
- The app should prevent duplicate saves of the same generated recipe when possible.

### 5.3 Saved Recipe Data

Each saved recipe must include:

- Recipe title.
- Description.
- Serving size.
- Prep time and cooking time.
- Difficulty.
- Ingredient list.
- Cooking steps.
- Original recognized ingredients used to generate the recipe.
- Optional and missing ingredients.
- User preferences used during generation.
- Created timestamp.
- Source model name.

### 5.4 User Preferences

Users should be able to save:

- Preferred cuisine types.
- Dietary restrictions.
- Ingredients to avoid.
- Preferred cooking time.
- Difficulty preference.
- Available kitchen tools.

These preferences should be available to Step 2 as default recipe generation inputs.

### 5.5 Search and Filtering

- Users must be able to search saved recipes by title.
- Users should be able to search by ingredient.
- Users should be able to filter by difficulty or cooking time.
- Saved recipes should be sorted by newest first by default.

## 6. Suggested Data Model

### User Profile

```json
{
  "id": "user_123",
  "display_name": "Alex",
  "preferences": {
    "cuisines": ["Korean", "Japanese"],
    "dietary_notes": ["no seafood"],
    "avoid_ingredients": ["cilantro"],
    "max_cooking_minutes": 30,
    "difficulty": "easy",
    "kitchen_tools": ["pan", "microwave"]
  },
  "created_at": "2026-05-18T00:00:00Z",
  "updated_at": "2026-05-18T00:00:00Z"
}
```

### Saved Recipe

```json
{
  "id": "recipe_123",
  "user_id": "user_123",
  "title": "Green Onion Egg Rice Bowl",
  "description": "A quick rice bowl using eggs and green onion.",
  "servings": 1,
  "prep_minutes": 5,
  "cook_minutes": 10,
  "difficulty": "easy",
  "ingredients": ["egg", "green onion", "soy sauce"],
  "steps": ["Beat the eggs.", "Cook the green onion.", "Scramble together."],
  "recognized_ingredients": ["egg", "green onion"],
  "optional_ingredients": ["sesame oil"],
  "missing_ingredients": [],
  "generation_preferences": {
    "meal_type": "dinner",
    "max_cooking_minutes": 30
  },
  "source_model": "deepseek/deepseek-chat-v3.1:free",
  "created_at": "2026-05-18T00:00:00Z",
  "updated_at": "2026-05-18T00:00:00Z"
}
```

## 7. Suggested API Contract

### Save Recipe

`POST /api/profile/recipes`

```json
{
  "recipe": {
    "title": "Green Onion Egg Rice Bowl",
    "description": "A quick rice bowl using eggs and green onion.",
    "ingredients": ["egg", "green onion"],
    "steps": ["Beat the eggs.", "Cook the green onion."]
  }
}
```

### List Saved Recipes

`GET /api/profile/recipes`

### Get Saved Recipe

`GET /api/profile/recipes/:recipeId`

### Delete Saved Recipe

`DELETE /api/profile/recipes/:recipeId`

### Update Preferences

`PUT /api/profile/preferences`

## 8. Security and Privacy Requirements

- Users must only access their own saved recipes.
- The app must not store OpenRouter API keys in user-visible data.
- Authentication tokens must be stored securely.
- Saved recipe data should avoid storing raw uploaded refrigerator images unless explicitly needed.
- If image history is added later, users must be able to delete uploaded images.

## 9. Error Handling

- If saving fails, keep the generated recipe visible and allow retry.
- If the user is not authenticated, prompt for profile access before saving.
- If a saved recipe is not found, show a friendly empty state.
- If profile data fails to load, show retry controls.

## 10. Success Metrics

- Users can save a generated recipe in one action after profile setup.
- Saved recipes load in under 2 seconds under normal conditions.
- Users can find a saved recipe by title or ingredient.
- Preference data is reused in future recipe generation requests.

## 11. Acceptance Criteria

- A user can create or access a profile.
- A user can save a recipe generated in Step 2.
- A user can view, search, open, and delete saved recipes.
- Saved recipes are associated with the correct user.
- User preferences can be stored and reused for future recipe generation.
