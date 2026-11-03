"use client";

import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError } from "@/components/form-message";
import { isFieldVisible } from "@/lib/forms/schema";
import type { FormField, FormSchema } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface SchemaFieldsProps {
  schema: FormSchema;
  values: Record<string, unknown>;
  onChange?: (key: string, value: unknown) => void;
  /** Limit rendering to these field keys (e.g. the current stage's editable fields). */
  onlyKeys?: string[] | null;
  disabled?: boolean;
  fieldErrors?: Record<string, string[]>;
  /** Read-only rendering: show values as text instead of inputs. */
  readOnly?: boolean;
  className?: string;
}

function optionsFor(field: FormField) {
  return (field.options ?? []).map((option) => ({
    value: typeof option === "string" ? option : option.value,
    label: typeof option === "string" ? option : option.label ?? option.value,
  }));
}

function asString(value: unknown) {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function SchemaFields({
  schema,
  values,
  onChange,
  onlyKeys,
  disabled = false,
  fieldErrors,
  readOnly = false,
  className,
}: SchemaFieldsProps) {
  const allowed = useMemo(() => (onlyKeys ? new Set(onlyKeys) : null), [onlyKeys]);

  const fields = schema.fields.filter((field) => {
    if (allowed && !allowed.has(field.key)) return false;
    return isFieldVisible(field, values);
  });

  if (fields.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No fields to show for this section.
      </p>
    );
  }

  const update = (key: string, value: unknown) => onChange?.(key, value);

  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", className)}>
      {fields.map((field) => {
        const value = values[field.key];
        const error = fieldErrors?.[`f_${field.key}`]?.[0];
        const id = `f_${field.key}`;
        const wide =
          field.type === "textarea" ||
          field.type === "multiselect" ||
          field.type === "checkbox" ||
          (field.options?.length ?? 0) > 4;

        if (readOnly) {
          return (
            <div key={field.key} className={cn("space-y-1", wide && "sm:col-span-2")}>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {field.label}
              </p>
              <p className="whitespace-pre-line text-sm">
                {field.type === "checkbox"
                  ? value
                    ? "Yes"
                    : "No"
                  : asString(value) || "—"}
              </p>
            </div>
          );
        }

        if (field.type === "checkbox") {
          return (
            <div key={field.key} className="space-y-1.5 sm:col-span-2">
              <label
                htmlFor={id}
                className="flex items-start gap-2.5 rounded-lg border p-3 text-sm"
              >
                <Checkbox
                  id={id}
                  name={id}
                  checked={Boolean(value)}
                  disabled={disabled}
                  onCheckedChange={(checked) => update(field.key, checked === true)}
                />
                <span>
                  <span className="font-medium">{field.label}</span>
                  {field.help ? (
                    <span className="mt-0.5 block text-xs text-muted-foreground">{field.help}</span>
                  ) : null}
                </span>
              </label>
              <FieldError errors={error ? [error] : undefined} />
            </div>
          );
        }

        if (field.type === "multiselect") {
          const selected = Array.isArray(value) ? (value as string[]) : [];
          const options = optionsFor(field);
          return (
            <fieldset key={field.key} className="space-y-1.5 sm:col-span-2">
              <legend className="text-sm font-medium">
                {field.label}
                {field.required ? <span className="ml-0.5 text-destructive">*</span> : null}
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {options.map((option) => {
                  const checked = selected.includes(option.value);
                  return (
                    <label
                      key={option.value}
                      className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                    >
                      <Checkbox
                        name={id}
                        value={option.value}
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={(next) => {
                          const set = new Set(selected);
                          if (next === true) set.add(option.value);
                          else set.delete(option.value);
                          update(field.key, Array.from(set));
                        }}
                      />
                      {option.label}
                    </label>
                  );
                })}
              </div>
              {field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null}
              <FieldError errors={error ? [error] : undefined} />
            </fieldset>
          );
        }

        if (field.type === "select") {
          const options = optionsFor(field);
          return (
            <div key={field.key} className={cn("space-y-1.5", wide && "sm:col-span-2")}>
              <Label htmlFor={id}>
                {field.label}
                {field.required ? <span className="ml-0.5 text-destructive">*</span> : null}
              </Label>
              <select
                id={id}
                name={id}
                value={asString(value)}
                disabled={disabled}
                required={field.required}
                onChange={(event) => update(field.key, event.target.value)}
                className="flex h-9 w-full rounded-lg border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">{field.placeholder ?? "Select…"}</option>
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null}
              <FieldError errors={error ? [error] : undefined} />
            </div>
          );
        }

        if (field.type === "textarea") {
          return (
            <div key={field.key} className="space-y-1.5 sm:col-span-2">
              <Label htmlFor={id}>
                {field.label}
                {field.required ? <span className="ml-0.5 text-destructive">*</span> : null}
              </Label>
              <Textarea
                id={id}
                name={id}
                value={asString(value)}
                disabled={disabled}
                required={field.required}
                placeholder={field.placeholder}
                rows={4}
                onChange={(event) => update(field.key, event.target.value)}
              />
              {field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null}
              <FieldError errors={error ? [error] : undefined} />
            </div>
          );
        }

        const inputType =
          field.type === "email"
            ? "email"
            : field.type === "number"
              ? "number"
              : field.type === "date"
                ? "date"
                : field.type === "datetime"
                  ? "datetime-local"
                  : "text";

        return (
          <div key={field.key} className={cn("space-y-1.5", wide && "sm:col-span-2")}>
            <Label htmlFor={id}>
              {field.label}
              {field.required ? <span className="ml-0.5 text-destructive">*</span> : null}
            </Label>
            <Input
              id={id}
              name={id}
              type={inputType}
              value={asString(value)}
              disabled={disabled}
              required={field.required}
              placeholder={field.placeholder}
              step={field.type === "number" ? "any" : undefined}
              onChange={(event) => update(field.key, event.target.value)}
            />
            {field.help ? <p className="text-xs text-muted-foreground">{field.help}</p> : null}
            <FieldError errors={error ? [error] : undefined} />
          </div>
        );
      })}
    </div>
  );
}
