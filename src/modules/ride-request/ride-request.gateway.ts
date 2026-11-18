import { Injectable, Logger } from '@nestjs/common';
import { WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, MessageBody, ConnectedSocket } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RideRequest } from './entities/ride-request.entity';
import { User } from '../user/entities/user.entity';
import { ChatService } from './services/chat.service';
import { DriverLocationService } from './services/driver-location.service';

@WebSocketGateway({ cors: { origin: '*' } })
@Injectable()
export class RideRequestGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RideRequestGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(RideRequest)
    private readonly rideRequestRepository: Repository<RideRequest>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly chatService: ChatService,
    private readonly driverLocationService: DriverLocationService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.query?.token;
      if (!token) {
        this.logger.warn('Socket connection rejected: missing token');
        client.disconnect();
        return;
      }

      const payload: any = this.jwtService.verify(String(token));
      if (!payload || !payload.id) {
        this.logger.warn('Socket connection rejected: invalid token');
        client.disconnect();
        return;
      }

      // fetch user to ensure still active
      const user = await this.userRepository.findOne({ where: { id: payload.id } });
      if (!user || !user.is_active) {
        this.logger.warn(`Socket connection rejected: user ${payload.id} not found or inactive`);
        client.disconnect();
        return;
      }

      client.data.user = { id: user.id, is_driver: user.is_driver };
      this.logger.log(`Socket connected: user=${user.id}`);
    } catch (err) {
      this.logger.warn('Socket authentication failed', (err as Error).message);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const user = client.data?.user;
    const uid = user?.id ?? 'unknown';

    if (user?.is_driver) {
      this.driverLocationService.clear(user.id);
    }

    this.logger.log(`Socket disconnected: user=${uid}`);
  }

  // Notify a specific list of drivers (already filtered by gender + proximity
  // upstream) about a new ride request. Each driver gets their own payload
  // (e.g. their own distanceToPickupKm), emitted to their own room.
  notifyDrivers(notifications: { driverId: string; payload: any }[]) {
    if (notifications.length === 0) return;

    this.logger.log(`Emitting ride_request:created to ${notifications.length} matched driver(s)`);
    for (const { driverId, payload } of notifications) {
      this.server.to(`driver:${driverId}`).emit('ride_request:created', payload);
    }
  }

  // Notify a specific rider (by userId) about a new driver response
  notifyRiderResponse(riderId: string, payload: any) {
    const room = `rider:${riderId}`;
    this.logger.log(`Emitting ride_request:response to ${room}`);
    this.server.to(room).emit('ride_request:response', payload);
  }

  // Nearby matched drivers (with optional live coords) for the find-driver map.
  notifyRiderNearbyDrivers(riderId: string, payload: any) {
    const room = `rider:${riderId}`;
    this.logger.log(`Emitting ride_request:nearby_drivers to ${room}`);
    this.server.to(room).emit('ride_request:nearby_drivers', payload);
    this.server.to(room).emit('ride_request:notified', payload);
  }

  // Driver opened / viewed the ride request (inDrive-style viewing DPs).
  notifyRiderDriverViewed(riderId: string, payload: any) {
    const room = `rider:${riderId}`;
    this.logger.log(`Emitting ride_request:viewed to ${room}`);
    this.server.to(room).emit('ride_request:viewed', payload);
  }

  // Notify rider and driver when a driver is selected
  notifyDriverSelected(riderId: string, driverId: string, payload: any) {
    const riderRoom = `rider:${riderId}`;
    const driverRoom = `driver:${driverId}`;
    this.logger.log(`Emitting ride_request:driver_selected to ${riderRoom} and ${driverRoom}`);
    this.server.to(riderRoom).emit('ride_request:driver_selected', payload);
    this.server.to(driverRoom).emit('ride_request:driver_assigned', payload);
  }

  // Notify other matched drivers that this ride is no longer available.
  notifyDriversRideTaken(driverIds: string[], payload: any) {
    if (!driverIds.length) return;
    this.logger.log(`Emitting ride_request:driver_selected (taken) to ${driverIds.length} other driver(s)`);
    for (const id of driverIds) {
      this.server.to(`driver:${id}`).emit('ride_request:driver_selected', payload);
    }
  }

  // Notify rider and (if one was selected) driver that a ride was cancelled
  notifyRideCancelled(riderId: string, driverId: string | null, payload: any) {
    const riderRoom = `rider:${riderId}`;
    this.logger.log(`Emitting ride_request:cancelled to ${riderRoom}`);
    this.server.to(riderRoom).emit('ride_request:cancelled', payload);

    if (driverId) {
      const driverRoom = `driver:${driverId}`;
      this.server.to(driverRoom).emit('ride_request:cancelled', payload);
    }
  }

  // Add connected rider/driver sockets to chat room so they receive chat messages immediately
  async joinUsersToChatRoom(rideRequestId: string, riderId: string, driverId: string) {
    const room = `chat:ride:${rideRequestId}`;
    this.joinConnectedSockets(room, riderId, driverId);

    // Notify both parties the chat room is ready
    this.server.to(`rider:${riderId}`).emit('chat:room_ready', { rideRequestId, room });
    this.server.to(`driver:${driverId}`).emit('chat:room_ready', { rideRequestId, room });
  }

  // Add connected rider/driver sockets to the live-tracking room so GPS
  // updates for this ride reach them immediately, and push whatever location
  // is already on record so the rider doesn't have to wait for the driver's
  // next GPS ping to see something on screen.
  async joinUsersToTrackingRoom(rideRequestId: string, riderId: string, driverId: string) {
    const room = this.trackingRoom(rideRequestId);
    this.joinConnectedSockets(room, riderId, driverId);

    this.server.to(`rider:${riderId}`).emit('tracking:room_ready', { rideRequestId, room });
    this.server.to(`driver:${driverId}`).emit('tracking:room_ready', { rideRequestId, room });

    this.server
      .to(room)
      .emit('driver:location:snapshot', this.buildLocationSnapshot(rideRequestId, driverId));
  }

  private trackingRoom(rideRequestId: string): string {
    return `tracking:ride:${rideRequestId}`;
  }

  private buildLocationSnapshot(rideRequestId: string, driverId: string) {
    const fresh = this.driverLocationService.getFresh(driverId);
    if (!fresh) {
      return { rideRequestId, available: false };
    }

    return {
      rideRequestId,
      driverId,
      lat: fresh.lat,
      lng: fresh.lng,
      updatedAt: new Date(fresh.updatedAt).toISOString(),
    };
  }

  private joinConnectedSockets(room: string, riderId: string, driverId: string) {
    const sockets = Array.from(this.server.sockets.sockets.values());

    for (const sock of sockets) {
      const uid = sock.data?.user?.id;
      if (!uid) continue;
      if (uid === riderId || uid === driverId) {
        sock.join(room);
        this.logger.log(`Socket user=${uid} joined room ${room}`);
      }
    }
  }

  @SubscribeMessage('join')
  async handleJoin(@MessageBody() data: { room: string }, @ConnectedSocket() client: Socket) {
    const room = data?.room;
    const user = client.data?.user;
    if (!room || !user) return;

    // Authorization rules
    if (room.startsWith('rider:')) {
      const riderId = room.split(':')[1];
      if (riderId !== user.id) return; // riders can only join their own rider room
    }

    if (room.startsWith('driver:')) {
      const driverId = room.split(':')[1];
      if (driverId !== user.id || !user.is_driver) return; // only the driver
    }

    if (room.startsWith('area:')) {
      // driver-only room
      if (!user.is_driver) return;
    }

    if (room.startsWith('tracking:ride:')) {
      const rideRequestId = room.substring('tracking:ride:'.length);
      const ride = await this.rideRequestRepository.findOne({ where: { id: rideRequestId } });

      // Only the rider who owns this ride, or the driver actually selected on
      // it, may join — and only once a driver has been selected at all.
      if (!ride || !ride.selectedDriverId) return;
      const isParticipant = user.id === ride.riderId || user.id === ride.selectedDriverId;
      if (!isParticipant) return;

      client.join(room);
      this.logger.log(`Socket user=${user.id} joined room ${room}`);
      client.emit('driver:location:snapshot', this.buildLocationSnapshot(rideRequestId, ride.selectedDriverId));
      return;
    }

    client.join(room);
    this.logger.log(`Socket user=${user.id} joined room ${room}`);
  }

  // Drivers report their live GPS position while online so ride requests can
  // be dispatched by proximity. Expected to be emitted every ~10-30s (or on
  // significant movement) while the driver app is active/available.
  @SubscribeMessage('driver:location:update')
  async handleDriverLocationUpdate(
    @MessageBody() data: { lat: number; lng: number },
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data?.user;
    if (!user?.is_driver) return;

    const lat = data?.lat;
    const lng = data?.lng;
    const isValid =
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      lat >= -90 &&
      lat <= 90 &&
      lng >= -180 &&
      lng <= 180;

    if (!isValid) return;

    this.driverLocationService.update(user.id, lat, lng);

    // Fan this position out to every ride this driver currently has selected
    // (there is normally exactly one) — the client never names a ride here,
    // so there's no way for a driver to spoof updates onto someone else's ride.
    const activeRides = await this.rideRequestRepository.find({
      where: { selectedDriverId: user.id, status: 'driver_selected' },
    });

    if (activeRides.length === 0) return;

    const updatedAt = new Date().toISOString();

    for (const ride of activeRides) {
      this.server.to(this.trackingRoom(ride.id)).emit('driver:location', {
        rideRequestId: ride.id,
        driverId: user.id,
        lat,
        lng,
        updatedAt,
      });
    }
  }

  @SubscribeMessage('leave')
  async handleLeave(@MessageBody() data: { room: string }, @ConnectedSocket() client: Socket) {
    const room = data?.room;
    const user = client.data?.user;
    if (!room || !user) return;
    client.leave(room);
    this.logger.log(`Socket user=${user.id} left room ${room}`);
  }

  @SubscribeMessage('chat:message')
  async handleChatMessage(@MessageBody() data: { rideRequestId: string; text: string }, @ConnectedSocket() client: Socket) {
    const user = client.data?.user;
    if (!user) return;
    const { rideRequestId, text } = data;
    if (!rideRequestId || !text) return;

    const ride = await this.rideRequestRepository.findOne({ where: { id: rideRequestId } });
    if (!ride) return;

    // allow only rider or selected driver to chat (only after driver is selected)
    if (ride.status !== 'driver_selected') return;
    const allowed = user.id === ride.riderId || user.id === ride.selectedDriverId;
    if (!allowed) return;

    const room = `chat:ride:${rideRequestId}`;
    // persist message
    try {
      const saved = await this.chatService.saveMessage(rideRequestId, user.id, text);
      const payload = {
        rideRequestId,
        from: user.id,
        text: saved.text,
        sentAt: saved.sentAt.toISOString(),
        id: saved.id,
      };

      this.server.to(room).emit('chat:message', payload);
      this.logger.log(`Chat message emitted to ${room} from ${user.id}`);
    } catch (err) {
      this.logger.warn('Failed to save chat message', (err as Error).message);
    }
  }
}
