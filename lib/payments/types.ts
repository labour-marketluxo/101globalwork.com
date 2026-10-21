export type CheckoutInput = {
  attemptId: string;
  obligationId: string;
  email: string;
  amountMinor: number;
  currencyCode: string;
  callbackUrl: string;
  /**
   * The payment channels the caller chose, restricted to the ones the adapter is configured to offer in this
   * market. Empty or absent means "let the gateway decide", which is what every caller did before the
   * checkout page offered a choice.
   */
  channels?: string[];
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
