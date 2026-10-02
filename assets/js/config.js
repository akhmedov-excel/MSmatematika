window.MSM_CONFIG = Object.freeze({
  supabaseUrl: "REPLACE_WITH_SUPABASE_URL",
  supabaseAnonKey: "REPLACE_WITH_SUPABASE_ANON_KEY",
  siteName: "MSmatematika",
  testMinutes: 150,
  totalVariants: 20,
  officialLevelThresholds: [
    { min: 70, level: "A+" },
    { min: 65, level: "A" },
    { min: 60, level: "B+" },
    { min: 55, level: "B" },
    { min: 50, level: "C+" },
    { min: 46, level: "C" }
  ]
});
