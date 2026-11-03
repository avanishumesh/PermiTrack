import { z } from "zod";
import { ALLOWED_MIME_TYPES } from "@/lib/constants";

const uuid = z.string().uuid("Select a valid record");
const optionalUuid = z
  .union([uuid, z.literal(""), z.null()])
  .optional()
  .transform((value) => (value ? value : null));

const optionalText = z
  .string()
  .trim()
  .max(4000)
  .optional()
  .transform((value) => (value === "" ? undefined : value));

export const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Enter your full name").max(120),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters"),
});

export const projectInputSchema = z.object({
  title: z.string().trim().min(3, "Give the project a title").max(160),
  description: z.string().trim().max(4000).optional(),
  departmentId: uuid,
  category: z.string().trim().max(80).optional(),
  facultyGuideId: optionalUuid,
});

export const projectUpdateSchema = projectInputSchema.extend({
  projectId: uuid,
});

export const memberInputSchema = z.object({
  projectId: uuid,
  userId: uuid,
  role: z.enum(["OWNER", "EDITOR", "MEMBER"]).default("MEMBER"),
});

export const requestCreateSchema = z.object({
  projectId: uuid,
  permissionTypeId: uuid,
});

export const requestActionSchema = z.object({
  action: z.enum([
    "APPROVE_STAGE",
    "REJECT_REQUEST",
    "REQUEST_CHANGES",
    "ASK_QUERY",
    "ANSWER_QUERY",
    "RESUBMIT_REQUEST",
    "EDIT_REQUEST_BY_AUTHORITY",
    "FORWARD_STAGE",
    "DELEGATE_STAGE",
    "WITHDRAW_REQUEST",
  ]),
  stageStateId: optionalUuid,
  comment: z.string().max(4000).optional(),
  payload: z.record(z.unknown()).optional().default({}),
});

export const answerQuerySchema = z.object({
  queryId: uuid,
  response: z.string().trim().min(1, "Write a response").max(4000),
});

export const withdrawSchema = z.object({
  reason: z.string().trim().max(2000).optional(),
});

export const revisionInputSchema = z.object({
  reason: z.string().trim().max(2000).optional(),
  formData: z.record(z.unknown()),
});

export const documentTypeInputSchema = z.object({
  id: optionalUuid,
  permissionTypeId: uuid,
  name: z.string().trim().min(2, "Name the document").max(160),
  description: z.string().trim().max(1000).optional(),
  isRequired: z.boolean().default(true),
  acceptedMimeTypes: z
    .array(z.enum(ALLOWED_MIME_TYPES))
    .min(1)
    .default([...ALLOWED_MIME_TYPES]),
  maxSizeMb: z.coerce.number().int().min(1).max(10).default(10),
});

const fieldConditionSchema: z.ZodTypeAny = z.lazy(() =>
  z
    .object({
      field: z.string().optional(),
      equals: z.unknown().optional(),
      not_equals: z.unknown().optional(),
      in: z.array(z.unknown()).optional(),
      exists: z.boolean().optional(),
      all: z.array(fieldConditionSchema).optional(),
      any: z.array(fieldConditionSchema).optional(),
    })
    .passthrough()
);

export const formFieldSchema = z
  .object({
    key: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,63}$/, "Keys must be lower_snake_case"),
    label: z.string().trim().min(1, "Every field needs a label").max(160),
    type: z.enum([
      "text",
      "textarea",
      "email",
      "date",
      "datetime",
      "number",
      "select",
      "multiselect",
      "checkbox",
    ]),
    required: z.boolean().optional(),
    material: z.boolean().optional(),
    options: z
      .array(
        z.object({
          value: z.string().min(1),
          label: z.string().min(1),
        })
      )
      .optional(),
    placeholder: z.string().max(200).optional(),
    help: z.string().max(500).optional(),
    visible_if: fieldConditionSchema.optional(),
  })
  .superRefine((field, ctx) => {
    if (["select", "multiselect"].includes(field.type)) {
      if (!field.options || field.options.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Add at least one option" });
      }
    }
  });

export const formSchemaSchema = z
  .object({ fields: z.array(formFieldSchema).max(60) })
  .superRefine((schema, ctx) => {
    const seen = new Set<string>();
    for (const field of schema.fields) {
      if (seen.has(field.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate field key "${field.key}"`,
        });
      }
      seen.add(field.key);
    }
  });

export const permissionTypeInputSchema = z.object({
  id: optionalUuid,
  name: z.string().trim().min(2, "Name the permission type").max(160),
  description: z.string().trim().max(2000).optional(),
  departmentId: optionalUuid,
  isActive: z.boolean().default(true),
  formSchema: formSchemaSchema,
  eligibilityRules: z.record(z.unknown()).nullable().optional(),
});

export const workflowStageInputSchema = z
  .object({
    sequence: z.coerce.number().int().min(1).optional(),
    name: z.string().trim().min(2, "Name the stage").max(160),
    approverType: z.enum([
      "PROJECT_FACULTY_GUIDE",
      "DEPARTMENT_HEAD",
      "ROLE",
      "USER",
      "LAB_MANAGER",
      "DEAN",
      "CUSTOM",
    ]),
    approverRoleId: optionalUuid,
    approverUserId: optionalUuid,
    departmentScope: z
      .enum(["PROJECT_DEPARTMENT", "PARENT_DEPARTMENT", "ROOT_DEPARTMENT"])
      .default("PROJECT_DEPARTMENT"),
    canEditFields: z.array(z.string()).default([]),
    invalidatesOn: z.array(z.string()).default([]),
    slaHours: z
      .union([z.coerce.number().int().min(1).max(8760), z.literal(""), z.null()])
      .optional()
      .transform((value) => (value === "" || value === null || value === undefined ? null : Number(value))),
    conditions: z.record(z.unknown()).nullable().optional(),
  })
  .superRefine((stage, ctx) => {
    if (stage.approverType === "ROLE" && !stage.approverRoleId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select a role for this stage" });
    }
    if (stage.approverType === "USER" && !stage.approverUserId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select a user for this stage" });
    }
  });

export const workflowInputSchema = z.object({
  id: optionalUuid,
  permissionTypeId: uuid,
  name: z.string().trim().min(2, "Name the workflow").max(160),
  stages: z.array(workflowStageInputSchema).min(1, "Add at least one stage").max(20),
});

export const roleAssignmentSchema = z.array(
  z.object({
    roleId: uuid,
    departmentId: optionalUuid,
  })
);

export const userCreateSchema = z.object({
  name: z.string().trim().min(2, "Enter a full name").max(120),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().min(8, "Use at least 8 characters").optional(),
  departmentId: optionalUuid,
  roles: roleAssignmentSchema.default([]),
});

export const userUpdateSchema = z.object({
  userId: uuid,
  name: z.string().trim().min(2).max(120),
  departmentId: optionalUuid,
  isActive: z.boolean().default(true),
});

export const departmentInputSchema = z.object({
  id: optionalUuid,
  name: z.string().trim().min(2, "Name the department").max(160),
  parentId: optionalUuid,
  headUserId: optionalUuid,
});

export const notificationReadSchema = z.object({
  notificationId: uuid.optional(),
  all: z.boolean().optional(),
});

export const aiSuggestSchema = z.object({
  projectId: uuid,
  description: z.string().trim().min(20, "Describe the project in a little more detail").max(4000),
});

export const aiDocumentCheckSchema = z.object({
  requestId: uuid,
});

export const aiQuerySchema = z.object({
  requestId: uuid,
  queryId: uuid,
});

export type ProjectInput = z.infer<typeof projectInputSchema>;
export type PermissionTypeInput = z.infer<typeof permissionTypeInputSchema>;
export type WorkflowInput = z.infer<typeof workflowInputSchema>;
export type WorkflowStageInput = z.infer<typeof workflowStageInputSchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type DepartmentInput = z.infer<typeof departmentInputSchema>;
