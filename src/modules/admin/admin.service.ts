import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DriverRegistration } from '../driver-registration/entities/driver-registration.entity';
import { RideRequest } from '../ride-request/entities/ride-request.entity';
import { User } from '../user/entities/user.entity';
import { WalletService } from '../wallet/services/wallet.service';
import { ChangeUserRoleDto } from './dto/change-user-role.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(DriverRegistration)
    private readonly driverRegistrationRepository: Repository<DriverRegistration>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(RideRequest)
    private readonly rideRequestRepository: Repository<RideRequest>,
    private readonly walletService: WalletService,
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

  async getDashboardStats() {
    const [
      totalUsers,
      totalActiveUsers,
      totalDrivers,
      totalAdmins,
      pendingDriverApprovals,
      totalRideRequests,
      openRideRequests,
      selectedRideRequests,
      completedRideRequests,
      cancelledRideRequests,
      recentRideRequests,
      recentUsers,
    ] = await Promise.all([
      this.userRepository.count(),
      this.userRepository.count({ where: { is_active: true } }),
      this.userRepository.count({ where: { is_driver: true } }),
      this.userRepository.count({ where: { is_admin: true } }),
      this.driverRegistrationRepository.count({ where: { status: 'pending' } }),
      this.rideRequestRepository.count(),
      this.rideRequestRepository.count({ where: { status: 'open' } }),
      this.rideRequestRepository.count({ where: { status: 'selected' } }),
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
        order: { created_at: 'DESC' },
        take: 10,
      }),
    ]);

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
      },
      recentRideRequests,
      recentUsers,
    };
  }

  async listUsers(filters: {
    role?: string;
    status?: string;
    search?: string;
    page?: string;
    limit?: string;
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
      .orderBy('u.created_at', 'DESC')
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

  async listRides(filters: {
    status?: string;
    search?: string;
    page?: string;
    limit?: string;
  }) {
    const { page, limit, skip } = this.parsePagination(filters.page, filters.limit);

    const query = this.rideRequestRepository.createQueryBuilder('r');

    if (filters.status && filters.status !== 'all') {
      query.andWhere('r.status = :status', { status: filters.status });
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
      this.rideRequestRepository.count({ where: { status: 'selected' } }),
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

  async approveDriverRegistration(id: string) {
    const registration = await this.driverRegistrationRepository.findOne({ where: { id } });
    if (!registration) {
      throw new NotFoundException('Driver registration not found');
    }

    registration.status = 'approved';
    await this.driverRegistrationRepository.save(registration);

    // mark user as driver
    const user = await this.userRepository.findOne({ where: { id: registration.userId } });
    if (user) {
      user.is_driver = true;
      await this.userRepository.save(user);
    }

    return { message: 'Driver registration approved', registration };
  }

  async rejectDriverRegistration(id: string, reason?: string) {
    const registration = await this.driverRegistrationRepository.findOne({ where: { id } });
    if (!registration) {
      throw new NotFoundException('Driver registration not found');
    }

    registration.status = 'rejected';
    await this.driverRegistrationRepository.save(registration);

    // optionally could notify user via email here

    return { message: 'Driver registration rejected', registration, reason };
  }

  async changeUserRole(
    requestingAdminId: string,
    userId: string,
    changeRoleDto: ChangeUserRoleDto,
  ) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
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

    // Update role attributes if provided
    if (changeRoleDto.is_admin !== undefined) {
      user.is_admin = changeRoleDto.is_admin;
    }
    if (changeRoleDto.is_driver !== undefined) {
      user.is_driver = changeRoleDto.is_driver;
    }
    if (changeRoleDto.is_active !== undefined) {
      user.is_active = changeRoleDto.is_active;
    }

    await this.userRepository.save(user);

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

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.userRepository.remove(user);

    return { message: 'User deleted successfully' };
  }

  async listWithdrawals(status?: string) {
    return this.walletService.listWithdrawals(status);
  }

  async completeWithdrawal(withdrawalId: string) {
    return this.walletService.completeWithdrawal(withdrawalId);
  }

  async rejectWithdrawal(withdrawalId: string, reason?: string) {
    return this.walletService.rejectWithdrawal(withdrawalId, reason);
  }

  async creditDriverWallet(driverId: string, amount: number, description?: string) {
    const driver = await this.userRepository.findOne({ where: { id: driverId } });
    if (!driver) {
      throw new NotFoundException('Driver not found');
    }
    if (!driver.is_driver) {
      throw new BadRequestException('User is not a driver');
    }

    const { balance } = await this.walletService.credit(
      driverId,
      amount,
      'admin_manual_credit',
      null,
      description?.trim() || 'Manual balance credit by admin (testing)',
    );

    return {
      message: 'Wallet credited successfully',
      driverId,
      balance,
    };
  }
}
