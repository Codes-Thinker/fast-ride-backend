import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { DriverRegistration } from '../driver-registration/entities/driver-registration.entity';
import { User } from '../user/entities/user.entity';
import { WalletModule } from '../wallet/wallet.module';
import { RideRequestController } from './ride-request.controller';
import { DriverRideAlert } from './entities/driver-ride-alert.entity';
import { DriverRideResponse } from './entities/driver-ride-response.entity';
import { RideRequest } from './entities/ride-request.entity';
import { RideRequestService } from './services/ride-request.service';
import { RideRequestGateway } from './ride-request.gateway';
import { ChatMessage } from './entities/chat-message.entity';
import { ChatService } from './services/chat.service';
import { DriverLocationService } from './services/driver-location.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RideRequest,
      DriverRideAlert,
      DriverRideResponse,
      ChatMessage,
      DriverRegistration,
      User,
    ]),
    AuthModule,
    WalletModule,
  ],
  controllers: [RideRequestController],
  providers: [RideRequestService, RideRequestGateway, ChatService, DriverLocationService],
  // Exported so the admin module reads the same in-memory driver location store the gateway writes to.
  exports: [ChatService, DriverLocationService],
})
export class RideRequestModule {}
