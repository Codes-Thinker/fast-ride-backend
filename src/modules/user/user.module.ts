import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserService } from './services/user.service';
import { CloudinaryService } from './services/cloudinary.service';
import { UserController } from './user.controller';
import { DriverRegistration } from '../driver-registration/entities/driver-registration.entity';
import { RideRequest } from '../ride-request/entities/ride-request.entity';
import { WalletHold } from '../wallet/entities/wallet-hold.entity';
import { WalletTopUp } from '../wallet/entities/wallet-top-up.entity';
import { WalletTransaction } from '../wallet/entities/wallet-transaction.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      DriverRegistration,
      RideRequest,
      WalletHold,
      WalletTopUp,
      WalletTransaction,
    ]),
  ],
  providers: [UserService, CloudinaryService],
  controllers: [UserController],
  exports: [UserService, CloudinaryService],
})
export class UserModule {}
