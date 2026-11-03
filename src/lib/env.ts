function required(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill in your Supabase project credentials.`
    );
  }
  return value;
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseAnonKey() {
    return required("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  },
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get appUrl() {
    return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  },
  get resendApiKey() {
    return process.env.RESEND_API_KEY ?? "";
  },
  get emailFrom() {
    return process.env.EMAIL_FROM ?? "PermiTrack <no-reply@example.edu>";
  },
  get aiConfigured() {
    return Boolean(process.env.AI_API_KEY);
  },
  get aiBaseUrl() {
    return process.env.AI_BASE_URL ?? "https://api.openai.com/v1";
  },
  get aiApiKey() {
    return process.env.AI_API_KEY ?? "";
  },
  get aiModel() {
    return process.env.AI_MODEL ?? "gpt-4o-mini";
  },
};
