import { z } from "zod";
import type { FormField, FormSchema } from "@/lib/types";
import { AppError } from "@/lib/errors";

function optionValue(option: unknown): string | null {
  if (typeof option === "string") return option;
  if (option && typeof option === "object" && "value" in option) {
    const value = (option as { value?: unknown }).value;
    return value == null ? null : String(value);
  }
  return null;
}

function looseEquals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === "boolean" || typeof b === "boolean") {
    return Boolean(a) === Boolean(b);
  }
  if (typeof a === "number" || typeof b === "number") {
    return Number(a) === Number(b);
  }
  return String(a) === String(b);
}

function isEmpty(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0)
  );
}

/** Mirrors public.evaluate_condition in Postgres. */
export function isFieldVisible(field: FormField, data: Record<string, unknown>): boolean {
  const condition = field.visible_if;
  if (!condition) return true;

  if (Array.isArray(condition.all)) {
    return condition.all.every((item) =>
      isConditionTrue(item, data)
    );
  }
  if (Array.isArray(condition.any)) {
    return condition.any.some((item) => isConditionTrue(item, data));
  }
  return isConditionTrue(condition, data);
}

function isConditionTrue(
  condition: NonNullable<FormField["visible_if"]>,
  data: Record<string, unknown>
): boolean {
  if (Array.isArray(condition.all)) return condition.all.every((c) => isConditionTrue(c, data));
  if (Array.isArray(condition.any)) return condition.any.some((c) => isConditionTrue(c, data));
  if (!condition.field) return true;

  const value = data[condition.field];

  if (typeof condition.exists === "boolean") {
    return condition.exists ? !isEmpty(value) : isEmpty(value);
  }
  if ("not_equals" in condition) return !looseEquals(value, condition.not_equals);
  if (Array.isArray(condition.in)) return condition.in.some((item) => looseEquals(value, item));
  if ("equals" in condition) return looseEquals(value, condition.equals);

  return true;
}

function fieldValidator(field: FormField): z.ZodTypeAny {
  switch (field.type) {
    case "email":
      return z.string().email(`${field.label} must be a valid email address`);
    case "number":
      return z
        .union([z.number(), z.string()])
        .transform((value) => Number(value))
        .refine((value) => Number.isFinite(value), `${field.label} must be a number`);
    case "checkbox":
      return z.boolean();
    case "date":
    case "datetime":
      return z.string().refine((value) => !Number.isNaN(new Date(value).getTime()), {
        message: `${field.label} must be a valid date`,
      });
    case "select": {
      const allowed = (field.options ?? []).map(optionValue).filter((v): v is string => v !== null);
      return z
        .string()
        .refine((value) => allowed.length === 0 || allowed.includes(value), {
          message: `${field.label} has an invalid selection`,
        });
    }
    case "multiselect": {
      const allowed = (field.options ?? []).map(optionValue).filter((v): v is string => v !== null);
      return z
        .array(z.string())
        .refine((values) => values.every((value) => allowed.length === 0 || allowed.includes(value)), {
          message: `${field.label} contains an invalid selection`,
        });
    }
    default:
      return z.string();
  }
}

/**
 * Builds a Zod schema from a permission type's form schema. Mirrors
 * public.validate_form_data (visibility-aware required fields and types).
 */
export function buildZodSchema(schema: FormSchema) {
  return z
    .object({})
    .passthrough()
    .superRefine((data, ctx) => {
      for (const field of schema.fields) {
        if (!isFieldVisible(field, data)) continue;

        const value = data[field.key];
        if (isEmpty(value)) {
          if (field.required) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `${field.label} is required`,
              path: [field.key],
            });
          }
          continue;
        }

        const parsed = fieldValidator(field).safeParse(value);
        if (!parsed.success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: parsed.error.issues[0]?.message ?? `Invalid value for ${field.label}`,
            path: [field.key],
          });
        }
      }
    });
}

export function normaliseFormData(
  schema: FormSchema,
  values: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of schema.fields) {
    if (!isFieldVisible(field, values)) continue;
    const value = values[field.key];
    if (value === undefined || value === null || value === "") continue;
    if (field.type === "number" && typeof value === "string") {
      const number = Number(value);
      if (Number.isFinite(number)) result[field.key] = number;
      continue;
    }
    result[field.key] = value;
  }
  return result;
}

export function validateFormData(schema: FormSchema, values: Record<string, unknown>) {
  const normalised = normaliseFormData(schema, values);
  const parsed = buildZodSchema(schema).safeParse(normalised);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new AppError("PT422", issue?.message ?? "The form contains invalid values.", 422);
  }
  return normalised;
}

/** Convert submitted HTML form fields into typed values. */
export function parseFormData(schema: FormSchema, formData: FormData): Record<string, unknown> {
  const values: Record<string, unknown> = {};

  for (const field of schema.fields) {
    const name = `f_${field.key}`;
    if (field.type === "checkbox") {
      const raw = formData.get(name);
      values[field.key] = raw === "on" || raw === "true";
      continue;
    }
    if (field.type === "multiselect") {
      const raw = formData.getAll(name).map(String).filter(Boolean);
      if (raw.length) values[field.key] = raw;
      continue;
    }
    const raw = formData.get(name);
    if (raw === null) continue;
    const text = String(raw).trim();
    if (text === "") continue;
    values[field.key] = text;
  }

  return normaliseFormData(schema, values);
}

export function defaultFormValues(
  schema: FormSchema,
  existing?: Record<string, unknown> | null
): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const field of schema.fields) {
    const value = existing?.[field.key];
    if (value !== undefined && value !== null) {
      values[field.key] = value;
    } else if (field.type === "checkbox") {
      values[field.key] = false;
    }
  }
  return values;
}

export function visibleFields(schema: FormSchema, values: Record<string, unknown>) {
  return schema.fields.filter((field) => isFieldVisible(field, values));
}

export function formatFieldValue(field: FormField, value: unknown): string {
  if (isEmpty(value)) return "—";
  if (field.type === "checkbox") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        const option = field.options?.find((o) => o.value === String(item));
        return option?.label ?? String(item);
      })
      .join(", ");
  }
  if (field.type === "select") {
    const option = field.options?.find((o) => o.value === String(value));
    return option?.label ?? String(value);
  }
  return String(value);
}
