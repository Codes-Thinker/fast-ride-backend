import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { DriverRegistration } from '../driver-registration/entities/driver-registration.entity';
import { RideRequest } from '../ride-request/entities/ride-request.entity';
import { User } from '../user/entities/user.entity';
import { WalletTopUp } from '../wallet/entities/wallet-top-up.entity';
import { WalletTransaction } from '../wallet/entities/wallet-transaction.entity';
import { WalletService } from '../wallet/services/wallet.service';
import { ChangeUserRoleDto } from './dto/change-user-role.dto';
import { AuditService } from './services/audit.service';

// Date range start shared by the analytics queries (parameter $1 = number of days).
// Uses session-local wall-clock time (now()::timestamp) to match `timestamp` columns.
const RANGE_START_SQL = `(date_trunc('day', now()::timestamp) - ($1::int - 1) * interval '1 day')`;

// Whitelisted sort columns; raw user input never reaches the SQL/ORM sort clause.
const USER_SORT_COLUMNS: Record<string, string> = {
  created_at: 'u.created_at',
  name: 'u.name',
  email: 'u.email',
  wallet_balance: 'u.wallet_balance',
};

const BREAKDOWN_STATUSES = ['open', 'driver_selected', 'completed', 'cancelled'] as const;
type BreakdownStatus = (typeof BREAKDOWN_STATUSES)[number];

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(DriverRegistration)
    private readonly driverRegistrationRepository: Repository<DriverRegistration>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RideRequest)
    private readonly rideRequestRepository: Repository<RideRequest>,
    @InjectRepository(WalletTransaction)
    private readonly walletTransactionRepository: Repository<WalletTransaction>,
    @InjectRepository(WalletTopUp)
    private readonly walletTopUpRepository: Repository<WalletTopUp>,
    private readonly walletService: WalletService,
    private readonly auditService: AuditService,
  ) {}

  private parsePagination(page?: string, limit?: string) {
    const parsedPage = Number.parseInt(page ?? '1', 10);
    const parsedLimit = Number.parseInt(limit ?? '20', 10);

    const safePage = Number.isNaN(parsedPage) || parsedPage < 1 ? 1 : parsedPage;
    const safeLimit = Number.isNaN(parsedLimit) || parsedLimit < 1 ? 20 : Math.min(parsedLimit, 100);

    return {
      page: safePage,
      limit: safeLimit,
      skip: (safePage - 1) * safeLimit,
    };
  }

  private toNumber(value: unknown): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  async getDashboardStats() {
    const [
      totalUsers,
      totalActiveUsers,
      totalDrivers,
      totalAdmins,
      pendingDriverApprovals,
      approvedDrivers,
      rejectedDrivers,
      totalRideRequests,
      openRideRequests,
      selectedRideRequests,
      completedRideRequests,
      cancelledRideRequests,
      recentRideRequests,
      recentUsers,
      withdrawalTotals,
      pendingRefundRequests,
      rideFinancials,
      driverWalletTotals,
    ] = await Promise.all([
      this.userRepository.count({ where: { deleted_at: IsNull() } }),
      this.userRepository.count({ where: { is_active: true, deleted_at: IsNull() } }),
      this.userRepository.count({ where: { is_driver: true, deleted_at: IsNull() } }),
      this.userRepository.count({ where: { is_admin: true, deleted_at: IsNull() } }),
      this.driverRegistrationRepository.count({ where: { status: 'pending' } }),
      this.driverRegistrationRepository.count({ where: { status: 'approved' } }),
      this.driverRegistrationRepository.count({ where: { status: 'rejected' } }),
      this.rideRequestRepository.count(),
      this.rideRequestRepository.count({ where: { status: 'open' } }),
      this.rideRequestRepository.count({ where: { status: 'driver_selected' } }),
      this.rideRequestRepository.count({ where: { status: 'completed' } }),
      this.rideRequestRepository.count({ where: { status: 'cancelled' } }),
      this.rideRequestRepository.find({
        order: { createdAt: 'DESC' },
        take: 10,
      }),
      this.userRepository.find({
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          is_active: true,
          is_admin: true,
          is_driver: true,
          created_at: true,
        },
        where: { deleted_at: IsNull() },
        order: { created_at: 'DESC' },
        take: 10,
      }),
      this.walletTransactionRepository
        .createQueryBuilder('t')
        .select('COUNT(*)', 'count')
        .addSelect('COALESCE(SUM(ABS(t.amount)), 0)', 'amount')
        .where('t.type = :type', { type: 'withdrawal' })
        .andWhere('t.status = :status', { status: 'pending' })
        .getRawOne<{ count: string; amount: string }>(),
      this.walletTopUpRepository.count({ where: { refundStatus: 'requested' } }),
      this.rideRequestRepository.query(`
        SELECT
          COALESCE(SUM("offeredPrice") FILTER (WHERE status = 'completed'), 0) AS revenue,
          COALESCE(SUM("companyCommission") FILTER (WHERE status = 'completed'), 0) AS commission,
          COALESCE(AVG("offeredPrice") FILTER (WHERE status = 'completed'), 0) AS "averageFare"
        FROM ride_requests
      `) as Promise<Array<{ revenue: string; commission: string; averageFare: string }>>,
      this.userRepository.query(
        `SELECT COALESCE(SUM(wallet_balance), 0) AS total FROM users WHERE is_driver = true AND deleted_at IS NULL`,
      ) as Promise<Array<{ total: string }>>,
    ]);

    const financials = rideFinancials[0];
    const finished = completedRideRequests + cancelledRideRequests;
    const completionRate =
      finished > 0 ? Math.round((completedRideRequests / finished) * 1000) / 10 : 0;

    return {
      stats: {
        totalUsers,
        totalActiveUsers,
        totalDrivers,
        totalRiders: Math.max(totalUsers - totalDrivers, 0),
        totalAdmins,
        pendingDriverApprovals,
        totalRideRequests,
        openRideRequests,
        selectedRideRequests,
        completedRideRequests,
        cancelledRideRequests,
        pendingWithdrawals: this.toNumber(withdrawalTotals?.count),
        pendingWithdrawalAmount: this.toNumber(withdrawalTotals?.amount),
        pendingRefundRequests,
        driverRegistrations: {
          pending: pendingDriverApprovals,
          approved: approvedDrivers,
          rejected: rejectedDrivers,
        },
        totalRevenue: this.toNumber(financials?.revenue),
        totalCommission: this.toNumber(financials?.commission),
        totalWalletBalance: this.toNumber(driverWalletTotals[0]?.total),
        completionRate,
        averageFare: Math.round(this.toNumber(financials?.averageFare) * 100) / 100,
      },
      recentRideRequests,
      recentUsers,
    };
  }

  async getAnalytics(days?: string) {
    const parsedDays = Number.parseInt(days ?? '30', 10);
    const rangeDays = Number.isNaN(parsedDays) ? 30 : Math.min(365, Math.max(7, parsedDays));

    const dailyRows = (await this.rideRequestRepository.query(
      `
      WITH days AS (
        SELECT generate_series(${RANGE_START_SQL}, date_trunc('day', now()::timestamp), interval '1 day') AS day
      ),
      requested AS (
        SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS n
        FROM ride_requests
        WHERE "createdAt" >= ${RANGE_START_SQL}
        GROUP BY 1
      ),
      completed AS (
        SELECT date_trunc('day', completed_at) AS day,
          COUNT(*) AS n,
          COALESCE(SUM("offeredPrice"), 0) AS revenue,
          COALESCE(SUM("companyCommission"), 0) AS commission
        FROM ride_requests
        WHERE status = 'completed' AND completed_at >= ${RANGE_START_SQL}
        GROUP BY 1
      ),
      cancelled AS (
        SELECT date_trunc('day', cancelled_at) AS day, COUNT(*) AS n
        FROM ride_requests
        WHERE status = 'cancelled' AND cancelled_at >= ${RANGE_START_SQL}
        GROUP BY 1
      ),
      signups AS (
        SELECT date_trunc('day', created_at) AS day, COUNT(*) AS n
        FROM users
        WHERE deleted_at IS NULL AND created_at >= ${RANGE_START_SQL}
        GROUP BY 1
      )
      SELECT
        to_char(days.day, 'YYYY-MM-DD') AS date,
        COALESCE(requested.n, 0) AS "ridesRequested",
        COALESCE(completed.n, 0) AS "ridesCompleted",
        COALESCE(cancelled.n, 0) AS "ridesCancelled",
        COALESCE(completed.revenue, 0) AS revenue,
        COALESCE(completed.commission, 0) AS commission,
        COALESCE(signups.n, 0) AS "newUsers"
      FROM days
      LEFT JOIN requested ON requested.day = days.day
      LEFT JOIN completed ON completed.day = days.day
      LEFT JOIN cancelled ON cancelled.day = days.day
      LEFT JOIN signups ON signups.day = days.day
      ORDER BY days.day ASC
      `,
      [rangeDays],
    )) as Array<Record<string, string>>;

    const byVehicleTypeRows = (await this.rideRequestRepository.query(
      `
      SELECT "vehicleType" AS "vehicleType",
        COUNT(*) AS rides,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COALESCE(SUM("offeredPrice") FILTER (WHERE status = 'completed'), 0) AS revenue
      FROM ride_requests
      WHERE "createdAt" >= ${RANGE_START_SQL}
      GROUP BY "vehicleType"
      ORDER BY rides DESC
      `,
      [rangeDays],
    )) as Array<Record<string, string>>;

    const statusRows = (await this.rideRequestRepository.query(
      `
      SELECT status, COUNT(*) AS n
      FROM ride_requests
      WHERE "createdAt" >= ${RANGE_START_SQL}
      GROUP BY status
      `,
      [rangeDays],
    )) as Array<{ status: string; n: string }>;

    const topAreaRows = (await this.rideRequestRepository.query(
      `
      SELECT "pickupArea" AS area, COUNT(*) AS rides
      FROM ride_requests
      WHERE "createdAt" >= ${RANGE_START_SQL}
      GROUP BY "pickupArea"
      ORDER BY rides DESC
      LIMIT 5
      `,
      [rangeDays],
    )) as Array<Record<string, string>>;

    const daily = dailyRows.map((row) => ({
      date: row.date,
      ridesRequested: this.toNumber(row.ridesRequested),
      ridesCompleted: this.toNumber(row.ridesCompleted),
      ridesCancelled: this.toNumber(row.ridesCancelled),
      revenue: this.toNumber(row.revenue),
      commission: this.toNumber(row.commission),
      newUsers: this.toNumber(row.newUsers),
    }));

    const statusBreakdown: Record<BreakdownStatus, number> = {
      open: 0,
      driver_selected: 0,
      completed: 0,
      cancelled: 0,
    };
    for (const row of statusRows) {
      if ((BREAKDOWN_STATUSES as readonly string[]).includes(row.status)) {
        statusBreakdown[row.status as BreakdownStatus] = this.toNumber(row.n);
      }
    }

    return {
      range: {
        days: rangeDays,
        from: daily[0]?.date ?? null,
        to: daily[daily.length - 1]?.date ?? null,
      },
      daily,
      byVehicleType: byVehicleTypeRows.map((row) => ({
        vehicleType: row.vehicleType,
        rides: this.toNumber(row.rides),
        completed: this.toNumber(row.completed),
        revenue: this.toNumber(row.revenue),
      })),
      statusBreakdown,
      topPickupAreas: topAreaRows.map((row) => ({
        area: row.area,
        rides: this.toNumber(row.rides),
      })),
    };
  }

  async listUsers(filters: {
    role?: string;
    status?: string;
    search?: string;
    page?: string;
    limit?: string;
    sort?: string;
    order?: string;
  }) {
    const { page, limit, skip } = this.parsePagination(filters.page, filters.limit);

    const query = this.userRepository.createQueryBuilder('u');
    query.where('u.deleted_at IS NULL');

    if (filters.status === 'active') {
      query.andWhere('u.is_active = :isActive', { isActive: true });
    } else if (filters.status === 'inactive') {
      query.andWhere('u.is_active = :isActive', { isActive: false });
    }

    if (filters.role === 'admin') {
      query.andWhere('u.is_admin = :isAdmin', { isAdmin: true });
    } else if (filters.role === 'driver') {
      query.andWhere('u.is_driver = :isDriver', { isDriver: true });
    } else if (filters.role === 'rider') {
      query.andWhere('u.is_admin = :isAdmin AND u.is_driver = :isDriver', {
        isAdmin: false,
        isDriver: false,
      });
    }

    if (filters.search && filters.search.trim()) {
      query.andWhere(
        '(LOWER(u.name) LIKE :search OR LOWER(u.email) LIKE :search OR LOWER(u.phone) LIKE :search)',
        { search: `%${filters.search.trim().toLowerCase()}%` },
      );
    }

    const sortColumn = USER_SORT_COLUMNS[filters.sort ?? 'created_at'] ?? USER_SORT_COLUMNS.created_at;
    const sortDirection = filters.order === 'asc' ? 'ASC' : 'DESC';

    query
      .select([
        'u.id',
        'u.name',
        'u.email',
        'u.phone',
        'u.is_active',
        'u.is_admin',
        'u.is_driver',
        'u.wallet_balance',
        'u.created_at',
      ])
      .orderBy(sortColumn, sortDirection)
      .skip(skip)
      .take(limit);

    const [users, total] = await query.getManyAndCount();

    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getUserDetail(userId: string) {
    // Explicit select keeps password, OTP, reset/refresh tokens and JazzCash details out of the response.
    const user = await this.userRepository.findOne({
      where: { id: userId, deleted_at: IsNull() },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        is_active: true,
        is_admin: true,
        is_driver: true,
        is_email_verified: true,
        gender: true,
        city: true,
        state: true,
        country: true,
        cnic: true,
        wallet_balance: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const [registration, statsRows, recentRides, recentTransactions] = await Promise.all([
      this.driverRegistrationRepository.findOne({
        where: { userId },
        select: {
          id: true,
          status: true,
          vehicleType: true,
          vehicleBrand: true,
          vehicleModel: true,
          numberPlate: true,
          createdAt: true,
        },
      }),
      this.rideRequestRepository.query(
        `
        SELECT
          COUNT(*) FILTER (WHERE rider_id = $1) AS "ridesAsRider",
          COUNT(*) FILTER (WHERE selected_driver_id = $1) AS "ridesAsDriver",
          COUNT(*) FILTER (WHERE rider_id = $1 AND status = 'completed') AS "completedAsRider",
          COUNT(*) FILTER (WHERE selected_driver_id = $1 AND status = 'completed') AS "completedAsDriver",
          COALESCE(SUM("offeredPrice") FILTER (WHERE rider_id = $1 AND status = 'completed'), 0) AS "totalSpent",
          COALESCE(SUM("driverPayout") FILTER (WHERE selected_driver_id = $1 AND status = 'completed'), 0) AS "totalEarned"
        FROM ride_requests
        `,
        [userId],
      ) as Promise<Array<Record<string, string>>>,
      this.rideRequestRepository.find({
        where: [{ riderId: userId }, { selectedDriverId: userId }],
        order: { createdAt: 'DESC' },
        take: 10,
      }),
      this.walletTransactionRepository.find({
        where: { userId },
        order: { createdAt: 'DESC' },
        take: 10,
      }),
    ]);

    const row = statsRows[0] ?? {};

    return {
      user,
      driverRegistration: registration,
      stats: {
        ridesAsRider: this.toNumber(row.ridesAsRider),
        ridesAsDriver: this.toNumber(row.ridesAsDriver),
        completedAsRider: this.toNumber(row.completedAsRider),
        completedAsDriver: this.toNumber(row.completedAsDriver),
        totalSpent: this.toNumber(row.totalSpent),
        totalEarned: this.toNumber(row.totalEarned),
      },
      recentRides,
      recentTransactions: recentTransactions.map((tx) => this.walletService.formatTransaction(tx)),
    };
  }

  async listRides(filters: {
    status?: string;
    search?: string;
    page?: string;
    limit?: string;
  }) {
    const { page, limit, skip } = this.parsePagination(filters.page, filters.limit);

    const query = this.rideRequestRepository.createQueryBuilder('r');

    // 'selected' is accepted as a legacy alias; the real status is 'driver_selected'.
    const status = filters.status === 'selected' ? 'driver_selected' : filters.status;
    if (status && status !== 'all') {
      query.andWhere('r.status = :status', { status });
    }

    if (filters.search && filters.search.trim()) {
      query.andWhere(
        '(LOWER(r.pickupLocation) LIKE :search OR LOWER(r.dropoffLocation) LIKE :search OR LOWER(r.vehicleType) LIKE :search OR LOWER(r.riderId) LIKE :search)',
        { search: `%${filters.search.trim().toLowerCase()}%` },
      );
    }

    query.orderBy('r.createdAt', 'DESC').skip(skip).take(limit);

    const [rides, total] = await query.getManyAndCount();

    const [openCount, selectedCount, completedCount, cancelledCount] = await Promise.all([
      this.rideRequestRepository.count({ where: { status: 'open' } }),
      this.rideRequestRepository.count({ where: { status: 'driver_selected' } }),
      this.rideRequestRepository.count({ where: { status: 'completed' } }),
      this.rideRequestRepository.count({ where: { status: 'cancelled' } }),
    ]);

    return {
      rides,
      summary: {
        open: openCount,
        selected: selectedCount,
        completed: completedCount,
        cancelled: cancelledCount,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // Joins the driver's account so the admin UI can fall back to their
  // signup name when firstName/lastName weren't collected at registration
  // (now optional — see CreateDriverRegistrationDto). Uses `leftJoin` +
  // explicit `addSelect` rather than `leftJoinAndSelect` so the user's
  // password/otp/reset-token columns never end up in this admin response.
  private driverRegistrationWithUserQuery() {
    return this.driverRegistrationRepository
      .createQueryBuilder('d')
      .leftJoin('d.user', 'user')
      .addSelect(['user.id', 'user.name', 'user.email', 'user.phone']);
  }

  async listDriverRegistrations(status?: string) {
    const query = this.driverRegistrationWithUserQuery();
    if (status) {
      query.andWhere('d.status = :status', { status });
    }

    const registrations = await query.getMany();
    return { registrations };
  }

  async getDriverRegistration(id: string) {
    const registration = await this.driverRegistrationWithUserQuery()
      .andWhere('d.id = :id', { id })
      .getOne();

    if (!registration) {
      throw new NotFoundException('Driver registration not found');
    }
    return { registration };
  }

  async approveDriverRegistration(registrationId: string, adminId: string) {
    const registration = await this.driverRegistrationRepository.findOne({ where: { id: registrationId } });
    if (!registration) {
      throw new NotFoundException('Driver registration not found');
    }

    if (registration.status === 'approved') {
      throw new BadRequestException('Registration is already approved');
    }

    const user = await this.userRepository.findOne({ where: { id: registration.userId } });
    if (!user || user.deleted_at) {
      throw new BadRequestException('Driver account not found or has been deleted');
    }

    await this.userRepository.manager.transaction(async (manager) => {
      registration.status = 'approved';
      await manager.save(registration);

      user.is_driver = true;
      await manager.save(user);
    });

    await this.auditService.log({
      adminId,
      action: 'driver.approved',
      targetType: 'driver_registration',
      targetId: registration.id,
      summary: `Approved driver ${user.name}`,
      metadata: { userId: user.id },
    });

    return { message: 'Driver registration approved', registration };
  }

  async rejectDriverRegistration(registrationId: string, adminId: string, reason?: string) {
    const registration = await this.driverRegistrationRepository.findOne({ where: { id: registrationId } });
    if (!registration) {
      throw new NotFoundException('Driver registration not found');
    }

    const user = await this.userRepository.findOne({ where: { id: registration.userId } });

    await this.userRepository.manager.transaction(async (manager) => {
      registration.status = 'rejected';
      await manager.save(registration);

      // Rejecting (or revoking an approved driver) must also remove driver access.
      if (user) {
        user.is_driver = false;
        await manager.save(user);
      }
    });

    await this.auditService.log({
      adminId,
      action: 'driver.rejected',
      targetType: 'driver_registration',
      targetId: registration.id,
      summary: `Rejected driver ${user?.name ?? registration.userId}`,
      metadata: { userId: registration.userId, reason: reason ?? null },
    });

    return { message: 'Driver registration rejected', registration, reason };
  }

  async changeUserRole(
    requestingAdminId: string,
    userId: string,
    changeRoleDto: ChangeUserRoleDto,
  ) {
    const user = await this.userRepository.findOne({ where: { id: userId, deleted_at: IsNull() } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // An admin can still edit their own driver flag, but can't deactivate
    // their own account or strip their own admin access here — either would
    // lock them out with no other admin necessarily able to undo it.
    if (userId === requestingAdminId) {
      if (changeRoleDto.is_active === false) {
        throw new BadRequestException('You cannot deactivate your own account');
      }
      if (changeRoleDto.is_admin === false) {
        throw new BadRequestException('You cannot remove admin access from your own account');
      }
    }

    const changedFields: Record<string, boolean> = {};

    if (changeRoleDto.is_admin !== undefined) {
      user.is_admin = changeRoleDto.is_admin;
      changedFields.is_admin = changeRoleDto.is_admin;
    }
    if (changeRoleDto.is_driver !== undefined) {
      user.is_driver = changeRoleDto.is_driver;
      changedFields.is_driver = changeRoleDto.is_driver;
    }
    if (changeRoleDto.is_active !== undefined) {
      user.is_active = changeRoleDto.is_active;
      changedFields.is_active = changeRoleDto.is_active;
    }

    await this.userRepository.save(user);

    await this.auditService.log({
      adminId: requestingAdminId,
      action: 'user.role_updated',
      targetType: 'user',
      targetId: user.id,
      summary: `Updated account flags for ${user.email}`,
      metadata: changedFields,
    });

    return {
      message: 'User role updated successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        is_admin: user.is_admin,
        is_driver: user.is_driver,
        is_active: user.is_active,
      },
    };
  }

  async deleteUser(requestingAdminId: string, userId: string) {
    if (userId === requestingAdminId) {
      throw new BadRequestException('You cannot delete your own account');
    }

    const user = await this.userRepository.findOne({ where: { id: userId, deleted_at: IsNull() } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.is_admin) {
      throw new BadRequestException('Remove admin access before deleting this account');
    }

    // Soft delete: wallet, ride and payment history references this row, so it
    // is kept and locked out instead of removed. Email/phone stay reserved.
    user.deleted_at = new Date();
    user.is_active = false;
    user.is_driver = false;
    user.is_admin = false;
    user.refresh_token = null;
    user.refresh_token_expires_at = null;
    await this.userRepository.save(user);

    await this.auditService.log({
      adminId: requestingAdminId,
      action: 'user.deleted',
      targetType: 'user',
      targetId: user.id,
      summary: `Deleted account ${user.email}`,
      metadata: { name: user.name },
    });

    return { message: 'User deleted successfully' };
  }

  async listWithdrawals(status?: string) {
    const { withdrawals } = await this.walletService.listWithdrawals(status);

    const userIds = [...new Set(withdrawals.map((withdrawal) => withdrawal.userId))];
    const drivers = userIds.length
      ? await this.userRepository.find({
          where: { id: In(userIds) },
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            jazzcash_account_number: true,
            jazzcash_account_title: true,
          },
        })
      : [];
    const driverById = new Map(drivers.map((driver) => [driver.id, driver]));

    const withdrawalsWithDriver = withdrawals.map((withdrawal) => {
      const driver = driverById.get(withdrawal.userId);
      return {
        ...withdrawal,
        driver: driver
          ? {
              id: driver.id,
              name: driver.name,
              email: driver.email,
              phone: driver.phone,
              jazzcashAccountNumber: driver.jazzcash_account_number ?? null,
              jazzcashAccountTitle: driver.jazzcash_account_title ?? null,
            }
          : null,
      };
    });

    // Summary covers every withdrawal, independent of the status filter.
    const totals = await this.walletTransactionRepository
      .createQueryBuilder('t')
      .select('t.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(ABS(t.amount)), 0)', 'amount')
      .where('t.type = :type', { type: 'withdrawal' })
      .groupBy('t.status')
      .getRawMany<{ status: string; count: string; amount: string }>();

    const summary = {
      pending: { count: 0, amount: 0 },
      completed: { count: 0, amount: 0 },
      rejected: { count: 0 },
    };
    for (const row of totals) {
      if (row.status === 'pending') {
        summary.pending = { count: this.toNumber(row.count), amount: this.toNumber(row.amount) };
      } else if (row.status === 'completed') {
        summary.completed = { count: this.toNumber(row.count), amount: this.toNumber(row.amount) };
      } else if (row.status === 'rejected') {
        summary.rejected = { count: this.toNumber(row.count) };
      }
    }

    return { withdrawals: withdrawalsWithDriver, summary };
  }

  async completeWithdrawal(withdrawalId: string, adminId: string) {
    const result = await this.walletService.completeWithdrawal(withdrawalId);

    await this.auditService.log({
      adminId,
      action: 'withdrawal.completed',
      targetType: 'withdrawal',
      targetId: withdrawalId,
      summary: `Marked withdrawal of ${result.transaction.amount} as paid`,
      metadata: { amount: result.transaction.amount, userId: result.transaction.userId },
    });

    return result;
  }

  async rejectWithdrawal(withdrawalId: string, adminId: string, reason?: string) {
    const result = await this.walletService.rejectWithdrawal(withdrawalId, reason);

    await this.auditService.log({
      adminId,
      action: 'withdrawal.rejected',
      targetType: 'withdrawal',
      targetId: withdrawalId,
      summary: `Rejected withdrawal of ${result.transaction.amount} and refunded wallet`,
      metadata: {
        amount: result.transaction.amount,
        userId: result.transaction.userId,
        reason: reason ?? null,
      },
    });

    return result;
  }

  async creditDriverWallet(adminId: string, driverId: string, amount: number, description?: string) {
    const driver = await this.userRepository.findOne({ where: { id: driverId, deleted_at: IsNull() } });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }
    if (!driver.is_driver) {
      throw new BadRequestException('User is not a driver');
    }

    const finalDescription = description?.trim() || 'Manual balance credit by admin';

    const { balance } = await this.walletService.credit(
      driverId,
      amount,
      'admin_manual_credit',
      null,
      finalDescription,
    );

    await this.auditService.log({
      adminId,
      action: 'wallet.credited',
      targetType: 'user',
      targetId: driverId,
      summary: `Credited ${amount} to driver wallet`,
      metadata: { amount, description: finalDescription, balance },
    });

    return {
      message: 'Wallet credited successfully',
      driverId,
      balance,
    };
  }

  async listAuditLogs(filters: { page?: string; limit?: string; action?: string; search?: string }) {
    const { page, limit } = this.parsePagination(filters.page, filters.limit);
    return this.auditService.listLogs({ page, limit, action: filters.action, search: filters.search });
  }
}
