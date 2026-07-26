const { handleOptions, optionalEnv } = require("./_lead-router-lib");

module.exports = async function handler(request, response) {
  if (handleOptions(request, response)) return;

  response.status(200).json({
    vapidPublicKey: optionalEnv("VAPID_PUBLIC_KEY"),
    pushEnabled: Boolean(optionalEnv("VAPID_PUBLIC_KEY") && optionalEnv("VAPID_PRIVATE_KEY")),
    emailEnabled: Boolean(optionalEnv("RESEND_API_KEY") && optionalEnv("EMAIL_FROM")),
  });
};
