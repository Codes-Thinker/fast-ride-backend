import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 20, unique: true })
  phone!: string;

  @Column({ type: 'varchar', length: 255 })
  password!: string;

  @Column({ type: 'varchar', length: 6, nullable: true })
  otp!: string;

  @Column({ type: 'timestamp', nullable: true })
  otp_expires_at!: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reset_password_token!: string;

  @Column({ type: 'timestamp', nullable: true })
  reset_password_expires_at!: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  refresh_token!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  refresh_token_expires_at!: Date | null;

  @Column({ type: 'boolean', default: false })
  is_email_verified!: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  profile_picture_url!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  profile_picture_public_id!: string;

  @Column({ type: 'text', nullable: true })
  bio!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  address!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  city!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  state!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  postal_code!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  country!: string;

  @Column({ type: 'boolean', default: true })
  is_active!: boolean;

  @Column({ type: 'boolean', default: false })
  is_admin!: boolean;

  @Column({ type: 'boolean', default: false })
  is_driver!: boolean;

  @Column({ type: 'varchar', length: 10, nullable: true })
  gender!: 'male' | 'female' | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  wallet_balance!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  jazzcash_account_number!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  jazzcash_account_title!: string | null;

  @Column({ type: 'varchar', length: 13, nullable: true })
  cnic!: string | null;

  // Set when the user deletes their account. The row is kept (anonymised) so
  // ride and payment records stay intact; the account can no longer sign in.
  @Column({ type: 'timestamp', nullable: true })
  deleted_at!: Date | null;

  @CreateDateColumn({ type: 'timestamp' })
  created_at!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updated_at!: Date;
}
