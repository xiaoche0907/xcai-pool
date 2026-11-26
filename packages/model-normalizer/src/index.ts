import { Ajv } from "ajv";
import { createHash } from "node:crypto";
import { AppError } from "../../contracts/src/index.js";
export type Json = Record<string, any>;
const safeKey = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const objectSchema = (properties: Json, required: string[] = []): Json => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});
export function schemaHash(raw: Json) {
  const canonical = (v: any): any =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, canonical(v[k])]),
          )
        : v;
  return createHash("sha256")
    .update(JSON.stringify(canonical(raw)))
    .digest("hex");
}
export function changedPaths(previous: any, next: any, prefix = ""): string[] {
  if (JSON.stringify(previous) === JSON.stringify(next)) return [];
  if (
    !previous ||
    !next ||
    typeof previous !== "object" ||
    typeof next !== "object" ||
    Array.isArray(previous) ||
    Array.isArray(next)
  )
    return [prefix || "/"];
  return [...new Set([...Object.keys(previous), ...Object.keys(next)])].flatMap(
    (k) => changedPaths(previous[k], next[k], `${prefix}/${k}`),
  );
}
function fieldSchema(field: any, key: string, warnings: string[]): Json | null {
  if (
    !field ||
    typeof field !== "object" ||
    Array.isArray(field) ||
    field.activeWhen ||
    field.pixelBudget
  ) {
    warnings.push(`${key}: 未转换动态条件或复杂约束，禁止提交该字段`);
    return null;
  }
  const title = field.displayName ?? key;
  let schema: Json;
  if (Array.isArray(field.enum) && field.enum.length) {
    const options = field.enum.map((v: any) =>
      typeof v === "object" && v !== null
        ? { const: v.value, title: v.displayName ?? String(v.value) }
        : { const: v, title: String(v) },
    );
    if (
      options.some(
        (v: any) => !["string", "number", "boolean"].includes(typeof v.const),
      )
    ) {
      warnings.push(`${key}: 未知枚举类型`);
      return null;
    }
    const types = [...new Set(options.map((v: any) => typeof v.const))];
    if (types.length !== 1) {
      warnings.push(`${key}: 混合枚举类型暂不支持`);
      return null;
    }
    schema = { type: types[0], oneOf: options };
  } else if (field.component === "switch") {
    schema =
      typeof field.default === "boolean"
        ? { type: "boolean" }
        : { type: "integer", enum: [0, 1] };
  } else if (Number.isFinite(field.min) && Number.isFinite(field.max)) {
    schema = { type: "number", minimum: field.min, maximum: field.max };
    if (field.step > 0) schema.multipleOf = field.step;
  } else if (field.component === "input")
    schema = { type: "string", maxLength: 2000 };
  else {
    warnings.push(`${key}: 非标准字段已只读保留`);
    return null;
  }
  return {
    ...schema,
    title,
    ...(field.tips ? { description: field.tips } : {}),
    ...(field.default !== undefined ? { default: field.default } : {}),
  };
}
export function normalizeModel(
  raw: Json,
  modality: string,
  selectedMode?: string,
) {
  const tool = raw.schema;
  if (
    !tool ||
    typeof tool !== "object" ||
    !tool.properties ||
    !["image", "video"].includes(modality)
  )
    throw new AppError("UNSUPPORTED_SCHEMA", "无法识别的 LibTV Schema", 422);
  const props = tool.properties,
    config = tool.config ?? {},
    warnings: string[] = [];
  const textMode = modality === "image" ? "text2image" : "text2video";
  let canValidate = true;
  const modes = [
    ...new Set<string>([
      ...(config.generateTypes?.text !== undefined ? [textMode] : []),
      ...Object.keys(props.modeType?.items ?? {}),
      ...(!Array.isArray(config.settings) &&
      config.settings &&
      typeof config.settings === "object"
        ? Object.keys(config.settings)
        : []),
    ]),
  ];
  if (!modes.length)
    throw new AppError("UNSUPPORTED_SCHEMA", "Schema 缺少可确认的模式", 422);
  const mode = selectedMode ?? modes[0];
  if (!modes.includes(mode))
    throw new AppError("INVALID_MODE", "该模型没有此模式", 422);
  const grouped = new Set<string>();
  const section = (name: string): Json => {
    const definition = config[name];
    const keys: string[] = Array.isArray(definition)
      ? definition
      : (definition?.[mode] ?? []);
    const fields: Json = {};
    for (const key of keys) {
      grouped.add(key);
      const field = props[key],
        wireKey = field?.originalField ?? key;
      if (
        !safeKey.test(wireKey) ||
        ["__proto__", "constructor", "prototype"].includes(wireKey)
      ) {
        warnings.push(`${key}: 不安全字段名`);
        continue;
      }
      const converted = fieldSchema(field, key, warnings);
      if (converted) {
        if (Object.hasOwn(fields, wireKey)) {
          warnings.push(`${key}: originalField 冲突，已禁用`);
          delete fields[wireKey];
        } else fields[wireKey] = converted;
      }
    }
    return {
      ...objectSchema(fields),
      title: name === "settings" ? "基础设置" : "高级设置",
      default: {},
    };
  };
  const settings = section("settings"),
    advanced = section("advancedSettings");
  const prompt: Json = { type: "string", title: "提示词", default: "" };
  if (props.prompt.maxLength > 0) prompt.maxLength = props.prompt.maxLength;
  const mediaRange = props.modeType?.items?.[mode];
  const references: Json = {
    type: "array",
    title: "参考节点 key（仅校验，不上传）",
    uniqueItems: true,
    default: [],
    items: { type: "string", pattern: "^[a-zA-Z0-9_-]{1,150}$" },
  };
  if (Array.isArray(mediaRange) && mediaRange.every(Number.isFinite)) {
    references.minItems = mediaRange[0];
    references.maxItems = mediaRange[1];
  } else references.maxItems = 0;
  const fields: Json = {
    prompt,
    count: {
      type: "integer",
      title: "输出数量",
      enum: props.count,
      default: props.count?.[0],
    },
    settings,
    advancedSettings: advanced,
    referenceNodeKeys: references,
  };
  const metadata = new Set(["prompt", "count", "modeType"]);
  for (const [key, value] of Object.entries(props)) {
    if (grouped.has(key) || metadata.has(key)) continue;
    const field = value as any;
    // Unlisted capabilities and UI-only controls remain visible in raw Schema; never infer writable parameters.
    warnings.push(
      `${key}: ${field?.displayName ?? "能力/约束元数据"}，保留原文；当前不转换为可写参数`,
    );
  }
  const schema = objectSchema(fields, [
    "prompt",
    "count",
    ...(references.minItems > 0 ? ["referenceNodeKeys"] : []),
  ]);
  const allOf: Json[] = [];
  for (const rule of tool.rules ?? []) {
    if (rule.forModeTypes && !rule.forModeTypes.includes(mode)) continue;
    if (rule.whenHas) {
      canValidate = false;
      warnings.push(
        "whenHas: 当前仅有节点引用，无法确认媒体类型条件；此模式只读展示",
      );
    }
    const requirements = (rule.require ?? []).map((key: string) => {
      if (key === "prompt")
        return {
          required: ["prompt"],
          properties: {
            prompt: { type: "string", minLength: 1, pattern: "\\S" },
          },
        };
      if (key === "media")
        return {
          required: ["referenceNodeKeys"],
          properties: {
            referenceNodeKeys: {
              type: "array",
              minItems: Math.max(1, references.minItems ?? 0),
            },
          },
        };
      warnings.push(`rule.${key}: 必填规则无法转换，该模式不可完成校验`);
      canValidate = false;
      return false;
    });
    if (requirements.length)
      allOf.push(
        rule.mode === "any" ? { anyOf: requirements } : { allOf: requirements },
      );
  }
  // RJSF renders a top-level anyOf as alternative subforms. Keep one field tree,
  // and apply the same full rule schema through customValidate + server AJV.
  const validationSchema = { ...schema, ...(allOf.length ? { allOf } : {}) };
  return {
    mode,
    modes,
    jsonSchema: schema,
    validationSchema,
    canValidate,
    warnings,
    validationScope: "parameters-only",
    upstreamPermissionVerified: false,
    schemaModelName: tool.modelName ?? "",
  };
}
const ajv = new Ajv({
  allErrors: true,
  strict: false,
  coerceTypes: false,
  useDefaults: false,
  removeAdditional: false,
});
export function validateParameters(
  raw: Json,
  modality: string,
  mode: string,
  parameters: Json,
) {
  const form = normalizeModel(raw, modality, mode);
  if (!form.canValidate)
    throw new AppError(
      "SCHEMA_VALIDATION_UNSUPPORTED",
      "此模式包含未转换的素材条件；仅可只读查看，不宣称校验通过",
      422,
    );
  const validate = ajv.compile(form.validationSchema);
  if (!validate(parameters))
    throw new AppError(
      "INVALID_PARAMETERS",
      "参数校验失败；未执行生成",
      422,
      validate.errors?.map((e) => ({
        path: e.instancePath,
        keyword: e.keyword,
        message: e.message,
      })),
    );
  return {
    valid: true,
    generationEnabled: false,
    upstreamValidated: false,
    warnings: form.warnings,
    modeType: mode,
  };
}
export function serializeSettings(
  directoryModelName: string,
  parameters: Json,
): string[] {
  // A single JSON value is required: settings.foo is rejected by CLI 1.2.0.
  return [
    "-s",
    `model=${directoryModelName}`,
    "-s",
    `settings=${JSON.stringify(parameters.settings ?? {})}`,
    "-s",
    `advancedSettings=${JSON.stringify(parameters.advancedSettings ?? {})}`,
  ];
}
