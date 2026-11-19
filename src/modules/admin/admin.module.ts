import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriverRegistration } from '../driver-registration/entities/driver-registration.entity';
import { RideRequest } from '../ride-request/entities/ride-request.entity';
import { User } from '../user/entities/user.entity';
import { WalletTopUp } from '../wallet/entities/wallet-top-up.entity';
import { WalletTransaction } from '../wallet/entities/wallet-transaction.entity';
import { WalletModule } from '../wallet/wallet.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminAuditLog } from './entities/admin-audit-log.entity';
import { AuditService } from './services/audit.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DriverRegistration,
      User,
      RideRequest,
      WalletTransaction,
      WalletTopUp,
      AdminAuditLog,
    ]),
    WalletModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AuditService],
})
export class AdminModule {}
