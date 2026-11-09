/**
 * Future integration boundaries, not working provider SDKs.
 * No implementation, credential, provider URL or live network operation exists here.
 * Importing these types cannot enable a service.
 */

export type ProviderUnavailableReason =
  | "not_configured"
  | "commercial_agreement_pending"
  | "regulatory_approval_pending"
  | "device_not_qualified"
  | "provider_unavailable";

export type ProviderResult<T> =
  | {
      readonly status: "verified";
      readonly value: T;
      readonly providerReference: string;
      readonly observedAt: string;
    }
  | {
      readonly status: "unavailable";
      readonly reason: ProviderUnavailableReason;
    };

export interface OperationContext {
  readonly requestId: string;
  readonly idempotencyKey: string;
}

export interface CarrierAdapter {
  readonly providerId: string;
  provisionSubscription(
    input: {
      readonly subscriberReference: string;
      readonly verifiedRegistrationReference: string;
      readonly contractedOfferReference: string;
      readonly simFormat: "physical" | "esim";
    },
    context: OperationContext,
  ): Promise<ProviderResult<{ readonly subscriptionReference: string; readonly state: "pending" | "active" }>>;
  getUsage(subscriptionReference: string): Promise<ProviderResult<{
    readonly consumedBytes: number;
    readonly measuredThrough: string;
    readonly periodStartsAt: string;
    readonly periodEndsAt: string;
  }>>;
}

export interface SatelliteAdapter {
  readonly providerId: string;
  getEligibility(input: {
    readonly subscriptionReference: string;
    readonly countryCode: string;
    readonly qualifiedDeviceReference: string;
  }): Promise<ProviderResult<{
    readonly eligible: boolean;
    readonly availableServices: readonly ("sms" | "app_data" | "app_voice" | "native_voice")[];
    readonly qualificationReference: string;
  }>>;
}

export interface IdentityAdapter {
  readonly issuer: string;
  verifyAccessToken(token: string): Promise<ProviderResult<{
    readonly subject: string;
    readonly roles: readonly string[];
    readonly scopes: readonly string[];
    readonly expiresAt: string;
  }>>;
}

export interface PaymentAdapter {
  readonly providerId: string;
  createPayment(
    input: {
      readonly orderReference: string;
      readonly amountMinor: number;
      readonly currency: string;
      readonly payerReference: string;
    },
    context: OperationContext,
  ): Promise<ProviderResult<{
    readonly paymentReference: string;
    readonly status: "pending";
    readonly hostedCheckoutUrl: string;
  }>>;
  verifyWebhook(rawBody: Uint8Array, signature: string): Promise<ProviderResult<{
    readonly eventId: string;
    readonly paymentReference: string;
    readonly orderReference: string;
    readonly amountMinor: number;
    readonly currency: string;
    readonly status: "paid" | "failed" | "refunded";
  }>>;
}
