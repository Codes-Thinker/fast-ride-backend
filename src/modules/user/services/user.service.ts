import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { User } from '../entities/user.entity';
import { UpdateProfileDto } from '../dto/update-profile.dto';
import { SetDriverPaymentMethodDto } from '../dto/set-driver-payment-method.dto';
import { SetDriverCnicDto } from '../dto/set-driver-cnic.dto';
import { CloudinaryService } from './cloudinary.service';
import { DriverRegistration } from '../../driver-registration/entities/driver-registration.entity';
import { RideRequest } from '../../ride-request/entities/ride-request.entity';
import { WalletHold } from '../../wallet/entities/wallet-hold.entity';
import { WalletTopUp } from '../../wallet/entities/wallet-top-up.entity';
import { WalletTransaction } from '../../wallet/entities/wallet-transaction.entity';

// Ride states in which the rider or driver is still tied to a trip.
const ACTIVE_RIDE_STATUSES = ['open', 'driver_selected'];

// Driver document fields on driver_registrations that hold Cloudinary public IDs.
const DRIVER_DOCUMENT_PUBLIC_IDS = [
  'personalPicturePublicId',
  'frontSideOfLicensePublicId',
  'selfieWithDriverLicensePublicId',
  'cnicFrontPublicId',
  'cnicBackPublicId',
  'photoOfVehiclePublicId',
  'vehicleRegistrationCertificatePublicId',
  'backsideOfVehicleInformationPublicId',
  'policeCertificatePublicId',
] as const;

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  /**
   * Get user profile by ID
   */
  async getProfile(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    this.logger.log(`Profile retrieved for user: ${userId}`);
    return this.formatUserResponse(user);
  }

  /**
   * Update user profile
   */
  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Update allowed fields
    if (updateProfileDto.name) user.name = updateProfileDto.name;
    if (updateProfileDto.bio !== undefined) user.bio = updateProfileDto.bio;
    if (updateProfileDto.address) user.address = updateProfileDto.address;
    if (updateProfileDto.city) user.city = updateProfileDto.city;
    if (updateProfileDto.state) user.state = updateProfileDto.state;
    if (updateProfileDto.postal_code) user.postal_code = updateProfileDto.postal_code;
    if (updateProfileDto.country) user.country = updateProfileDto.country;
    if (updateProfileDto.phone) user.phone = updateProfileDto.phone;

    await this.userRepository.save(user);

    this.logger.log(`Profile updated for user: ${userId}`);
    return {
      message: 'Profile updated successfully',
      user: this.formatUserResponse(user),
    };
  }

  /**
   * Set the driver's JazzCash account details, shown to riders who pay
   * online. Only available once the driver has been approved (is_driver is
   * set together with driver_registrations.status = 'approved').
   */
  async setDriverPaymentMethod(userId: string, dto: SetDriverPaymentMethodDto) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.is_driver) {
      throw new ForbiddenException('Only approved drivers can add a payment method');
    }

    user.jazzcash_account_number = dto.jazzcashAccountNumber;
    user.jazzcash_account_title = dto.jazzcashAccountTitle;

    await this.userRepository.save(user);

    this.logger.log(`Driver payment method set for user: ${userId}`);
    return {
      message: 'Payment method saved successfully',
      user: this.formatUserResponse(user),
    };
  }

  /**
   * Set the driver's CNIC. Required by JazzCash for Mobile Wallet top-up
   * transactions (sent as pp_CNIC on checkout) — collected once here and
   * reused on every wallet top-up rather than asked for again each time.
   */
  async setDriverCnic(userId: string, dto: SetDriverCnicDto) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.is_driver) {
      throw new ForbiddenException('Only drivers need to provide a CNIC');
    }

    user.cnic = dto.cnic;

    await this.userRepository.save(user);

    this.logger.log(`CNIC set for driver: ${userId}`);
    return {
      message: 'CNIC saved successfully',
      user: this.formatUserResponse(user),
    };
  }

  /**
   * Upload profile picture
   */
  async uploadProfilePicture(userId: string, file: { buffer: Buffer; mimetype: string; originalname: string; size: number }) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Validate file type
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Allowed types: JPEG, PNG, WebP, GIF',
      );
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw new BadRequestException('File size must not exceed 5MB');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Delete old image if exists
    if (user.profile_picture_public_id) {
      try {
        await this.cloudinaryService.deleteImage(user.profile_picture_public_id);
      } catch (error) {
        this.logger.warn(`Failed to delete old profile picture: ${(error as Error).message}`);
      }
    }

    // Upload new image
    const uploadResult = await this.cloudinaryService.uploadImage(file, `indrive/profiles/${userId}`);

    user.profile_picture_url = uploadResult.secure_url;
    user.profile_picture_public_id = uploadResult.public_id;

    await this.userRepository.save(user);

    this.logger.log(`Profile picture uploaded for user: ${userId}`);
    return {
      message: 'Profile picture uploaded successfully',
      url: uploadResult.secure_url,
      user: this.formatUserResponse(user),
    };
  }

  /**
   * Delete profile picture
   */
  async deleteProfilePicture(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.profile_picture_public_id) {
      throw new BadRequestException('No profile picture to delete');
    }

    try {
      await this.cloudinaryService.deleteImage(user.profile_picture_public_id);
    } catch (error) {
      this.logger.error(`Failed to delete image from Cloudinary: ${(error as Error).message}`);
      throw new BadRequestException('Failed to delete profile picture');
    }

    user.profile_picture_url = null as unknown as string;
    user.profile_picture_public_id = null as unknown as string;

    await this.userRepository.save(user);

    this.logger.log(`Profile picture deleted for user: ${userId}`);
    return {
      message: 'Profile picture deleted successfully',
      user: this.formatUserResponse(user),
    };
  }

  /**
   * Permanently closes the account.
   *
   * Personal details, the profile photo and the driver's uploaded documents are
   * removed. The user row is anonymised and marked deleted rather than dropped,
   * so ride and payment records keep their references for legal and dispute
   * purposes. Deletion is refused while the account still has money or work in
   * progress, so nothing is left stranded.
   */
  async deleteAccount(userId: string, password: string) {
    const publicIdsToDelete = await this.userRepository.manager.transaction(async (manager) => {
      // Lock the row so a ride, withdrawal or top-up can't start between the checks and the anonymisation.
      const user = await manager.findOne(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!user || user.deleted_at) {
        throw new NotFoundException('User not found');
      }

      if (user.is_admin) {
        throw new ForbiddenException('Admin accounts cannot be deleted from the app');
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new UnauthorizedException('Password is incorrect');
      }

      const openRides = await manager.count(RideRequest, {
        where: [
          { riderId: userId, status: In(ACTIVE_RIDE_STATUSES) },
          { selectedDriverId: userId, status: In(ACTIVE_RIDE_STATUSES) },
        ],
      });
      if (openRides > 0) {
        throw new BadRequestException('Finish or cancel your active rides before deleting your account');
      }

      if (Number(user.wallet_balance) > 0) {
        throw new BadRequestException('Withdraw your wallet balance before deleting your account');
      }

      const pendingWork = await Promise.all([
        manager.count(WalletHold, { where: { driverId: userId, status: 'active' } }),
        manager.count(WalletTransaction, { where: { userId, type: 'withdrawal', status: 'pending' } }),
        manager.count(WalletTopUp, { where: { userId, refundStatus: 'requested' } }),
      ]);
      if (pendingWork.some((count) => count > 0)) {
        throw new BadRequestException(
          'Wait for pending wallet holds, withdrawals or refund requests to finish before deleting your account',
        );
      }

      const registration = await manager.findOne(DriverRegistration, { where: { userId } });
      const documentIds = registration
        ? DRIVER_DOCUMENT_PUBLIC_IDS.map((field) => registration[field]).filter((id): id is string => Boolean(id))
        : [];
      const publicIds = [user.profile_picture_public_id, ...documentIds].filter((id): id is string => Boolean(id));

      if (registration) {
        await manager.delete(DriverRegistration, { userId });
      }

      // Random password so the old one can never sign in again; email and phone are
      // freed up for re-registration. Unique placeholders keep the unique indexes happy.
      const anonymised = {
        name: 'Deleted user',
        email: `deleted-${userId}@deleted.invalid`,
        phone: `deleted-${userId.slice(0, 12)}`,
        password: await bcrypt.hash(randomBytes(32).toString('hex'), 10),
        bio: null,
        address: null,
        city: null,
        state: null,
        postal_code: null,
        country: null,
        gender: null,
        profile_picture_url: null,
        profile_picture_public_id: null,
        otp: null,
        otp_expires_at: null,
        reset_password_token: null,
        reset_password_expires_at: null,
        refresh_token: null,
        refresh_token_expires_at: null,
        jazzcash_account_number: null,
        jazzcash_account_title: null,
        cnic: null,
        is_driver: false,
        is_active: false,
        deleted_at: new Date(),
      } as unknown as QueryDeepPartialEntity<User>;

      await manager.update(User, { id: userId }, anonymised);

      return publicIds;
    });

    // Images are removed after the commit. A failed Cloudinary call must not undo the
    // deletion, so each failure is logged and the rest are still attempted.
    for (const publicId of publicIdsToDelete) {
      try {
        await this.cloudinaryService.deleteImage(publicId);
      } catch (error) {
        this.logger.error(
          `Could not delete image ${publicId} for deleted user ${userId}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.log(`Account deleted for user: ${userId}`);
    return {
      message: 'Account deleted successfully',
    };
  }

  /**
   * Deactivate user account
   */
  async deactivateAccount(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.is_active) {
      throw new BadRequestException('Account is already deactivated');
    }

    user.is_active = false;
    await this.userRepository.save(user);

    this.logger.log(`Account deactivated for user: ${userId}`);
    return {
      message: 'Account deactivated successfully',
    };
  }

  /**
   * Activate user account
   */
  async activateAccount(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.is_active) {
      throw new BadRequestException('Account is already active');
    }

    user.is_active = true;
    await this.userRepository.save(user);

    this.logger.log(`Account activated for user: ${userId}`);
    return {
      message: 'Account activated successfully',
    };
  }

  /**
   * Format user response
   */
  private formatUserResponse(user: User) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      bio: user.bio,
      address: user.address,
      city: user.city,
      state: user.state,
      postal_code: user.postal_code,
      country: user.country,
      profile_picture_url: user.profile_picture_url,
      is_email_verified: user.is_email_verified,
      is_active: user.is_active,
      is_driver: user.is_driver,
      gender: user.gender,
      jazzcash_account_number: user.jazzcash_account_number,
      jazzcash_account_title: user.jazzcash_account_title,
      cnic: user.cnic,
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
  }
}
