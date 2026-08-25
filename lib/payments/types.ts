export type CheckoutInput = {
  attemptId: string;
  obligationId: string;
  email: string;
  amountMinor: number;
  currencyCode: string;
  callbackUrl: string;
};

export type CheckoutResult = {
  providerReference: string;
  authorizationUrl: string;
};

export interface PaymentAdapter {
  key: string;
  initializeCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  verifyWebhook(rawBody: string, signature: string | null): boolean;
}
