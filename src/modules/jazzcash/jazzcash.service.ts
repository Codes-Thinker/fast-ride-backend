import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { getJazzCashConfig, JazzCashConfig } from '../../config/jazzcash.config';

export interface MWalletDebitParams {
  txnRefNo: string;
  /** Amount in PKR (rupees), e.g. 100.00 — converted to paisa internally. */
  amount: number;
  billReference: string;
  description: string;
  /** Last 6 digits of the customer's CNIC, per MWallet REST API v2.0. */
  cnicLast6: string;
  /** The customer's JazzCash-linked mobile account number, e.g. 03001234567. */
  mobileNumber: string;
}

export interface CardCheckoutParams {
  txnRefNo: string;
  amount: number;
  billReference: string;
  description: string;
}

export interface RefundParams {
  txnRefNo: string;
  amount: number;
}

export interface HostedCheckoutRequest {
  checkoutUrl: string;
  fields: Record<string, string>;
}

@Injectable()
export class JazzCashService {
  private readonly logger = new Logger(JazzCashService.name);
  private readonly config: JazzCashConfig;

  constructor() {
    this.config = getJazzCashConfig();
  }

  private formatDateTime(date: Date): string {
    const pad = (value: number) => String(value).padStart(2, '0');

    return (
      date.getFullYear().toString() +
      pad(date.getMonth() + 1) +
      pad(date.getDate()) +
      pad(date.getHours()) +
      pad(date.getMinutes()) +
      pad(date.getSeconds())
    );
  }

  private toPaisa(amount: number): string {
    return Math.round(amount * 100).toString();
  }

  /**
   * Sorts every non-empty pp_/ppmpf_ field A-Z, prepends the integrity salt,
   * joins with '&', then HMAC-SHA256s the result keyed by the same salt.
   * This is JazzCash's documented secure-hash algorithm and is identical
   * across every REST API (MWallet, Card Page Redirection, IPN, Status
   * Inquiry, Refunds) as long as the payload's keys are pp_/ppmpf_ prefixed.
   */
  generateSecureHash(fields: Record<string, string>): string {
    const sortedKeys = Object.keys(fields)
      .filter(
        (key) =>
          key !== 'pp_SecureHash' &&
          (key.startsWith('pp_') || key.startsWith('ppmpf_')) &&
          fields[key] !== undefined &&
          fields[key] !== null &&
          String(fields[key]).trim() !== '',
      )
      .sort();

    const hashString = [this.config.integritySalt, ...sortedKeys.map((key) => fields[key])].join(
      '&',
    );

    return crypto.createHmac('sha256', this.config.integritySalt).update(hashString).digest('hex');
  }

  verifySecureHash(fields: Record<string, string>): boolean {
    const receivedHash = fields['pp_SecureHash'];

    if (!receivedHash) {
      return false;
    }

    const expectedHash = this.generateSecureHash(fields);
    const receivedBuffer = Buffer.from(receivedHash.toLowerCase(), 'utf8');
    const expectedBuffer = Buffer.from(expectedHash.toLowerCase(), 'utf8');

    if (receivedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
  }

  /** pp_ResponseCode "000" — the API call itself succeeded (MWallet debit, Status Inquiry op, refunds). */
  isApiSuccessCode(responseCode: string | undefined | null): boolean {
    return responseCode === '000';
  }

  /** pp_ResponseCode "121" — the underlying payment/transaction is confirmed complete (IPN, Card redirect callback, pp_PaymentResponseCode on Status Inquiry). */
  isPaymentSuccessCode(responseCode: string | undefined | null): boolean {
    return responseCode === '121';
  }

  /** pp_ResponseCode "124"/"157" — the transaction is still in progress on JazzCash's side, not yet a final outcome. */
  isPendingCode(responseCode: string | undefined | null): boolean {
    return responseCode === '124' || responseCode === '157';
  }

  generateTxnRefNo(): string {
    const random = crypto.randomInt(100000, 999999);
    return `T${Date.now()}${random}`;
  }

  // ---------------------------------------------------------------------
  // MWallet REST API v2.0 (with CNIC) — direct mobile account debit
  // ---------------------------------------------------------------------

  buildMWalletDebitRequest(params: MWalletDebitParams): Record<string, string> {
    const now = new Date();
    const expiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const fields: Record<string, string> = {
      pp_Amount: this.toPaisa(params.amount),
      pp_BankID: '',
      pp_BillReference: params.billReference,
      pp_CNIC: params.cnicLast6,
      pp_Description: params.description,
      pp_Language: 'EN',
      pp_MerchantID: this.config.merchantId,
      pp_MobileNumber: params.mobileNumber,
      pp_Password: this.config.password,
      pp_ProductID: '',
      pp_SubMerchantID: '',
      pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: this.formatDateTime(now),
      pp_TxnExpiryDateTime: this.formatDateTime(expiry),
      pp_TxnRefNo: params.txnRefNo,
      ppmpf_1: '',
      ppmpf_2: '',
      ppmpf_3: '',
      ppmpf_4: '',
      ppmpf_5: '',
    };

    fields.pp_SecureHash = this.generateSecureHash(fields);

    return fields;
  }

  async debitMWallet(params: MWalletDebitParams): Promise<Record<string, any>> {
    const fields = this.buildMWalletDebitRequest(params);

    const response = await fetch(this.config.mWalletUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });

    const data = (await response.json()) as Record<string, any>;

    if (!this.verifySecureHash(data)) {
      this.logger.error(`MWallet debit response secure hash mismatch for txnRefNo=${params.txnRefNo}`);
      throw new Error('JazzCash MWallet debit response failed secure hash verification');
    }

    return data;
  }

  // ---------------------------------------------------------------------
  // Card Payment Page Redirection v1.1 — browser checkout
  // ---------------------------------------------------------------------

  buildCardCheckoutRequest(params: CardCheckoutParams): HostedCheckoutRequest {
    const now = new Date();
    const expiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const fields: Record<string, string> = {
      pp_Version: '1.1',
      pp_TxnType: 'MPAY',
      pp_Language: 'EN',
      pp_MerchantID: this.config.merchantId,
      pp_Password: this.config.password,
      pp_TxnRefNo: params.txnRefNo,
      pp_Amount: this.toPaisa(params.amount),
      pp_TxnCurrency: 'PKR',
      pp_TxnDateTime: this.formatDateTime(now),
      pp_BillReference: params.billReference,
      pp_Description: params.description,
      pp_TxnExpiryDateTime: this.formatDateTime(expiry),
      pp_ReturnURL: this.config.returnUrl,
      pp_SubMerchantID: '',
      pp_BankID: '',
      pp_ProductID: '',
      ppmpf_1: '',
      ppmpf_2: '',
      ppmpf_3: '',
      ppmpf_4: '',
      ppmpf_5: '',
    };

    fields.pp_SecureHash = this.generateSecureHash(fields);

    return {
      checkoutUrl: this.config.cardCheckoutUrl,
      fields,
    };
  }

  // ---------------------------------------------------------------------
  // Status Inquiry API v2.0
  // ---------------------------------------------------------------------

  async inquireStatus(txnRefNo: string): Promise<Record<string, any>> {
    const fields: Record<string, string> = {
      pp_TxnRefNo: txnRefNo,
      pp_MerchantID: this.config.merchantId,
      pp_Password: this.config.password,
    };

    fields.pp_SecureHash = this.generateSecureHash(fields);

    try {
      const response = await fetch(this.config.statusInquiryUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      });

      const data = (await response.json()) as Record<string, any>;

      if (!this.verifySecureHash(data)) {
        this.logger.error(`Status Inquiry response secure hash mismatch for txnRefNo=${txnRefNo}`);
        throw new Error('JazzCash Status Inquiry response failed secure hash verification');
      }

      return data;
    } catch (error) {
      this.logger.error(`JazzCash status inquiry failed for ${txnRefNo}: ${(error as Error).message}`);
      throw error;
    }
  }

  // ---------------------------------------------------------------------
  // IPN (Instant Payment Notification)
  // ---------------------------------------------------------------------

  /** The acknowledgement JazzCash's IPN sender expects back, regardless of the underlying transaction's outcome. */
  buildIpnAckResponse(): Record<string, string> {
    const fields: Record<string, string> = {
      pp_ResponseCode: '000',
      pp_ResponseMessage: 'IPN received successfully',
    };

    fields.pp_SecureHash = this.generateSecureHash(fields);

    return fields;
  }

  // ---------------------------------------------------------------------
  // MWallet Refund API v1.1
  // ---------------------------------------------------------------------

  async refundMWallet(params: RefundParams): Promise<Record<string, any>> {
    const fields: Record<string, string> = {
      pp_MerchantID: this.config.merchantId,
      pp_Password: this.config.password,
      pp_TxnRefNo: params.txnRefNo,
      pp_Amount: this.toPaisa(params.amount),
      pp_TxnCurrency: 'PKR',
      pp_MerchantMPIN: this.config.merchantMPIN,
    };

    fields.pp_SecureHash = this.generateSecureHash(fields);

    const response = await fetch(this.config.mWalletRefundUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });

    return (await response.json()) as Record<string, any>;
  }

  // ---------------------------------------------------------------------
  // Card Refund API v2.0
  // ---------------------------------------------------------------------

  async refundCard(params: RefundParams): Promise<Record<string, any>> {
    const fields: Record<string, string> = {
      pp_TxnRefNo: params.txnRefNo,
      pp_Amount: this.toPaisa(params.amount),
      pp_TxnCurrency: 'PKR',
      pp_MerchantID: this.config.merchantId,
      pp_Password: this.config.password,
      pp_MerchantMPIN: this.config.merchantMPIN,
    };

    fields.pp_SecureHash = this.generateSecureHash(fields);

    const response = await fetch(this.config.cardRefundUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });

    // Card Refund responses use unprefixed field names (ResponseCode, not
    // pp_ResponseCode) per JazzCash's docs, so callers must read
    // `.ResponseCode` here rather than `.pp_ResponseCode`.
    return (await response.json()) as Record<string, any>;
  }
}
