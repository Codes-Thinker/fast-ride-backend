import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('wallet_topups')
export class WalletTopUp {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  @Index()
  userId!: string;

  @Column({ type: 'varchar', length: 20, default: 'jazzcash' })
  provider!: string;

  /** Which JazzCash product was used: 'mwallet' (direct mobile account debit) or 'card' (Page Redirection). */
  @Column({ type: 'varchar', length: 10, default: 'card' })
  method!: string;

  /** JazzCash-linked mobile account number used for an 'mwallet' top-up. */
  @Column({ name: 'mobile_number', type: 'varchar', length: 20, nullable: true })
  mobileNumber!: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 10, default: 'PKR' })
  currency!: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: string;

  @Column({ name: 'txn_ref_no', type: 'varchar', length: 50, unique: true })
  txnRefNo!: string;

  @Column({ name: 'bill_reference', type: 'varchar', length: 50, nullable: true })
  billReference!: string | null;

  @Column({ name: 'jazzcash_response_code', type: 'varchar', length: 10, nullable: true })
  jazzcashResponseCode!: string | null;

  @Column({ name: 'jazzcash_response_message', type: 'varchar', length: 255, nullable: true })
  jazzcashResponseMessage!: string | null;

  @Column({ name: 'jazzcash_retrieval_reference_no', type: 'varchar', length: 50, nullable: true })
  jazzcashRetrievalReferenceNo!: string | null;

  @Column({ name: 'jazzcash_auth_code', type: 'varchar', length: 50, nullable: true })
  jazzcashAuthCode!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  rawCallbackPayload!: Record<string, unknown> | null;

  @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
  paidAt!: Date | null;

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt!: Date | null;

  /** 'requested' (driver asked, awaiting admin) | 'rejected' | 'completed' | 'failed'. */
  @Column({ name: 'refund_status', type: 'varchar', length: 20, nullable: true })
  refundStatus!: string | null;

  /** The driver's stated reason when requesting a refund from the app. */
  @Column({ name: 'refund_reason', type: 'text', nullable: true })
  refundReason!: string | null;

  @Column({ name: 'refund_requested_at', type: 'timestamp', nullable: true })
  refundRequestedAt!: Date | null;

  /** The admin's stated reason when rejecting a refund request. */
  @Column({ name: 'refund_rejection_reason', type: 'text', nullable: true })
  refundRejectionReason!: string | null;

  @Column({ name: 'refunded_amount', type: 'numeric', precision: 12, scale: 2, nullable: true })
  refundedAmount!: string | null;

  @Column({ name: 'jazzcash_refund_response_code', type: 'varchar', length: 10, nullable: true })
  jazzcashRefundResponseCode!: string | null;

  @Column({ name: 'jazzcash_refund_response_message', type: 'varchar', length: 255, nullable: true })
  jazzcashRefundResponseMessage!: string | null;

  @Column({ name: 'refunded_at', type: 'timestamp', nullable: true })
  refundedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
