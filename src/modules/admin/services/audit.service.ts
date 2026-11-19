import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { AdminAuditLog } from '../entities/admin-audit-log.entity';

export interface AuditLogInput {
  adminId: string;
  adminName?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AdminAuditLog)
    private readonly auditRepository: Repository<AdminAuditLog>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Records an admin action. Never throws: an audit failure must not undo or
   * fail the action it describes, so errors are logged and swallowed.
   */
  async log(input: AuditLogInput): Promise<void> {
    try {
      let adminName = input.adminName ?? null;
      if (!adminName && input.adminId) {
        const admin = await this.userRepository.findOne({
          where: { id: input.adminId },
          select: { id: true, name: true },
        });
        adminName = admin?.name ?? null;
      }

      await this.auditRepository.save(
        this.auditRepository.create({
          adminId: input.adminId ?? null,
          adminName: adminName?.slice(0, 100) ?? null,
          action: input.action,
          targetType: input.targetType ?? null,
          targetId: input.targetId ?? null,
          summary: input.summary ? input.summary.slice(0, 255) : null,
          metadata: input.metadata ?? null,
        }),
      );
    } catch (error: unknown) {
      this.logger.error(
        `Failed to write audit log for action "${input.action}"`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async listLogs(filters: { page?: number; limit?: number; action?: string; search?: string }) {
    const page = Math.max(1, Math.floor(filters.page ?? 1));
    const limit = Math.min(100, Math.max(1, Math.floor(filters.limit ?? 20)));

    const query = this.auditRepository.createQueryBuilder('l');

    if (filters.action && filters.action.trim()) {
      query.andWhere('l.action = :action', { action: filters.action.trim() });
    }

    const search = filters.search?.trim();
    if (search) {
      // Escape LIKE wildcards (and the escape character itself) so user input matches literally.
      const escaped = search.replace(/[\\%_]/g, (match) => `\\${match}`);
      query.andWhere(
        '(l.summary ILIKE :search OR l.adminName ILIKE :search OR l.targetId ILIKE :search)',
        { search: `%${escaped}%` },
      );
    }

    query
      .orderBy('l.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [logs, total] = await query.getManyAndCount();

    return {
      logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
