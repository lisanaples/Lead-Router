const {
  getWorkspace,
  handleOptions,
  optionalEnv,
  supabaseBaseUrl,
} = require("./_lead-router-lib");

function safeHost(value) {
  try {
    return new URL(value).host;
  } catch {
    return "";
  }
}

module.exports = async function handler(request, response) {
  if (handleOptions(request, response)) return;

  const rawSupabaseUrl = optionalEnv("SUPABASE_URL");
  let cleanedSupabaseUrl = "";
  let workspaceRead = false;
  let workspaceError = "";

  try {
    cleanedSupabaseUrl = supabaseBaseUrl();
  } catch (error) {
    workspaceError = error.message;
  }

  if (cleanedSupabaseUrl && optionalEnv("SUPABASE_SERVICE_ROLE_KEY")) {
    try {
      await getWorkspace();
      workspaceRead = true;
    } catch (error) {
      workspaceError = error.message;
    }
  }

  response.status(200).json({
    ok: workspaceRead,
    supabaseUrlPresent: Boolean(rawSupabaseUrl),
    supabaseUrlHost: safeHost(cleanedSupabaseUrl),
    supabaseUrlLooksRight: /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cleanedSupabaseUrl),
    serviceRoleKeyPresent: Boolean(optionalEnv("SUPABASE_SERVICE_ROLE_KEY")),
    vapidPublicKeyPresent: Boolean(optionalEnv("VAPID_PUBLIC_KEY")),
    vapidPrivateKeyPresent: Boolean(optionalEnv("VAPID_PRIVATE_KEY")),
    workspaceRead,
    error: workspaceError,
  });
};
