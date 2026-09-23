import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getJazzCashConfig } from '../../../config/jazzcash.config';
import { JazzCashService } from '../../jazzcash/jazzcash.service';
import { User } from '../../user/entities/user.entity';
import { WalletService } from '../../wallet/services/wallet.service';
import { WalletTopUp } from '../../wallet/entities/wallet-top-up.entity';

@Injectable()
export class WalletTopUpService {
  private readonly logger = new Logger(WalletTopUpService.name);
  private readonly frontendSuccessUrl: string;
  private readonly frontendFailureUrl: string;
  private readonly txnExpiryMinutes: number;

  constructor(
    @InjectRepository(WalletTopUp)
    private readonly walletTopUpRepository: Repository<WalletTopUp>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jazzCashService: JazzCashService,
    private readonly walletService: WalletService,
  ) {
    const config = getJazzCashConfig();
    this.frontendSuccessUrl = config.frontendSuccessUrl;
    this.frontendFailureUrl = config.frontendFailureUrl;
    this.txnExpiryMinutes = config.txnExpiryMinutes;
  }

  /** JazzCash pp_MobileNumber wants local format (03XXXXXXXXX); our users store E.164 (+92XXXXXXXXXX). */
  private toLocalMobileNumber(phone: string): string {
    if (/^03\d{9}$/.test(phone)) {
      return phone;
    }

    const match = phone.match(/^\+?92(\d{10})$/);
    if (match) {
      return `0${match[1]}`;
    }

    return phone;
  }

  async initiate(userId: string, amount: number, method: 'mwallet' | 'card', mobileNumber?: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.is_driver) {
      throw new ForbiddenException('Only drivers can top up a wallet');
    }

    if (!amount || amount <= 0) {
      throw new BadRequestException('Top-up amount must be greater than 0');
    }

    if (method === 'mwallet') {
      return this.initiateMWallet(user, amount, mobileNumber);
    }

    return this.initiateCard(user, amount);
  }

  // ---------------------------------------------------------------------
  // MWallet REST API v2.0 — direct mobile account debit (synchronous)
  // ---------------------------------------------------------------------

  private async initiateMWallet(user: User, amount: number, mobileNumberInput?: string) {
    if (!user.cnic) {
      throw new BadRequestException(
        'CNIC required before topping up — set it first via PATCH /api/users/driver/cnic',
      );
    }

    const mobileNumber = mobileNumberInput
      ? this.toLocalMobileNumber(mobileNumberInput)
      : this.toLocalMobileNumber(user.phone);

    if (!/^03\d{9}$/.test(mobileNumber)) {
      throw new BadRequestException(
        'A valid JazzCash mobile account number is required, e.g. 03001234567',
      );
    }

    const topUp = this.walletTopUpRepository.create({
      userId: user.id,
      provider: 'jazzcash',
      method: 'mwallet',
      mobileNumber,
      amount: amount.toFixed(2),
      currency: 'PKR',
      status: 'pending',
      txnRefNo: this.jazzCashService.generateTxnRefNo(),
      billReference: user.id.replace(/-/g, '').slice(0, 20),
      expiresAt: new Date(Date.now() + this.txnExpiryMinutes * 60 * 1000),
    });

    await this.walletTopUpRepository.save(topUp);

    const response = await this.jazzCashService.debitMWallet({
      txnRefNo: topUp.txnRefNo,
      amount,
      billReference: topUp.billReference as string,
      description: `FastRide wallet top-up ${topUp.id}`,
      cnicLast6: user.cnic.slice(-6),
      mobileNumber,
    });

    await this.applyMWalletResult(topUp, response);

    return { topUp: this.formatTopUp(topUp), jazzcash: response };
  }

  private async applyMWalletResult(topUp: WalletTopUp, response: Record<string, any>) {
    const responseCode = response['pp_ResponseCode'];
    const wasAlreadyCompleted = topUp.status === 'completed';

    topUp.jazzcashResponseCode = responseCode ?? null;
    topUp.jazzcashResponseMessage = response['pp_ResponseMessage'] ?? null;
    topUp.jazzcashRetrievalReferenceNo = response['pp_RetreivalReferenceNo'] ?? null;
    topUp.jazzcashAuthCode = response['pp_AuthCode'] ?? null;
    topUp.rawCallbackPayload = response;

    if (this.jazzCashService.isApiSuccessCode(responseCode)) {
      topUp.status = 'completed';
      topUp.paidAt = topUp.paidAt ?? new Date();
    } else {
      topUp.status = 'failed';
    }

    await this.walletTopUpRepository.save(topUp);

    if (!wasAlreadyCompleted && topUp.status === 'completed') {
      await this.creditWalletForTopUp(topUp);
    }
  }

  // ---------------------------------------------------------------------
  // Card Page Redirection v1.1 — browser checkout
  // ---------------------------------------------------------------------

  private async initiateCard(user: User, amount: number) {
    // Reuse an in-flight pending top-up for the same amount instead of
    // minting a new pp_TxnRefNo every time, so a retried initiate doesn't
    // risk a rider/driver getting charged twice for the same intended top-up.
    const existingPending = await this.walletTopUpRepository.findOne({
      where: { userId: user.id, amount: amount.toFixed(2), status: 'pending', method: 'card' },
      order: { createdAt: 'DESC' },
    });

    let topUp: WalletTopUp;

    if (existingPending && !this.isExpired(existingPending)) {
      topUp = existingPending;
    } else {
      if (existingPending) {
        existingPending.status = 'expired';
        await this.walletTopUpRepository.save(existingPending);
      }

      topUp = this.walletTopUpRepository.create({
        userId: user.id,
        provider: 'jazzcash',
        method: 'card',
        amount: amount.toFixed(2),
        currency: 'PKR',
        status: 'pending',
        txnRefNo: this.jazzCashService.generateTxnRefNo(),
        billReference: user.id.replace(/-/g, '').slice(0, 20),
        expiresAt: new Date(Date.now() + this.txnExpiryMinutes * 60 * 1000),
      });

      await this.walletTopUpRepository.save(topUp);
    }

    const { checkoutUrl, fields } = this.jazzCashService.buildCardCheckoutRequest({
      txnRefNo: topUp.txnRefNo,
      amount,
      billReference: topUp.billReference as string,
      description: `FastRide wallet top-up ${topUp.id}`,
    });

    return {
      message: 'JazzCash checkout initiated',
      topUpId: topUp.id,
      txnRefNo: topUp.txnRefNo,
      checkoutUrl,
      fields,
    };
  }

  private isExpired(topUp: WalletTopUp): boolean {
    if (!topUp.expiresAt) {
      return true;
    }

    return Date.now() > topUp.expiresAt.getTime();
  }

  /** Browser return from the Card Page Redirection checkout (pp_ResponseCode "121" = payment confirmed). */
  async handleJazzCashCallback(payload: Record<string, string>) {
    this.logger.log(`JazzCash callback received: ${JSON.stringify(payload)}`);

    const isHashValid = this.jazzCashService.verifySecureHash(payload);
    const txnRefNo = payload['pp_TxnRefNo'];

    if (!txnRefNo) {
      this.logger.warn('JazzCash top-up callback received without pp_TxnRefNo');
      return { redirectUrl: this.frontendFailureUrl };
    }

    const topUp = await this.walletTopUpRepository.findOne({ where: { txnRefNo } });

    if (!topUp) {
      this.logger.warn(`JazzCash top-up callback for unknown txnRefNo=${txnRefNo}`);
      return { redirectUrl: this.frontendFailureUrl };
    }

    if (!isHashValid) {
      this.logger.error(`JazzCash top-up callback secure hash mismatch for txnRefNo=${txnRefNo}`);
      topUp.status = 'failed';
      topUp.jazzcashResponseMessage = 'Secure hash verification failed';
      topUp.rawCallbackPayload = payload;
      await this.walletTopUpRepository.save(topUp);
      return { redirectUrl: this.frontendFailureUrl, topUp };
    }

    await this.applyCallbackResult(topUp, payload);

    const redirectUrl =
      topUp.status === 'completed' ? this.frontendSuccessUrl : this.frontendFailureUrl;

    return { redirectUrl, topUp };
  }

  /** REST IPN listener — server-to-server, must ack within 60s regardless of payment outcome. */
  async handleJazzCashIpn(payload: Record<string, string>) {
    this.logger.log(`JazzCash IPN received: ${JSON.stringify(payload)}`);

    const isHashValid = this.jazzCashService.verifySecureHash(payload);
    const txnRefNo = payload['pp_TxnRefNo'];

    if (!txnRefNo) {
      this.logger.warn('JazzCash IPN received without pp_TxnRefNo');
      return this.jazzCashService.buildIpnAckResponse();
    }

    if (!isHashValid) {
      this.logger.error(`JazzCash IPN secure hash mismatch for txnRefNo=${txnRefNo}`);
      return this.jazzCashService.buildIpnAckResponse();
    }

    const topUp = await this.walletTopUpRepository.findOne({ where: { txnRefNo } });

    if (!topUp) {
      this.logger.warn(`JazzCash IPN for unknown txnRefNo=${txnRefNo}`);
      return this.jazzCashService.buildIpnAckResponse();
    }

    await this.applyCallbackResult(topUp, payload);

    // Always ack "received" — this only confirms delivery of the IPN, not
    // the payment's own outcome, which the payload's pp_ResponseCode already
    // carries (121 success, 199/999/other fail).
    const ack = this.jazzCashService.buildIpnAckResponse();
    this.logger.log(`JazzCash IPN ack sent for txnRefNo=${txnRefNo}: ${JSON.stringify(ack)}`);
    return ack;
  }

  /** Shared by the Card redirect callback and the IPN listener — both carry the same pp_ResponseCode "121" success convention. */
  private async applyCallbackResult(topUp: WalletTopUp, payload: Record<string, string>) {
    const responseCode = payload['pp_ResponseCode'];
    const responseMessage = payload['pp_ResponseMessage'];
    const wasAlreadyCompleted = topUp.status === 'completed';

    topUp.jazzcashResponseCode = responseCode ?? topUp.jazzcashResponseCode;
    topUp.jazzcashResponseMessage = responseMessage ?? topUp.jazzcashResponseMessage;
    topUp.jazzcashRetrievalReferenceNo =
      payload['pp_RetreivalReferenceNo'] ?? topUp.jazzcashRetrievalReferenceNo;
    topUp.jazzcashAuthCode = payload['pp_AuthCode'] ?? topUp.jazzcashAuthCode;
    topUp.rawCallbackPayload = payload;

    const expectedAmountInPaisa = Math.round(Number(topUp.amount) * 100);
    const callbackAmountInPaisa = Number(payload['pp_Amount']);
    const amountMatches =
      !payload['pp_Amount'] || callbackAmountInPaisa === expectedAmountInPaisa;

    if (this.jazzCashService.isPaymentSuccessCode(responseCode) && !amountMatches) {
      this.logger.error(
        `JazzCash top-up callback amount mismatch for txnRefNo=${topUp.txnRefNo}: expected ${expectedAmountInPaisa}, got ${payload['pp_Amount']}`,
      );
      topUp.status = 'failed';
      topUp.jazzcashResponseMessage = 'Amount mismatch between recorded top-up and callback';
    } else if (this.jazzCashService.isPaymentSuccessCode(responseCode)) {
      topUp.status = 'completed';
      topUp.paidAt = topUp.paidAt ?? new Date();
    } else if (topUp.status === 'pending') {
      // Non-121 codes on a still-pending top-up mean the attempt failed;
      // an already-completed top-up must not be flipped back by a stale retry.
      topUp.status = 'failed';
    }

    await this.walletTopUpRepository.save(topUp);

    if (!wasAlreadyCompleted && topUp.status === 'completed') {
      await this.creditWalletForTopUp(topUp);
    }
  }

  private async creditWalletForTopUp(topUp: WalletTopUp) {
    try {
      await this.walletService.credit(
        topUp.userId,
        Number(topUp.amount),
        'wallet_top_up',
        null,
        `Wallet top-up ${topUp.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to credit wallet for top-up ${topUp.id}: ${(error as Error).message}`,
      );
    }
  }

  async getStatus(userId: string, topUpId: string) {
    const topUp = await this.walletTopUpRepository.findOne({ where: { id: topUpId } });

    if (!topUp) {
      throw new NotFoundException('Top-up not found');
    }

    if (topUp.userId !== userId) {
      throw new ForbiddenException('You can only view your own top-ups');
    }

    return { topUp: this.formatTopUp(topUp) };
  }

  /** Status Inquiry API v2.0 — pp_ResponseCode "000" means the inquiry call itself succeeded; pp_PaymentResponseCode "121" means the payment is confirmed complete. */
  async inquireAndSync(userId: string, topUpId: string) {
    const topUp = await this.walletTopUpRepository.findOne({ where: { id: topUpId } });

    if (!topUp) {
      throw new NotFoundException('Top-up not found');
    }

    if (topUp.userId !== userId) {
      throw new ForbiddenException('You can only inquire about your own top-ups');
    }

    if (topUp.status === 'completed') {
      return { topUp: this.formatTopUp(topUp) };
    }

    const inquiryResult = await this.jazzCashService.inquireStatus(topUp.txnRefNo);
    const apiSucceeded = this.jazzCashService.isApiSuccessCode(inquiryResult['pp_ResponseCode']);
    const paymentResponseCode = inquiryResult['pp_PaymentResponseCode'];
    const wasAlreadyCompleted = topUp.status === 'completed';

    if (apiSucceeded) {
      topUp.jazzcashResponseCode = paymentResponseCode ?? topUp.jazzcashResponseCode;
      topUp.jazzcashResponseMessage =
        inquiryResult['pp_PaymentResponseMessage'] ?? topUp.jazzcashResponseMessage;

      if (this.jazzCashService.isPaymentSuccessCode(paymentResponseCode)) {
        topUp.status = 'completed';
        topUp.paidAt = topUp.paidAt ?? new Date();
      }
    }

    await this.walletTopUpRepository.save(topUp);

    if (!wasAlreadyCompleted && topUp.status === 'completed') {
      await this.creditWalletForTopUp(topUp);
    }

    return { topUp: this.formatTopUp(topUp) };
  }

  // ---------------------------------------------------------------------
  // Refunds (MWallet Refund API v1.1 / Card Refund API v2.0)
  // ---------------------------------------------------------------------

  async refund(topUpId: string, amount?: number) {
    const topUp = await this.walletTopUpRepository.findOne({ where: { id: topUpId } });

    if (!topUp) {
      throw new NotFoundException('Top-up not found');
    }

    if (topUp.status !== 'completed') {
      throw new BadRequestException('Only completed top-ups can be refunded');
    }

    if (topUp.refundStatus === 'completed') {
      throw new BadRequestException('This top-up has already been refunded');
    }

    const refundAmount = amount ?? Number(topUp.amount);

    if (refundAmount <= 0 || refundAmount > Number(topUp.amount)) {
      throw new BadRequestException('Refund amount must be between 0 and the original top-up amount');
    }

    const response =
      topUp.method === 'mwallet'
        ? await this.jazzCashService.refundMWallet({ txnRefNo: topUp.txnRefNo, amount: refundAmount })
        : await this.jazzCashService.refundCard({ txnRefNo: topUp.txnRefNo, amount: refundAmount });

    // MWallet refund responses are pp_-prefixed; Card refund responses are not.
    const responseCode = response['pp_ResponseCode'] ?? response['ResponseCode'];
    const responseMessage = response['pp_ResponseMessage'] ?? response['ResponseMessage'];
    const succeeded = this.jazzCashService.isApiSuccessCode(responseCode);

    topUp.jazzcashRefundResponseCode = responseCode ?? null;
    topUp.jazzcashRefundResponseMessage = responseMessage ?? null;

    if (succeeded) {
      topUp.refundStatus = 'completed';
      topUp.refundedAmount = refundAmount.toFixed(2);
      topUp.refundedAt = new Date();
    } else {
      topUp.refundStatus = 'failed';
    }

    await this.walletTopUpRepository.save(topUp);

    if (succeeded) {
      await this.walletService.debit(
        topUp.userId,
        refundAmount,
        'wallet_top_up_refund',
        null,
        `Refund for wallet top-up ${topUp.id}`,
      );
    }

    return { topUp: this.formatTopUp(topUp), jazzcash: response };
  }

  private formatTopUp(topUp: WalletTopUp) {
    return {
      id: topUp.id,
      userId: topUp.userId,
      provider: topUp.provider,
      method: topUp.method,
      amount: Number(topUp.amount),
      currency: topUp.currency,
      status: topUp.status,
      txnRefNo: topUp.txnRefNo,
      jazzcashResponseCode: topUp.jazzcashResponseCode,
      jazzcashResponseMessage: topUp.jazzcashResponseMessage,
      refundStatus: topUp.refundStatus,
      refundedAmount: topUp.refundedAmount ? Number(topUp.refundedAmount) : null,
      refundedAt: topUp.refundedAt,
      paidAt: topUp.paidAt,
      createdAt: topUp.createdAt,
      updatedAt: topUp.updatedAt,
    };
  }
}
