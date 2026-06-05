import paypal from "@paypal/checkout-server-sdk";

// ─────────────────────────────────────────
// PAYPAL ENVIRONMENT
// sandbox = test mode
// live    = production mode
// ─────────────────────────────────────────
const environment = () => {
  const clientId     = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  if (process.env.PAYPAL_MODE === "live") {
    return new paypal.core.LiveEnvironment(clientId, clientSecret);
  }
  return new paypal.core.SandboxEnvironment(clientId, clientSecret);
};

const paypalClient = () => new paypal.core.PayPalHttpClient(environment());

export default paypalClient;
