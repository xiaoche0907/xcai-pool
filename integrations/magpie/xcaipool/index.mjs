const modelKeyPattern = "^(?!\\.{1,2}$)[a-zA-Z0-9_.-]{1,150}$";
const modelArg = { type: "string", pattern: modelKeyPattern };
const modelArgs = {
  type: "object",
  required: ["modelKey"],
  additionalProperties: false,
  properties: { modelKey: modelArg },
};

function modelPath(modelKey) {
  if (
    typeof modelKey !== "string" ||
    !new RegExp(modelKeyPattern).test(modelKey)
  ) {
    throw new Error("Invalid XcAIPool modelKey");
  }
  return `models/${encodeURIComponent(modelKey)}`;
}

async function request(path, signal) {
  const base = process.env.XCAIPOOL_READ_URL;
  const key = process.env.XCAIPOOL_READ_KEY;
  if (!/^http:\/\/127\.0\.0\.1:\d{1,5}\/api\/v1$/.test(base ?? "") || !key) {
    throw new Error(
      "Start Magpie with the XcAIPool loopback URL and read-only key.",
    );
  }
  const response = await fetch(`${base}/${path}`, {
    headers: { Authorization: `Bearer ${key}` },
    redirect: "error",
    signal: signal
      ? AbortSignal.any([signal, AbortSignal.timeout(25000)])
      : AbortSignal.timeout(25000),
  });
  if (!response.ok)
    throw new Error(`XcAIPool query failed (${response.status}).`);
  return JSON.stringify(await response.json());
}

export default async function XcAIPoolTools() {
  return {
    tool: {
      models: {
        description:
          "List XcAIPool's real LibTV model catalog. Listing does not verify generation access.",
        args: {
          type: "object",
          additionalProperties: false,
          properties: { type: { enum: ["image", "video"] } },
        },
        execute: ({ type }, ctx) => {
          if (type !== undefined && !["image", "video"].includes(type))
            throw new Error("Invalid model type");
          return request(type ? `models?type=${type}` : "models", ctx?.abort);
        },
      },
      schema: {
        description:
          "Read the LibTV model schema and parameter form from XcAIPool.",
        args: modelArgs,
        execute: ({ modelKey }, ctx) =>
          request(`${modelPath(modelKey)}/schema`, ctx?.abort),
      },
      route_preview: {
        description:
          "Check which enabled XcAIPool accounts can read a LibTV model's catalog entry. No generation is submitted.",
        args: modelArgs,
        execute: ({ modelKey }, ctx) =>
          request(`${modelPath(modelKey)}/route-preview`, ctx?.abort),
      },
    },
  };
}
