import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");
const port = Number(process.env.PORT || 3000);
const imageModel = "google/gemma-3-27b-it:free";
const recipeModel = "deepseek/deepseek-chat-v3.1:free";
const maxBodyBytes = 14 * 1024 * 1024;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

function loadEnvValue(name) {
  if (process.env[name]) {
    return process.env[name];
  }

  return readFile(join(__dirname, ".env"), "utf8")
    .then((contents) => {
      for (const line of contents.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
          continue;
        }

        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (!match) {
          continue;
        }

        const key = match[1].trim();
        const value = match[2].trim().replace(/^['"]|['"]$/g, "");
        if (key === name) {
          return value;
        }
      }

      return "";
    })
    .catch(() => "");
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBodyBytes) {
        reject(new Error("Request body is too large."));
        req.destroy();
        return;
      }

      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function isSupportedImageDataUrl(image) {
  return /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(image);
}

function extractJsonObject(text) {
  if (!text) {
    throw new Error("Model returned an empty response.");
  }

  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("Model response did not contain JSON.");
    }

    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

function normalizeIngredient(raw) {
  return {
    name: String(raw?.name || "").trim(),
    quantity_hint: String(raw?.quantity_hint || "").trim(),
    confidence: ["low", "medium", "high"].includes(raw?.confidence)
      ? raw.confidence
      : "medium",
    notes: String(raw?.notes || "").trim(),
  };
}

function normalizeRecognitionPayload(payload) {
  const ingredients = Array.isArray(payload.ingredients)
    ? payload.ingredients.map(normalizeIngredient).filter((item) => item.name)
    : [];

  const imageQualityNotes = Array.isArray(payload.image_quality_notes)
    ? payload.image_quality_notes.map((note) => String(note).trim()).filter(Boolean)
    : [];

  return {
    ingredients,
    image_quality_notes: imageQualityNotes,
    model: imageModel,
  };
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

function normalizeRecipe(raw) {
  const title = String(raw?.title || "").trim();

  return {
    title,
    description: String(raw?.description || "").trim(),
    servings: Number(raw?.servings) || 1,
    prep_minutes: Number(raw?.prep_minutes) || 0,
    cook_minutes: Number(raw?.cook_minutes) || 0,
    difficulty: String(raw?.difficulty || "easy").trim(),
    ingredients_used: normalizeStringArray(raw?.ingredients_used),
    optional_ingredients: normalizeStringArray(raw?.optional_ingredients),
    missing_ingredients: normalizeStringArray(raw?.missing_ingredients),
    steps: normalizeStringArray(raw?.steps),
    fit_reason: String(raw?.fit_reason || "").trim(),
    substitutions: normalizeStringArray(raw?.substitutions),
    storage_notes: String(raw?.storage_notes || "").trim(),
  };
}

function normalizeRecipePayload(payload) {
  const recipes = Array.isArray(payload.recipes)
    ? payload.recipes.map(normalizeRecipe).filter((recipe) => recipe.title && recipe.steps.length)
    : [];

  return {
    recipes,
    model: recipeModel,
  };
}

async function callOpenRouter(image) {
  const apiKey = await loadEnvValue("OPENROUTER_API_KEY");
  if (!apiKey) {
    const error = new Error("OpenRouter API key is not configured.");
    error.statusCode = 500;
    throw error;
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "http-referer": "http://localhost",
      "x-title": "Refrigerator Recipe Assistant",
    },
    body: JSON.stringify({
      model: imageModel,
      temperature: 0,
      max_tokens: 800,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Identify only visible food ingredients in this refrigerator image. " +
                "Do not guess hidden items. Normalize names into common cooking ingredient names. " +
                "Return valid JSON only with this exact shape: " +
                '{"ingredients":[{"name":"egg","quantity_hint":"about 6","confidence":"high","notes":"visible in carton"}],"image_quality_notes":[]}. ' +
                "Use confidence values only from low, medium, high.",
            },
            {
              type: "image_url",
              image_url: {
                url: image,
              },
            },
          ],
        },
      ],
    }),
  });

  const responseText = await response.text();
  let responseJson;
  try {
    responseJson = JSON.parse(responseText);
  } catch {
    responseJson = null;
  }

  if (!response.ok) {
    const message =
      responseJson?.error?.message ||
      `OpenRouter request failed with status ${response.status}.`;
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  const content = responseJson?.choices?.[0]?.message?.content;
  const modelText = Array.isArray(content)
    ? content.map((part) => part?.text || "").join("\n")
    : String(content || "");

  return normalizeRecognitionPayload(extractJsonObject(modelText));
}

async function handleRecognizeIngredients(req, res) {
  try {
    const body = JSON.parse(await readRequestBody(req));
    const image = String(body.image || "");

    if (!isSupportedImageDataUrl(image)) {
      sendJson(res, 400, {
        error: "JPEG, PNG, or WebP image data URL is required.",
      });
      return;
    }

    const result = await callOpenRouter(image);
    sendJson(res, 200, result);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendJson(res, statusCode, {
      error:
        statusCode === 401 || statusCode === 403
          ? "OpenRouter service is not configured correctly."
          : error.message || "Ingredient recognition failed.",
    });
  }
}

function normalizeRecipeRequestIngredient(raw) {
  return {
    name: String(raw?.name || "").trim(),
    quantity_hint: String(raw?.quantity_hint || "").trim(),
  };
}

function normalizePreferences(raw = {}) {
  return {
    cuisine: String(raw.cuisine || "").trim(),
    meal_type: String(raw.meal_type || "").trim(),
    max_cooking_minutes: Number(raw.max_cooking_minutes) || null,
    difficulty: String(raw.difficulty || "").trim(),
    dietary_notes: normalizeStringArray(raw.dietary_notes),
    kitchen_tools: normalizeStringArray(raw.kitchen_tools),
    simpler: Boolean(raw.simpler),
  };
}

async function requestRecipeGeneration(ingredients, preferences, strictJsonOnly = false) {
  const apiKey = await loadEnvValue("OPENROUTER_API_KEY");
  if (!apiKey) {
    const error = new Error("OpenRouter API key is not configured.");
    error.statusCode = 500;
    throw error;
  }

  const prompt = [
    "Generate 3 practical home-cooking recipes from the provided ingredients.",
    "Use the provided ingredients as the main constraint and avoid inventing many unavailable ingredients.",
    "Clearly separate ingredients_used, optional_ingredients, and missing_ingredients.",
    "Respect the user preferences when present.",
    "Keep steps specific and executable.",
    "Return valid JSON only with this exact shape:",
    '{"recipes":[{"title":"Recipe title","description":"Short description","servings":1,"prep_minutes":5,"cook_minutes":10,"difficulty":"easy","ingredients_used":["egg"],"optional_ingredients":["soy sauce"],"missing_ingredients":[],"steps":["Do the first step."],"fit_reason":"Why this fits.","substitutions":["Optional substitution"],"storage_notes":"Storage note"}]}',
    strictJsonOnly ? "Do not include markdown, commentary, or code fences." : "",
    `Ingredients: ${JSON.stringify(ingredients)}`,
    `Preferences: ${JSON.stringify(preferences)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "http-referer": "http://localhost",
      "x-title": "Refrigerator Recipe Assistant",
    },
    body: JSON.stringify({
      model: recipeModel,
      temperature: 0.4,
      max_tokens: 1800,
      messages: [
        {
          role: "system",
          content: "You are a recipe generation API. You return JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
  });

  const responseText = await response.text();
  let responseJson;
  try {
    responseJson = JSON.parse(responseText);
  } catch {
    responseJson = null;
  }

  if (!response.ok) {
    const message =
      responseJson?.error?.message ||
      `OpenRouter request failed with status ${response.status}.`;
    const error = new Error(message);
    error.statusCode = response.status;
    throw error;
  }

  const content = responseJson?.choices?.[0]?.message?.content;
  const modelText = Array.isArray(content)
    ? content.map((part) => part?.text || "").join("\n")
    : String(content || "");

  return normalizeRecipePayload(extractJsonObject(modelText));
}

async function callRecipeModel(ingredients, preferences) {
  try {
    return await requestRecipeGeneration(ingredients, preferences);
  } catch (error) {
    if (!/json|parse|contain/i.test(error.message || "")) {
      throw error;
    }

    return requestRecipeGeneration(ingredients, preferences, true);
  }
}

async function handleGenerateRecipes(req, res) {
  try {
    const body = JSON.parse(await readRequestBody(req));
    const ingredients = Array.isArray(body.ingredients)
      ? body.ingredients.map(normalizeRecipeRequestIngredient).filter((item) => item.name)
      : [];

    if (ingredients.length === 0) {
      sendJson(res, 400, {
        error: "At least one ingredient is required.",
      });
      return;
    }

    const preferences = normalizePreferences(body.preferences || {});
    const result = await callRecipeModel(ingredients, preferences);

    if (result.recipes.length === 0) {
      sendJson(res, 502, {
        error: "The recipe model did not return usable recipes. Please try again.",
      });
      return;
    }

    sendJson(res, 200, result);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    sendJson(res, statusCode, {
      error:
        statusCode === 401 || statusCode === 403
          ? "OpenRouter service is not configured correctly."
          : error.message || "Recipe generation failed.",
    });
  }
}

async function serveStatic(req, res) {
  const url = new URL(req.url, "http://localhost");
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = normalize(decodeURIComponent(requestedPath)).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const contents = await readFile(filePath);
    const contentType = contentTypes[extname(filePath).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, {
      "content-type": contentType,
      "cache-control": "no-store",
    });
    res.end(contents);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/api/health") {
    sendJson(res, 200, { ok: true, image_model: imageModel, recipe_model: recipeModel });
    return;
  }

  if (req.method === "POST" && req.url === "/api/recognize-ingredients") {
    handleRecognizeIngredients(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/generate-recipes") {
    handleGenerateRecipes(req, res);
    return;
  }

  if (req.method === "GET") {
    serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { error: "Method not allowed." });
});

server.listen(port, () => {
  console.log(`Refrigerator recipe assistant is running at http://localhost:${port}`);
});
