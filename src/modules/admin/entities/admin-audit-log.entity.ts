import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('admin_audit_logs')
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('IDX_admin_audit_logs_admin_id')
  @Column({ name: 'admin_id', type: 'uuid', nullable: true })
  adminId!: string | null;

  @Column({ name: 'admin_name', type: 'varchar', length: 100, nullable: true })
  adminName!: string | null;

  @Index('IDX_admin_audit_logs_action')
  @Column({ type: 'varchar', length: 60 })
  action!: string;

  @Column({ name: 'target_type', type: 'varchar', length: 40, nullable: true })
  targetType!: string | null;

  @Column({ name: 'target_id', type: 'varchar', length: 64, nullable: true })
  targetId!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  summary!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Index('IDX_admin_audit_logs_created_at')
  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;
}
