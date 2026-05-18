const maxImageBytes = 10 * 1024 * 1024;
const supportedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

const imageInput = document.querySelector("#imageInput");
const analyzeButton = document.querySelector("#analyzeButton");
const clearButton = document.querySelector("#clearButton");
const previewWrap = document.querySelector("#previewWrap");
const previewImage = document.querySelector("#previewImage");
const statusEl = document.querySelector("#status");
const resultsPanel = document.querySelector("#resultsPanel");
const ingredientsTable = document.querySelector("#ingredientsTable");
const addIngredientButton = document.querySelector("#addIngredientButton");
const confirmButton = document.querySelector("#confirmButton");
const confirmedOutput = document.querySelector("#confirmedOutput");
const qualityNotes = document.querySelector("#qualityNotes");
const recipePanel = document.querySelector("#recipePanel");
const reloadIngredientsButton = document.querySelector("#reloadIngredientsButton");
const recipeIngredients = document.querySelector("#recipeIngredients");
const cuisineInput = document.querySelector("#cuisineInput");
const mealTypeInput = document.querySelector("#mealTypeInput");
const maxMinutesInput = document.querySelector("#maxMinutesInput");
const difficultyInput = document.querySelector("#difficultyInput");
const dietaryNotesInput = document.querySelector("#dietaryNotesInput");
const kitchenToolsInput = document.querySelector("#kitchenToolsInput");
const simplerInput = document.querySelector("#simplerInput");
const generateRecipesButton = document.querySelector("#generateRecipesButton");
const recipeStatus = document.querySelector("#recipeStatus");
const recipeCards = document.querySelector("#recipeCards");
const recipeDetail = document.querySelector("#recipeDetail");

let selectedImageDataUrl = "";
let ingredients = [];
let confirmedIngredients = [];
let recipes = [];

function setStatus(message, type = "") {
  statusEl.textContent = message;
  statusEl.className = `status ${type}`.trim();
}

function setBusy(isBusy) {
  analyzeButton.disabled = isBusy || !selectedImageDataUrl;
  analyzeButton.textContent = isBusy ? "분석 중..." : "이미지 분석";
  imageInput.disabled = isBusy;
}

function setRecipeStatus(message, type = "") {
  recipeStatus.textContent = message;
  recipeStatus.className = `status ${type}`.trim();
}

function setRecipeBusy(isBusy) {
  generateRecipesButton.disabled = isBusy || confirmedIngredients.length === 0;
  generateRecipesButton.textContent = isBusy ? "레시피 생성 중..." : "레시피 생성";
}

function resetAll() {
  selectedImageDataUrl = "";
  ingredients = [];
  confirmedIngredients = [];
  recipes = [];
  imageInput.value = "";
  previewImage.removeAttribute("src");
  previewWrap.classList.add("is-hidden");
  resultsPanel.classList.add("is-hidden");
  recipePanel.classList.add("is-hidden");
  confirmedOutput.classList.add("is-hidden");
  confirmedOutput.textContent = "";
  qualityNotes.classList.add("is-hidden");
  qualityNotes.textContent = "";
  renderIngredients();
  renderRecipeIngredients();
  renderRecipes();
  setStatus("");
  setRecipeStatus("");
  setBusy(false);
  setRecipeBusy(false);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("이미지를 읽을 수 없습니다."));
    reader.readAsDataURL(file);
  });
}

function validateImage(file) {
  if (!file) {
    return "이미지를 선택해 주세요.";
  }

  if (!supportedTypes.has(file.type)) {
    return "JPEG, PNG, WebP 이미지만 업로드할 수 있습니다.";
  }

  if (file.size > maxImageBytes) {
    return "이미지는 10MB 이하만 업로드할 수 있습니다.";
  }

  return "";
}

function createIngredient(overrides = {}) {
  return {
    name: overrides.name || "",
    quantity_hint: overrides.quantity_hint || "",
    confidence: overrides.confidence || "medium",
    notes: overrides.notes || "",
  };
}

function updateIngredient(index, field, value) {
  ingredients[index] = {
    ...ingredients[index],
    [field]: value,
  };
}

function deleteIngredient(index) {
  ingredients = ingredients.filter((_, itemIndex) => itemIndex !== index);
  renderIngredients();
}

function renderIngredients() {
  ingredientsTable.innerHTML = "";

  if (ingredients.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    const message = document.createElement("p");
    message.className = "hint";
    message.textContent =
      '인식된 재료가 없습니다. 사진이 어둡거나 재료가 가려졌을 수 있어요. 다시 촬영하거나 "재료 추가"로 직접 입력해 주세요.';
    const addButton = document.createElement("button");
    addButton.type = "button";
    addButton.className = "secondary";
    addButton.textContent = "재료 직접 추가";
    addButton.addEventListener("click", addIngredient);
    cell.append(message, addButton);
    row.append(cell);
    ingredientsTable.append(row);
    return;
  }

  ingredients.forEach((ingredient, index) => {
    const row = document.createElement("tr");

    const nameCell = document.createElement("td");
    const nameInput = document.createElement("input");
    nameInput.value = ingredient.name;
    nameInput.placeholder = "예: egg";
    nameInput.setAttribute("aria-label", "재료명");
    nameInput.addEventListener("input", (event) => {
      updateIngredient(index, "name", event.target.value);
    });
    nameCell.append(nameInput);

    const quantityCell = document.createElement("td");
    const quantityInput = document.createElement("input");
    quantityInput.value = ingredient.quantity_hint;
    quantityInput.placeholder = "예: about 6";
    quantityInput.setAttribute("aria-label", "수량 힌트");
    quantityInput.addEventListener("input", (event) => {
      updateIngredient(index, "quantity_hint", event.target.value);
    });
    quantityCell.append(quantityInput);

    const confidenceCell = document.createElement("td");
    const confidenceSelect = document.createElement("select");
    confidenceSelect.setAttribute("aria-label", "신뢰도");
    for (const value of ["low", "medium", "high"]) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      option.selected = ingredient.confidence === value;
      confidenceSelect.append(option);
    }
    confidenceSelect.addEventListener("change", (event) => {
      updateIngredient(index, "confidence", event.target.value);
    });
    confidenceCell.append(confidenceSelect);

    const notesCell = document.createElement("td");
    const notesInput = document.createElement("input");
    notesInput.value = ingredient.notes;
    notesInput.placeholder = "예: partially visible";
    notesInput.setAttribute("aria-label", "메모");
    notesInput.addEventListener("input", (event) => {
      updateIngredient(index, "notes", event.target.value);
    });
    notesCell.append(notesInput);

    const deleteCell = document.createElement("td");
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.textContent = "삭제";
    deleteButton.setAttribute("aria-label", "이 재료 삭제");
    deleteButton.addEventListener("click", () => deleteIngredient(index));
    deleteCell.append(deleteButton);

    row.append(nameCell, quantityCell, confidenceCell, notesCell, deleteCell);
    ingredientsTable.append(row);
  });
}

function renderQualityNotes(notes) {
  if (!notes.length) {
    qualityNotes.classList.add("is-hidden");
    qualityNotes.textContent = "";
    return;
  }

  qualityNotes.classList.remove("is-hidden");
  qualityNotes.textContent = `이미지 품질 메모: ${notes.join(", ")}`;
}

function splitCommaList(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function renderRecipeIngredients() {
  recipeIngredients.innerHTML = "";

  if (confirmedIngredients.length === 0) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "확정된 재료가 없습니다. Step 1에서 재료를 확정해 주세요.";
    recipeIngredients.append(empty);
    setRecipeBusy(false);
    return;
  }

  confirmedIngredients.forEach((ingredient, index) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip";
    chip.title = "이 재료를 레시피 생성에서 제외";
    chip.textContent = `${ingredient.name} 제외`;
    chip.setAttribute("aria-label", `${ingredient.name} 재료를 레시피 생성에서 제외`);
    chip.addEventListener("click", () => {
      confirmedIngredients = confirmedIngredients.filter((_, itemIndex) => itemIndex !== index);
      renderRecipeIngredients();
      setRecipeStatus("선택한 재료를 생성 목록에서 제외했습니다.");
    });
    recipeIngredients.append(chip);
  });

  setRecipeBusy(false);
}

function loadConfirmedIngredients() {
  try {
    const saved = JSON.parse(localStorage.getItem("step1.confirmedIngredients") || "{}");
    confirmedIngredients = Array.isArray(saved.ingredients)
      ? saved.ingredients.filter((ingredient) => ingredient.name)
      : [];
  } catch {
    confirmedIngredients = [];
  }

  renderRecipeIngredients();
  if (confirmedIngredients.length > 0) {
    recipePanel.classList.remove("is-hidden");
    setRecipeStatus(`${confirmedIngredients.length}개 재료를 불러왔습니다.`);
  }
}

function collectPreferences() {
  return {
    cuisine: cuisineInput.value.trim(),
    meal_type: mealTypeInput.value,
    max_cooking_minutes: Number(maxMinutesInput.value) || null,
    difficulty: difficultyInput.value,
    dietary_notes: splitCommaList(dietaryNotesInput.value),
    kitchen_tools: splitCommaList(kitchenToolsInput.value),
    simpler: simplerInput.checked,
  };
}

function renderRecipes() {
  recipeCards.innerHTML = "";
  recipeDetail.classList.add("is-hidden");
  recipeDetail.innerHTML = "";

  recipes.forEach((recipe, index) => {
    const card = document.createElement("article");
    card.className = "recipe-card";

    const title = document.createElement("h3");
    title.textContent = recipe.title;

    const description = document.createElement("p");
    description.textContent = recipe.description;

    const meta = document.createElement("p");
    meta.className = "recipe-meta";
    meta.textContent = `${recipe.prep_minutes}분 준비 · ${recipe.cook_minutes}분 조리 · ${recipe.difficulty}`;

    const used = createLabelValue("사용 재료:", recipe.ingredients_used.join(", ") || "없음");

    const extrasList = [...recipe.optional_ingredients, ...recipe.missing_ingredients];
    const extras = createLabelValue("추가/선택 재료:", extrasList.join(", ") || "없음");

    const reason = document.createElement("p");
    reason.textContent = recipe.fit_reason;

    const detailButton = document.createElement("button");
    detailButton.type = "button";
    detailButton.className = "secondary";
    detailButton.textContent = "상세 보기";
    detailButton.addEventListener("click", () => renderRecipeDetail(index));

    card.append(title, description, meta, used, extras, reason, detailButton);
    recipeCards.append(card);
  });
}

function createLabelValue(label, value) {
  const paragraph = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = label;
  paragraph.append(strong, ` ${value}`);
  return paragraph;
}

function createTextElement(tagName, text) {
  const element = document.createElement(tagName);
  element.textContent = text;
  return element;
}

function createList(tagName, items, fallback) {
  const list = document.createElement(tagName);
  const values = items?.length ? items : [fallback];
  values.forEach((item) => {
    const listItem = document.createElement("li");
    listItem.textContent = item;
    list.append(listItem);
  });
  return list;
}

function renderRecipeDetail(index) {
  const recipe = recipes[index];
  if (!recipe) {
    return;
  }

  recipeDetail.innerHTML = "";
  recipeDetail.append(
    createTextElement("h3", recipe.title),
    createTextElement("p", recipe.description),
    createLabelValue(
      "정보:",
      `${recipe.servings}인분 · 준비 ${recipe.prep_minutes}분 · 조리 ${recipe.cook_minutes}분`,
    ),
    createLabelValue("사용 재료:", recipe.ingredients_used.join(", ") || "없음"),
    createLabelValue("선택 재료:", recipe.optional_ingredients.join(", ") || "없음"),
    createLabelValue("부족한 재료:", recipe.missing_ingredients.join(", ") || "없음"),
    createTextElement("h4", "조리 순서"),
    createList("ol", recipe.steps, "조리 순서가 없습니다."),
    createTextElement("h4", "대체 제안"),
    createList("ul", recipe.substitutions, "추천 대체 재료가 없습니다."),
    createLabelValue("보관 메모:", recipe.storage_notes || "별도 보관 메모가 없습니다."),
  );
  recipeDetail.classList.remove("is-hidden");
  recipeDetail.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function handleImageChange() {
  const file = imageInput.files?.[0];
  const validationMessage = validateImage(file);

  if (validationMessage) {
    resetAll();
    setStatus(validationMessage, "error");
    return;
  }

  selectedImageDataUrl = await readFileAsDataUrl(file);
  previewImage.src = selectedImageDataUrl;
  previewWrap.classList.remove("is-hidden");
  resultsPanel.classList.add("is-hidden");
  confirmedOutput.classList.add("is-hidden");
  setStatus("이미지가 준비되었습니다. 분석을 시작할 수 있습니다.");
  setBusy(false);
}

async function analyzeImage() {
  if (!selectedImageDataUrl) {
    setStatus("먼저 이미지를 선택해 주세요.", "error");
    return;
  }

  setBusy(true);
  setStatus("사진에서 재료를 찾고 있습니다. 보통 10~20초 정도 걸릴 수 있어요.");

  try {
    const response = await fetch("/api/recognize-ingredients", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ image: selectedImageDataUrl }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "이미지 분석에 실패했습니다.");
    }

    ingredients = Array.isArray(payload.ingredients)
      ? payload.ingredients.map(createIngredient)
      : [];

    renderIngredients();
    renderQualityNotes(payload.image_quality_notes || []);
    resultsPanel.classList.remove("is-hidden");
    setStatus(`분석 완료: ${ingredients.length}개 재료를 찾았습니다.`, "success");
  } catch (error) {
    setStatus(
      error.message || "재료를 찾지 못했습니다. 사진을 다시 선택하거나 재료를 직접 추가해 주세요.",
      "error",
    );
  } finally {
    setBusy(false);
  }
}

function addIngredient() {
  ingredients = [...ingredients, createIngredient()];
  renderIngredients();
}

function confirmIngredients() {
  const nextConfirmedIngredients = ingredients
    .map((ingredient) => ({
      name: ingredient.name.trim(),
      quantity_hint: ingredient.quantity_hint.trim(),
      confidence: ingredient.confidence,
      notes: ingredient.notes.trim(),
    }))
    .filter((ingredient) => ingredient.name);

  const payload = {
    ingredients: nextConfirmedIngredients,
    confirmed_at: new Date().toISOString(),
  };

  if (payload.ingredients.length === 0) {
    setStatus('재료를 1개 이상 입력해 주세요. 인식 결과가 없으면 "재료 추가"로 직접 입력할 수 있습니다.', "error");
    return;
  }

  localStorage.setItem("step1.confirmedIngredients", JSON.stringify(payload));
  confirmedIngredients = payload.ingredients;
  confirmedOutput.textContent = `확정된 재료 ${payload.ingredients.length}개가 저장되었습니다.`;
  confirmedOutput.classList.remove("is-hidden");
  recipePanel.classList.remove("is-hidden");
  renderRecipeIngredients();
  setStatus("재료 목록을 확정했습니다. 아래에서 취향을 선택한 뒤 레시피를 생성하세요.", "success");
  setRecipeStatus("확정된 재료로 레시피를 생성할 수 있습니다.");
  recipePanel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function generateRecipes() {
  if (confirmedIngredients.length === 0) {
    setRecipeStatus("먼저 Step 1에서 재료 목록을 확정해 주세요.", "error");
    return;
  }

  setRecipeBusy(true);
  setRecipeStatus("확정한 재료로 레시피를 만들고 있습니다. 잠시만 기다려 주세요.");

  try {
    const response = await fetch("/api/generate-recipes", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        ingredients: confirmedIngredients,
        preferences: collectPreferences(),
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "레시피 생성에 실패했습니다.");
    }

    recipes = Array.isArray(payload.recipes) ? payload.recipes : [];
    renderRecipes();
    setRecipeStatus(`${recipes.length}개 레시피를 생성했습니다.`, "success");
  } catch (error) {
    setRecipeStatus(
      error.message || "레시피를 만들지 못했습니다. 잠시 후 다시 시도하거나 조건을 줄여 보세요.",
      "error",
    );
  } finally {
    setRecipeBusy(false);
  }
}

imageInput.addEventListener("change", () => {
  handleImageChange().catch((error) => {
    setStatus(error.message || "이미지 처리 중 오류가 발생했습니다.", "error");
  });
});

analyzeButton.addEventListener("click", analyzeImage);
clearButton.addEventListener("click", resetAll);
addIngredientButton.addEventListener("click", addIngredient);
confirmButton.addEventListener("click", confirmIngredients);
reloadIngredientsButton.addEventListener("click", loadConfirmedIngredients);
generateRecipesButton.addEventListener("click", generateRecipes);

renderIngredients();
loadConfirmedIngredients();
