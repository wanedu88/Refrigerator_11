import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = resolve(__dirname, "public");
const port = Number(process.env.PORT || 3000);
const imageModel = "google/gemma-3-27b-it:free";
const recipeModel = "deepseek/deepseek-chat-v3.1:free";
const maxBodyBytes = 14 * 1024 * 1024;
const openRouterTimeoutMs = 45_000;
const rateLimitWindowMs = 60_000;
const rateLimitMaxRequests = 20;
const rateLimitBuckets = new Map();

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

function createHttpError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
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

function boundedString(value, maxLength = 160) {
  return String(value || "").trim().slice(0, maxLength);
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(number)));
}

function allowedValue(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function isJsonRequest(req) {
  return String(req.headers["content-type"] || "").toLowerCase().includes("application/json");
}

function isAllowedBrowserOrigin(req) {
  const source = req.headers.origin || req.headers.referer;
  if (!source) {
    return true;
  }

  try {
    const sourceUrl = new URL(source);
    const host = String(req.headers.host || "");
    return sourceUrl.host === host;
  } catch {
    return false;
  }
}

function getClientKey(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwardedFor || req.socket.remoteAddress || "unknown";
}

function checkRateLimit(req) {
  const now = Date.now();
  const key = `${getClientKey(req)}:${req.url}`;
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + rateLimitWindowMs });
    return null;
  }

  bucket.count += 1;
  if (bucket.count > rateLimitMaxRequests) {
    return createHttpError("Too many requests. Please wait and try again.", 429);
  }

  return null;
}

function validateApiRequest(req) {
  if (!isJsonRequest(req)) {
    return createHttpError("Content-Type must be application/json.", 415);
  }

  if (!isAllowedBrowserOrigin(req)) {
    return createHttpError("Request origin is not allowed.", 403);
  }

  return checkRateLimit(req);
}

function sendClientError(res, error, fallbackMessage) {
  const statusCode = error.statusCode || 500;
  const safeMessageByStatus = {
    400: error.message,
    403: error.message,
    413: error.message,
    415: error.message,
    429: error.message,
    500: fallbackMessage,
    502: "The AI service returned an unusable response. Please try again.",
    504: "The AI service took too long to respond. Please try again.",
  };

  console.error(error.upstreamMessage || error.message || fallbackMessage);
  sendJson(res, statusCode, {
    error: safeMessageByStatus[statusCode] || fallbackMessage,
  });
}

async function fetchOpenRouterChatCompletion(apiKey, payload) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), openRouterTimeoutMs);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "http-referer": "http://localhost",
        "x-title": "Refrigerator Recipe Assistant",
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let responseJson;
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      responseJson = null;
    }

    if (!response.ok) {
      const error = createHttpError("AI service request failed.", response.status);
      error.upstreamMessage =
        responseJson?.error?.message || `OpenRouter request failed with status ${response.status}.`;
      throw error;
    }

    return responseJson;
  } catch (error) {
    if (error.name === "AbortError") {
      throw createHttpError("AI service request timed out.", 504);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
    name: boundedString(raw?.name, 80),
    quantity_hint: boundedString(raw?.quantity_hint, 80),
    confidence: ["low", "medium", "high"].includes(raw?.confidence)
      ? raw.confidence
      : "medium",
    notes: boundedString(raw?.notes, 160),
  };
}

function normalizeRecognitionPayload(payload) {
  const ingredients = Array.isArray(payload.ingredients)
    ? payload.ingredients.map(normalizeIngredient).filter((item) => item.name).slice(0, 30)
    : [];

  const imageQualityNotes = Array.isArray(payload.image_quality_notes)
    ? payload.image_quality_notes.map((note) => boundedString(note, 160)).filter(Boolean).slice(0, 5)
    : [];

  return {
    ingredients,
    image_quality_notes: imageQualityNotes,
    model: imageModel,
  };
}

function normalizeStringArray(value, maxItems = 12, maxLength = 120) {
  return Array.isArray(value)
    ? value.map((item) => boundedString(item, maxLength)).filter(Boolean).slice(0, maxItems)
    : [];
}

function normalizeRecipe(raw) {
  const title = boundedString(raw?.title, 100);

  return {
    title,
    description: boundedString(raw?.description, 220),
    servings: clampNumber(raw?.servings, 1, 8, 1),
    prep_minutes: clampNumber(raw?.prep_minutes, 0, 180, 0),
    cook_minutes: clampNumber(raw?.cook_minutes, 0, 240, 0),
    difficulty: allowedValue(String(raw?.difficulty || "easy").trim(), ["easy", "medium", "hard"], "easy"),
    ingredients_used: normalizeStringArray(raw?.ingredients_used, 20, 80),
    optional_ingredients: normalizeStringArray(raw?.optional_ingredients, 12, 80),
    missing_ingredients: normalizeStringArray(raw?.missing_ingredients, 12, 80),
    steps: normalizeStringArray(raw?.steps, 12, 240),
    fit_reason: boundedString(raw?.fit_reason, 240),
    substitutions: normalizeStringArray(raw?.substitutions, 8, 160),
    storage_notes: boundedString(raw?.storage_notes, 220),
  };
}

function normalizeRecipePayload(payload, submittedIngredients = []) {
  const submittedNames = submittedIngredients.map((item) => item.name.toLowerCase());
  const recipes = Array.isArray(payload.recipes)
    ? payload.recipes
        .map(normalizeRecipe)
        .filter((recipe) => {
          const usesSubmittedIngredient =
            submittedNames.length === 0 ||
            recipe.ingredients_used.some((name) => submittedNames.includes(name.toLowerCase()));
          return recipe.title && recipe.steps.length && usesSubmittedIngredient;
        })
        .slice(0, 3)
    : [];

  return {
    recipes,
    model: recipeModel,
  };
}

async function callOpenRouter(image) {
  const apiKey = await loadEnvValue("OPENROUTER_API_KEY");
  if (!apiKey) {
    throw createHttpError("OpenRouter API key is not configured.", 500);
  }

  const responseJson = await fetchOpenRouterChatCompletion(apiKey, {
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
    });

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
    sendClientError(res, error, "Ingredient recognition failed.");
  }
}

function normalizeRecipeRequestIngredient(raw) {
  return {
    name: boundedString(raw?.name, 80),
    quantity_hint: boundedString(raw?.quantity_hint, 80),
  };
}

function normalizePreferences(raw = {}) {
  return {
    cuisine: boundedString(raw.cuisine, 80),
    meal_type: allowedValue(
      String(raw.meal_type || "").trim(),
      ["", "breakfast", "lunch", "dinner", "snack", "side dish"],
      "",
    ),
    max_cooking_minutes: raw.max_cooking_minutes
      ? clampNumber(raw.max_cooking_minutes, 5, 180, 30)
      : null,
    difficulty: allowedValue(String(raw.difficulty || "").trim(), ["", "easy", "medium", "hard"], ""),
    dietary_notes: normalizeStringArray(raw.dietary_notes, 6, 80),
    kitchen_tools: normalizeStringArray(raw.kitchen_tools, 8, 80),
    simpler: Boolean(raw.simpler),
  };
}

async function requestRecipeGeneration(ingredients, preferences, strictJsonOnly = false) {
  const apiKey = await loadEnvValue("OPENROUTER_API_KEY");
  if (!apiKey) {
    throw createHttpError("OpenRouter API key is not configured.", 500);
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

  const responseJson = await fetchOpenRouterChatCompletion(apiKey, {
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
    });

  const content = responseJson?.choices?.[0]?.message?.content;
  const modelText = Array.isArray(content)
    ? content.map((part) => part?.text || "").join("\n")
    : String(content || "");

  return normalizeRecipePayload(extractJsonObject(modelText), ingredients);
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
      ? body.ingredients.map(normalizeRecipeRequestIngredient).filter((item) => item.name).slice(0, 30)
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
    sendClientError(res, error, "Recipe generation failed.");
  }
}

async function serveStatic(req, res) {
  let requestedPath;
  try {
    const url = new URL(req.url, "http://localhost");
    requestedPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  } catch {
    res.writeHead(400, { "content-type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return;
  }

  const filePath = resolve(publicDir, `.${requestedPath}`);
  const relativePath = relative(publicDir, filePath);

  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
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
    const validationError = validateApiRequest(req);
    if (validationError) {
      sendClientError(res, validationError, "Invalid API request.");
      return;
    }

    handleRecognizeIngredients(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/generate-recipes") {
    const validationError = validateApiRequest(req);
    if (validationError) {
      sendClientError(res, validationError, "Invalid API request.");
      return;
    }

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
