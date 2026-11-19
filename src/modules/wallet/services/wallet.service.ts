import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Not, Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { WalletHold } from '../entities/wallet-hold.entity';
import { WalletTransaction } from '../entities/wallet-transaction.entity';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(WalletTransaction)
    private readonly walletTransactionRepository: Repository<WalletTransaction>,
    @InjectRepository(WalletHold)
    private readonly walletHoldRepository: Repository<WalletHold>,
  ) {}

  private isUniqueViolation(error: unknown): boolean {
    const code = (error as any)?.code ?? (error as any)?.driverError?.code;
    return code === '23505';
  }

  /**
   * Applies a balance mutation and its ledger row atomically under a row lock
   * on the user, so concurrent requests (double-tap, retried webhook, racing
   * withdrawal requests) can never observe a stale balance.
   *
   * `validateUnderLock` runs AFTER the row lock is acquired (with the
   * up-to-date balance), not before — callers that need a balance-sufficiency
   * check (e.g. withdrawals) must pass it here rather than checking balance
   * beforehand, otherwise two concurrent requests can both pass a pre-check
   * against the same stale balance and overdraw.
   */
  private async applyLedgerEntry(params: {
    userId: string;
    signedAmount: number;
    type: string;
    rideRequestId?: string | null;
    description?: string | null;
    status?: string;
    validateUnderLock?: (currentBalance: number, manager: EntityManager) => Promise<void> | void;
  }): Promise<{ balance: number; transaction: WalletTransaction }> {
    return this.userRepository.manager.transaction(async (manager) => {
      const userRepo = manager.getRepository(User);
      const walletTxRepo = manager.getRepository(WalletTransaction);

      const user = await userRepo
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :id', { id: params.userId })
        .getOne();

      if (!user) {
        throw new NotFoundException('User not found');
      }

      const currentBalance = Number(user.wallet_balance ?? 0);

      if (params.validateUnderLock) {
        await params.validateUnderLock(currentBalance, manager);
      }

      const newBalance = Number((currentBalance + params.signedAmount).toFixed(2));

      user.wallet_balance = newBalance.toFixed(2);
      await userRepo.save(user);

      const transaction = walletTxRepo.create({
        userId: params.userId,
        type: params.type,
        amount: params.signedAmount.toFixed(2),
        balanceAfter: newBalance.toFixed(2),
        rideRequestId: params.rideRequestId ?? null,
        description: params.description ?? null,
        status: params.status ?? 'completed',
      });
      // A DB-level UNIQUE (ride_request_id, type) constraint is the real guard
      // against double-crediting/double-debiting the same ride (e.g. a retried
      // JazzCash webhook racing a manual /inquire call) — a prior SELECT-then-
      // insert check has a TOCTOU gap that this closes.
      await walletTxRepo.save(transaction);

      return { balance: newBalance, transaction };
    });
  }

  async credit(
    userId: string,
    amount: number,
    type: string,
    rideRequestId: string | null,
    description: string,
  ) {
    if (amount <= 0) {
      throw new BadRequestException('Credit amount must be greater than 0');
    }

    return this.applyLedgerEntry({ userId, signedAmount: amount, type, rideRequestId, description });
  }

  async debit(
    userId: string,
    amount: number,
    type: string,
    rideRequestId: string | null,
    description: string,
  ) {
    if (amount <= 0) {
      throw new BadRequestException('Debit amount must be greater than 0');
    }

    return this.applyLedgerEntry({
      userId,
      signedAmount: -Math.abs(amount),
      type,
      rideRequestId,
      description,
    });
  }

  /**
   * Credits ride earnings exactly once per rideRequestId. Relies on the
   * wallet_transactions UNIQUE (ride_request_id, type) constraint rather than
   * a SELECT-then-insert check, so concurrent callers (a retried JazzCash
   * webhook racing a manual /inquire call) can't both slip past a stale read
   * and double-credit the driver.
   */
  async creditRideEarningIfNotAlready(
    driverId: string,
    amount: number,
    rideRequestId: string,
    description: string,
  ) {
    if (amount <= 0) {
      return null;
    }

    try {
      return await this.applyLedgerEntry({
        userId: driverId,
        signedAmount: amount,
        type: 'ride_earning',
        rideRequestId,
        description,
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Reserves `amount` (a ride's companyCommission) against a driver's
   * available balance so they can't respond "interested" to more rides than
   * their wallet can actually cover the commission for. Available balance is
   * wallet_balance minus every other still-active hold for this driver, not
   * just wallet_balance itself — a driver can have several concurrent holds
   * outstanding while multiple riders are still deciding.
   *
   * Idempotent: re-affirming an already-active hold for the same
   * (rideRequestId, driverId) is a no-op. Reactivating a previously released
   * hold (driver declined then flipped back to interested) re-runs the
   * eligibility check against the current balance rather than trusting the
   * old one.
   */
  async createHoldIfEligible(driverId: string, rideRequestId: string, amount: number) {
    if (amount <= 0) {
      return null;
    }

    return this.userRepository.manager.transaction(async (manager) => {
      const userRepo = manager.getRepository(User);
      const holdRepo = manager.getRepository(WalletHold);

      const existing = await holdRepo.findOne({ where: { driverId, rideRequestId } });

      if (existing?.status === 'active') {
        return existing;
      }

      const user = await userRepo
        .createQueryBuilder('user')
        .setLock('pessimistic_write')
        .where('user.id = :id', { id: driverId })
        .getOne();

      if (!user) {
        throw new NotFoundException('Driver not found');
      }

      const heldAmount = await this.getActiveHeldAmount(driverId, manager);
      const available = Number(user.wallet_balance ?? 0) - heldAmount;

      if (available < amount) {
        throw new BadRequestException(
          `Insufficient wallet balance to accept this ride. Required commission: Rs ${amount.toFixed(2)}, available: Rs ${available.toFixed(2)}`,
        );
      }

      if (existing) {
        existing.status = 'active';
        existing.amount = amount.toFixed(2);
        return holdRepo.save(existing);
      }

      return holdRepo.save(
        holdRepo.create({ driverId, rideRequestId, amount: amount.toFixed(2), status: 'active' }),
      );
    });
  }

  /** Sum of a driver's still-active holds — funds reserved against accepted-but-not-yet-completed rides. */
  private async getActiveHeldAmount(driverId: string, manager?: EntityManager): Promise<number> {
    const holdRepo = manager ? manager.getRepository(WalletHold) : this.walletHoldRepository;

    const { total } = await holdRepo
      .createQueryBuilder('hold')
      .select('COALESCE(SUM(hold.amount), 0)', 'total')
      .where('hold.driverId = :driverId', { driverId })
      .andWhere('hold.status = :status', { status: 'active' })
      .getRawOne();

    return Number(total ?? 0);
  }

  /** Releases a single driver's active hold on a ride (decline, or flip from interested). */
  async releaseHold(driverId: string, rideRequestId: string) {
    await this.walletHoldRepository.update(
      { driverId, rideRequestId, status: 'active' },
      { status: 'released' },
    );
  }

  /** Frees every other interested driver's hold once one driver is selected for a ride. */
  async releaseAllHoldsForRideExcept(rideRequestId: string, keepDriverId: string) {
    await this.walletHoldRepository.update(
      { rideRequestId, status: 'active', driverId: Not(keepDriverId) },
      { status: 'released' },
    );
  }

  /** Frees every active hold on a ride — used when a ride is cancelled before completion. */
  async releaseAllHoldsForRide(rideRequestId: string) {
    await this.walletHoldRepository.update(
      { rideRequestId, status: 'active' },
      { status: 'released' },
    );
  }

  /**
   * Debits a ride's commission exactly once (idempotent via the
   * wallet_transactions UNIQUE (ride_request_id, type) constraint, same
   * pattern as creditRideEarningIfNotAlready) and marks the matching hold as
   * captured. Called for both cash and online rides now — the platform no
   * longer skims a cut out of the payment itself, so commission is always a
   * standalone wallet debit at completion.
   */
  async captureHoldAndDebitCommissionIfNotAlready(
    driverId: string,
    amount: number,
    rideRequestId: string,
    description: string,
  ) {
    if (amount <= 0) {
      return null;
    }

    try {
      const result = await this.applyLedgerEntry({
        userId: driverId,
        signedAmount: -Math.abs(amount),
        type: 'commission_debit',
        rideRequestId,
        description,
      });

      await this.walletHoldRepository.update(
        { driverId, rideRequestId, status: 'active' },
        { status: 'captured' },
      );

      return result;
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        return null;
      }
      throw error;
    }
  }

  private async requireDriver(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.is_driver) {
      throw new ForbiddenException('Only drivers have a wallet');
    }

    return user;
  }

  async getWalletSummary(userId: string) {
    const user = await this.requireDriver(userId);

    const [recentTransactions, heldBalance] = await Promise.all([
      this.walletTransactionRepository.find({
        where: { userId },
        order: { createdAt: 'DESC' },
        take: 20,
      }),
      this.getActiveHeldAmount(userId),
    ]);

    const balance = Number(user.wallet_balance ?? 0);

    return {
      balance,
      heldBalance,
      availableBalance: Number((balance - heldBalance).toFixed(2)),
      recentTransactions: recentTransactions.map((tx) => this.formatTransaction(tx)),
    };
  }

  async getTransactions(userId: string, page = 1, limit = 20) {
    await this.requireDriver(userId);

    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));

    const [transactions, total] = await this.walletTransactionRepository.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC' },
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });

    return {
      transactions: transactions.map((tx) => this.formatTransaction(tx)),
      pagination: { page: safePage, limit: safeLimit, total },
    };
  }

  async requestWithdrawal(userId: string, amount: number) {
    // Only used to enforce "drivers only" up front; the actual balance check
    // must happen under the row lock inside applyLedgerEntry (see
    // validateUnderLock below) so two concurrent withdrawal requests can't
    // both pass a check against the same stale balance and overdraw.
    await this.requireDriver(userId);

    const { balance, transaction } = await this.applyLedgerEntry({
      userId,
      signedAmount: -Math.abs(amount),
      type: 'withdrawal',
      description: 'Withdrawal request pending admin payout',
      status: 'pending',
      validateUnderLock: async (currentBalance, manager) => {
        // A driver can't withdraw funds already reserved by an active hold
        // for a ride they've accepted — otherwise the hold's whole purpose
        // (guaranteeing the commission is still there at completion) breaks.
        // This runs under the same row lock createHoldIfEligible acquires, so
        // it can't race a concurrent hold being created.
        const heldAmount = await this.getActiveHeldAmount(userId, manager);
        const available = currentBalance - heldAmount;

        if (amount > available) {
          throw new BadRequestException(
            'Withdrawal amount exceeds available wallet balance (some funds are held against accepted rides)',
          );
        }
      },
    });

    return {
      message: 'Withdrawal requested. Funds will be transferred by the admin team.',
      balance,
      transaction: this.formatTransaction(transaction),
    };
  }

  async listWithdrawals(status?: string) {
    const where = status ? { type: 'withdrawal', status } : { type: 'withdrawal' };

    const withdrawals = await this.walletTransactionRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });

    return { withdrawals: withdrawals.map((tx) => this.formatTransaction(tx)) };
  }

  async completeWithdrawal(withdrawalId: string) {
    const withdrawal = await this.walletTransactionRepository.findOne({
      where: { id: withdrawalId, type: 'withdrawal' },
    });

    if (!withdrawal) {
      throw new NotFoundException('Withdrawal request not found');
    }

    if (withdrawal.status !== 'pending') {
      throw new BadRequestException('Only pending withdrawals can be completed');
    }

    withdrawal.status = 'completed';
    await this.walletTransactionRepository.save(withdrawal);

    return { message: 'Withdrawal marked as completed', transaction: this.formatTransaction(withdrawal) };
  }

  async rejectWithdrawal(withdrawalId: string, reason?: string) {
    const withdrawal = await this.walletTransactionRepository.findOne({
      where: { id: withdrawalId, type: 'withdrawal' },
    });

    if (!withdrawal) {
      throw new NotFoundException('Withdrawal request not found');
    }

    if (withdrawal.status !== 'pending') {
      throw new BadRequestException('Only pending withdrawals can be rejected');
    }

    const refundAmount = Math.abs(Number(withdrawal.amount));

    await this.applyLedgerEntry({
      userId: withdrawal.userId,
      signedAmount: refundAmount,
      type: 'withdrawal_rejected_refund',
      rideRequestId: withdrawal.rideRequestId,
      description: `Refund for rejected withdrawal ${withdrawal.id}`,
    });

    withdrawal.status = 'rejected';
    withdrawal.rejectionReason = reason ?? null;
    await this.walletTransactionRepository.save(withdrawal);

    return { message: 'Withdrawal rejected and refunded to wallet', transaction: this.formatTransaction(withdrawal) };
  }

  formatTransaction(transaction: WalletTransaction) {
    return {
      id: transaction.id,
      userId: transaction.userId,
      type: transaction.type,
      amount: Number(transaction.amount),
      balanceAfter: Number(transaction.balanceAfter),
      rideRequestId: transaction.rideRequestId,
      description: transaction.description,
      status: transaction.status,
      rejectionReason: transaction.rejectionReason,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    };
  }
}
