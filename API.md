# Indrive API Documentation

This document lists server API endpoints, request/response fields, and role requirements. All endpoints are prefixed with `/api` and use JSON except where noted (multipart/form-data for file uploads).

---

## Roles
- Public: no authentication required (signup, login).
- Authenticated User: valid JWT required (`Authorization: Bearer <token>`).
- Admin: authenticated user with `is_admin = true` in the `users` table.

---

## Auth

### POST /api/auth/signup
- Role: Public
- Content-Type: `application/json`
- Body:
  - `name` (string, required)
  - `email` (string, required)
  - `phone` (string, required)
  - `password` (string, required)
  - `gender` (string, required) — allowed: `male | female`. **New field, required as of this version.** Used for gender-based ride matching (see Ride Requests below) — collected for every account, rider or driver, since a rider's own gender is what drives which drivers get notified. Any client still calling this endpoint without `gender` will now get a 400.
- Response: 201
  - `message` (string)
  - `user` { `id`, `name`, `email`, `phone` }

### POST /api/auth/verify-otp
- Role: Public
- Content-Type: `application/json`
- Body:
  - `email` (string, required)
  - `otp` (string, required)
- Response: 200
  - `message`, `token` (JWT access token), `refresh_token` (JWT, longer-lived — see `POST /api/auth/refresh-token`), `user` summary

### POST /api/auth/resend-otp
- Role: Public
- Content-Type: `application/json`
- Body:
  - `email` (string, required)
- Response: 200
  - `message`

### POST /api/auth/login
- Role: Public
- Content-Type: `application/json`
- Body:
  - `email` (string, required)
  - `password` (string, required)
- Response: 200
  - `message`, `token` (JWT access token, 24h expiry), `refresh_token` (JWT, 30-day expiry by default — see `POST /api/auth/refresh-token`), `user` summary — includes `id`, `name`, `email`, `phone`, `profile_picture_url`, `is_admin`, `is_driver`, `is_active`, `gender`

### POST /api/auth/refresh-token
- Role: Public (requires a valid refresh token, not an access token)
- Content-Type: `application/json`
- Body:
  - `refresh_token` (string, required) — the `refresh_token` issued by `login` or a previous call to this endpoint
- Action: verifies the refresh token's signature, expiry, and that it matches the hash stored for the user (i.e. hasn't already been rotated out or revoked by `logout`). On success, rotates it — the old refresh token becomes invalid and a new one is returned alongside a new access token.
- Response: 200
  - `message`, `token` (new JWT access token), `refresh_token` (new JWT refresh token)
- Errors: 401 if the token is malformed, expired, or has been revoked/rotated already.

### POST /api/auth/logout
- Role: Authenticated User
- Action: revokes the user's currently stored refresh token so it (and any request replaying it) can no longer be used to mint new access tokens. The access token used to call this endpoint is unaffected and remains valid until it naturally expires.
- Response: 200
  - `message`

### GET /api/auth/me
- Role: Authenticated User
- Response: 200
  - current user summary — includes `gender` (`male | female | null`)

### POST /api/auth/change-password
- Role: Authenticated User
- Body:
  - `old_password` (string)
  - `new_password` (string)
  - `confirm_password` (string)
- Response: 200
  - `message`

### POST /api/auth/forgot-password
- Role: Public
- Content-Type: `application/json`
- Body:
  - `email` (string, required)
- Action: generates a 6-digit OTP (10-minute expiry) and emails it to the user.
- Response: 200
  - `message`
- Errors: 404 if no user has this email.
- **This changed** — it used to email a clickable reset link/token directly usable on `reset-password`. It now sends an OTP instead, matching the same in-app confirmation flow as signup (see `POST /api/auth/verify-otp`) — better suited to a mobile app than a link requiring deep-linking. See `forgot-password/verify-otp` below for the next step.

### POST /api/auth/forgot-password/verify-otp
- Role: Public
- Content-Type: `application/json`
- Body:
  - `email` (string, required)
  - `otp` (string, required, 6 digits)
- Action: confirms the OTP sent by `forgot-password`. On success, issues a one-time opaque `resetToken` (15-minute expiry) and immediately invalidates the OTP — it cannot be reused, even to fetch another `resetToken`. This token, not the OTP, is what `reset-password` below consumes.
- Response: 200
  - `message`, `resetToken` (string) — pass this straight into `reset-password`'s `token` field
- Errors: 404 if no user has this email; 400 if the OTP is wrong, already used, or expired.

### POST /api/auth/reset-password
- Role: Public
- Content-Type: `application/json`
- Body:
  - `token` (string, required) — the `resetToken` returned by `forgot-password/verify-otp`
  - `new_password` (string, required)
  - `confirm_password` (string, required)
- Response: 200
  - `message`

-----

## Users

### GET /api/users/profile
- Role: Authenticated User
- Response: 200
  - `id`, `name`, `email`, `phone`, `bio`, `address`, `city`, `state`, `postal_code`, `country`, `profile_picture_url`, `is_email_verified`, `is_active`, `is_driver`, `gender` (`male | female | null` — `null` only for accounts created before this field existed), `jazzcash_account_number`, `jazzcash_account_title`, `created_at`, `updated_at`

### PATCH /api/users/profile
- Role: Authenticated User
- Content-Type: `application/json`
- Body (all optional):
  - `name`, `bio`, `address`, `city`, `state`, `postal_code`, `country`, `phone`
  - Note: `gender` is **not** editable here — it's set once at signup. If you need a "change gender" flow, that's a new endpoint to add, not currently supported.
- Response: 200
  - `message`, `user` (updated summary)

### POST /api/users/profile-picture
- Role: Authenticated User
- Content-Type: `multipart/form-data`
- Form Field: `file` (image)
- Response: 201
  - `message`, `url`, `user` (summary)

### DELETE /api/users/profile-picture
- Role: Authenticated User
- Response: 200
  - `message`, `user`

### PATCH /api/users/driver/payment-method
- Role: Authenticated User (Driver, must already be approved — `is_driver = true`)
- Content-Type: `application/json`
- Body:
  - `jazzcashAccountNumber` (string, required, 4–20 chars) — the JazzCash mobile/account number riders will transfer to for online-payment rides
  - `jazzcashAccountTitle` (string, required, 2–100 chars) — the account holder name shown to riders alongside the number
- Response: 200
  - `message`, `user` (updated summary — includes `jazzcash_account_number`/`jazzcash_account_title`)
- Errors: 403 if the requesting user is not an approved driver (`is_driver` is only `true` once an admin has approved the driver's registration — see `POST /api/admin/driver-registrations/:id/approve`).
- **App integration note:** show the "Add Payment Method" action only once the driver's own registration status is `approved` (from `GET /api/driver-registration/me`, or simply once `GET /api/users/profile` returns `is_driver: true`). Calling this endpoint before approval will 403.
- This is exactly what riders are shown as `driverPaymentDetails` once they select this driver on an `online`-payment ride (see Ride Requests below).

### PATCH /api/users/driver/cnic
- Role: Authenticated User (Driver)
- Content-Type: `application/json`
- Body:
  - `cnic` (string, required) — exactly 13 digits, no dashes (e.g. `3520212345671`)
- Response: 200
  - `message`, `user` (updated summary — includes `cnic`)
- Errors: 403 if the requesting user is not a driver.
- Purpose: JazzCash requires a CNIC (`pp_CNIC`) on every Mobile Wallet top-up checkout. Collected once here and reused automatically on every `POST /api/wallet/topup/jazzcash/initiate` call, rather than asked for again each time — see Wallet Top-Up below.
- **App integration note:** prompt for this the first time a driver tries to top up their wallet without one on file — `initiate` returns 400 until it's set.

### POST /api/users/deactivate
- Role: Authenticated User
- Response: 200
  - `message`

### POST /api/users/activate
- Role: Authenticated User
- Response: 200
  - `message`

---

## Driver Registration

### POST /api/driver-registration
- Role: Authenticated User (applicant)
- Content-Type: `multipart/form-data`
- Text fields (body):
  - `vehicleType` (string, required) allowed: `bike | rikshaw | car_without_ac | car_with_ac | business_car`
  - `operatingArea` (string, required)
  - `firstName` (string, **optional**) — the account's own `name` (from signup) is the reliable source for display; only collect this if you want to let the driver specify a different registered name.
  - `lastName` (string, **optional**)
  - `dateOfBirth` (ISO date string, **optional**)
  - `licenseNumber` (string, required)
  - `expirationDate` (ISO date string, required)
  - `idNumber` (string, required)
  - `vehicleBrand` (string, **optional**)
  - `vehicleModel` (string, required)
  - `vehicleColor` (string, **optional**)
  - `numberPlate` (string, required)
  - `productionYear` (integer, required)

- File fields (multipart):
  - `personalPicture` (image, required)
  - `frontSideOfLicense` (image, required)
  - `selfieWithDriverLicense` (image, **optional**)
  - `cnicFront` (image, required)
  - `cnicBack` (image, required)
  - `photoOfVehicle` (image, **optional**)
  - `vehicleRegistrationCertificate` (image, **optional**)
  - `backsideOfVehicleInformation` (image, **optional**)

  **Simplified as of this version** — the fields marked optional above used to be required. This was a deliberate product decision to reduce signup friction; omitted fields/files are simply stored as `null`. If you're building a new registration screen, you can leave these out of the initial flow entirely (see "What Changed" note below) — there is currently no follow-up endpoint to fill them in later (unlike the police certificate, which does have one — see next endpoint).

- Response: 201
  - `message`
  - `driverRegistration` object (summary including `status` set to `pending`; any omitted optional field/file comes back as `null`)

### POST /api/driver-registration/police-certificate
- Role: Authenticated User (must already have a driver registration — any status, not just `approved`)
- Content-Type: `multipart/form-data`
- File field: `policeCertificate` (required) — image (JPEG/PNG/WebP/GIF) or PDF
- Purpose: a police character certificate is **never** collected at registration time. The driver (or their agent) uploads it whenever they have it ready — same day, 15 days later, a month later, whenever — by calling this endpoint on its own. There's no deadline enforced by the backend.
- Response: 200
  - `message`, `driverRegistration` object (now including `policeCertificateUrl`)
- Errors: 404 if the caller has no driver registration yet — complete `POST /api/driver-registration` first.

### GET /api/driver-registration/me
- Role: Authenticated User
- Response: 200
  - `driverRegistration` object (detailed) — now also includes `policeCertificateUrl` (`null` until uploaded via the endpoint above)

Notes:
- Uploaded images are stored via Cloudinary; stored fields include `_Url` and `_PublicId` for each uploaded file in the `driver_registrations` table.
- A user can have at most one driver registration (unique on `user_id`).
- Once an admin approves the registration (`users.is_driver = true`), the driver should be prompted to set up their JazzCash payout details (`PATCH /api/users/driver/payment-method`) and, if they intend to accept rides, top up their wallet (see Wallet Top-Up below) — a driver with `0` wallet balance cannot respond `interested` to any ride that has a non-zero commission.
- `GET /api/admin/driver-registrations` and `GET /api/admin/driver-registrations/:id` now also embed a `user: { id, name, email, phone }` object on each registration — that's the admin dashboard's fallback for displaying a driver's name when `firstName`/`lastName` weren't collected.

---

## Ride Requests & Driver Alerts

This module implements the request → bid → acceptance → completion flow. **Money for the ride fare itself never passes through this backend, for either payment method** — the platform only ever moves money for its own commission, via each driver's wallet. Summary of the flow:

1. Rider enters pickup and dropoff locations in the app.
2. Frontend computes distance (Haversine) using coordinates and calls `POST /api/ride-requests/estimate` to get a fare breakdown per vehicle type.
3. Frontend shows fares to the rider; the rider may optionally increase the offered price, picks a vehicle type, and picks a **payment method** — `cash` (handed to the driver in person) or `online` (rider transfers directly to the driver's JazzCash account once one is selected — see step 7). This choice is made once, here, and cannot be changed later.
4. Rider submits `POST /api/ride-requests` with all of the above. Backend creates the `ride_request` (`status = 'open'`), finds matching approved drivers (see **Ride Matching Rules** below — gender + live-location radius, with an area-text fallback), and creates a `driver_ride_alert` for each (delivered in-app/system/email, and over Socket.IO — see notes below).
5. A targeted driver responds `interested` (optionally with a `counterOfferPrice`) or `declined` via `POST /api/ride-requests/:rideRequestId/driver/respond`. **Responding `interested` places a hold on that ride's `companyCommission` amount against the driver's wallet** — if the driver's available balance (`wallet_balance` minus every other still-active hold) can't cover it, the call fails with 400 and no response is recorded. This is why a driver needs wallet funds before they can keep accepting rides (see Wallet below).
6. Rider fetches responses with `GET /api/ride-requests/:rideRequestId/responses`.
7. Rider selects one driver via `POST /api/ride-requests/:rideRequestId/select-driver/:driverId` → `status = 'driver_selected'`. Every other interested driver's hold is released immediately (they weren't chosen, no reason to keep their funds tied up). If `paymentMethod = 'online'`, the response now includes `driverPaymentDetails` (the selected driver's JazzCash account number + title) — **this is the entire online-payment flow**: the app shows these details to the rider, and the rider sends the transfer themselves, outside the app. The backend never sees or confirms that transfer.
8. Either the ride completes normally, or the rider cancels it first:
   - `POST /api/ride-requests/:rideRequestId/cancel` (rider only, while `open` or `driver_selected`) → `status = 'cancelled'`, and any active hold on the ride is released back to the driver's available balance.
   - `POST /api/ride-requests/:rideRequestId/complete` (the selected driver only, while `driver_selected`) → `status = 'completed'`, and the ride's `companyCommission` is **debited** from the driver's wallet, capturing the earlier hold. This happens for **both** `cash` and `online` rides now — the driver already has the fare in hand (or received it directly), so commission is simply a standalone wallet debit, not something skimmed out of a payment the platform processed.

Notes on real-time behaviour:
- Integrate Socket.IO on both client and server for live updates:
  - `ride_request:created` — emitted **directly to the matched driver's own `driver:{driverId}` room** when a new request matches them (see Ride Matching Rules below for who gets matched). This changed recently — it used to be a broadcast to a shared `area:{normalizedArea}:{vehicleFamily}` room; that room/event no longer carries ride requests.
  - `ride_request:response` — emitted to the rider when a driver responds.
  - `ride_request:driver_selected` (to rider) / `ride_request:driver_assigned` (to driver) — emitted when a driver is selected. Now also carries pickup/dropoff coordinates — see Ride Matching Rules below.
  - `ride_request:cancelled` — emitted to the rider and (if one was selected) the driver when the rider cancels.
  - `chat:message` — chat messages once the ride is `driver_selected` (see `GET /:rideRequestId/chat` below for history).
  - `driver:location:update` (driver app → server, not a broadcast) — see Ride Matching Rules below. This is the one event the driver app sends rather than listens for.
  - `driver:location` / `driver:location:snapshot` / `tracking:room_ready` — live GPS tracking for the rider once a driver is selected. See **Live Location Tracking** below.
  - Rooms: riders join `rider:{userId}`; drivers join `driver:{userId}`. **Every driver app must join its own `driver:{driverId}` room right after connecting/authenticating** (send `join` with `{ room: 'driver:<own driver id>' }`) — this is now the only channel `ride_request:created` is delivered on. A driver that never joins this room will only find out about new ride requests by polling `GET /api/ride-requests/driver/alerts`.

### Ride Matching Rules

A ride request is only dispatched to a driver if **both** of these hold:

1. **Gender match** — if the rider has a `gender` on file, only drivers with the *same* `gender` are matched. (Riders with no `gender` set — old accounts predating this field — get unrestricted matching, same as before.)
2. **Proximity match (5 km radius)** — the driver must have reported a live GPS position within the last **2 minutes** via the `driver:location:update` socket event (see below), and that position must be within **5 km** of the ride's pickup coordinates (haversine distance, same formula used for fare estimation).
   - **Fallback:** if a driver hasn't sent a location update recently (e.g. an older app build, or just opened the app), they fall back to the previous behavior — matched by normalized operating-area text instead of GPS distance. This is a transitional safety net; once every driver app is sending live locations, this fallback effectively never triggers.

**What the driver app must do to get precise, real-time ride requests:**
1. Send `gender` at signup (see `POST /api/auth/signup` above).
2. On socket connect, join `driver:{ownDriverId}` (existing `join` event, no change).
3. While online/available for rides, emit `driver:location:update` every **~10-30 seconds** (or on significant movement):
   ```json
   { "lat": 31.5204, "lng": 74.3587 }
   ```
   No acknowledgement is sent back. Invalid payloads (missing/non-numeric/out-of-range `lat`/`lng`, or not a driver account) are silently ignored. There's no explicit "stop tracking" event — simply stop emitting, or disconnect the socket, and the driver's last known location expires automatically after 2 minutes and is cleared entirely on disconnect. Sending this event also drives the live-tracking broadcast described below.

Until an individual driver's app sends both of these, that driver still receives ride requests via the old area-text matching and the `driver_ride_alert` polling endpoint — this is not a hard cutover, so there's no "everyone breaks at once" risk during rollout.

**`ride_request:created` payload** (emitted per-driver, so `driverLatitude`/`driverLongitude`/`distanceToPickupKm`/`driverLocationUpdatedAt` differ per recipient and are `null` for a driver matched via the area-text fallback instead of GPS):
```json
{
  "rideRequestId": "ride-id",
  "pickupLocation": "Pickup address",
  "dropoffLocation": "Destination address",
  "pickupLatitude": 31.5204,
  "pickupLongitude": 74.3587,
  "vehicleType": "car_with_ac",
  "offeredPrice": 1200,
  "estimatedDistanceKm": 8.4,
  "driverLatitude": 31.515,
  "driverLongitude": 74.35,
  "distanceToPickupKm": 1.7,
  "driverLocationUpdatedAt": "2026-08-28T12:00:00.000Z"
}
```
The same `distanceToPickupKm` (computed live against the driver's *current* position, so it changes between polls as the driver moves) is also included on each entry's `ride` object in `GET /api/ride-requests/driver/alerts` — see that endpoint below.

### Live Location Tracking (Driver → Rider)

Once a driver is selected, the rider's app can track their live position over Socket.IO — separate from chat, so GPS never rides through `chat:message`.

**Room:** `tracking:ride:{rideRequestId}`. Only two people may ever be in it: the ride's rider (`ride.riderId`), and the currently-`selectedDriverId` — enforced server-side by looking up the ride in the database, not by trusting the client's claim. A ride with no driver selected yet has no one who can join this room (there's nothing to track).

**Joining:**
- **Automatic:** the moment a driver is selected (`POST /.../select-driver/:driverId`), the backend joins both parties' *currently connected* sockets to the room itself — no client action needed if the app is already connected when selection happens.
- **Manual (recommended: always do this too):** send `join` with `{ room: 'tracking:ride:<rideRequestId>' }`. Needed if the rider opens/reopens the tracking screen after selection (e.g. reconnected socket, backgrounded app) — the automatic join only catches sockets connected *at the moment of selection*.

**Events:**
- `driver:location` (broadcast to the room) — emitted every time the driver sends `driver:location:update`, for as long as the ride stays in `driver_selected` status:
  ```json
  {
    "rideRequestId": "ride-id",
    "driverId": "driver-id",
    "lat": 31.5204,
    "lng": 74.3587,
    "updatedAt": "2026-08-28T12:00:00.000Z"
  }
  ```
  This stops automatically once the ride is `completed` or `cancelled` (the backend looks up the driver's currently-`driver_selected` rides on every location update and only broadcasts to those — a finished ride is never matched again, nothing to unsubscribe from).
- `driver:location:snapshot` — an initial/on-demand snapshot, sent (a) automatically right after a driver is selected, to the room, and (b) directly to a socket whenever it successfully joins a `tracking:ride:*` room (covers the rider opening the tracking screen after the driver's first GPS ping already happened). Two possible shapes:
  ```json
  { "rideRequestId": "ride-id", "driverId": "driver-id", "lat": 31.5204, "lng": 74.3587, "updatedAt": "2026-08-28T12:00:00.000Z" }
  ```
  or, if the driver has no location on record yet or it's older than 2 minutes:
  ```json
  { "rideRequestId": "ride-id", "available": false }
  ```
  Show "Driver location unavailable" in the UI until a `driver:location` event (or a snapshot with coordinates) arrives.
- `tracking:room_ready` — `{ rideRequestId, room }`, emitted to both `rider:{riderId}` and `driver:{driverId}` right after the automatic join on selection (mirrors the existing `chat:room_ready` event).

**Determining what the distance is *to* (pickup vs destination):** the backend does not emit separate events for "driving to pickup" vs "driving to destination" — it always sends the driver's raw coordinates plus `rideRequestId`. The app already knows the ride's current `status` (from `GET /api/ride-requests/me`, or the `ride_request:*` events) and its pickup/dropoff coordinates (from the ride object) — combine those three client-side to decide which point to measure distance against and what label to show.

**Driver app note:** the driver side of this doesn't require any new event beyond the `driver:location:update` it already sends for matching (see Ride Matching Rules above) — one GPS ping now does double duty: it updates matching eligibility *and* feeds this rider-facing broadcast for whichever ride(s) that driver currently has `driver_selected`.

### POST /api/ride-requests/estimate
- Role: Public
- Content-Type: `application/json`
- Body:
  - `pickupLatitude` (number, required)
  - `pickupLongitude` (number, required)
  - `dropoffLatitude` (number, required)
  - `dropoffLongitude` (number, required)
  - `serviceArea` (string, optional) allowed: `city | out_of_city`
- Response: 200
  - `estimatedDistanceKm` (number)
  - `serviceArea` (string)
  - `fares` (object) — fare breakdown per vehicle type, each entry includes `totalFare`, `companyCommission`, `driverPayout`, `estimatedDistanceKm` and breakdown details returned by the fare calculator.

Fare policy:

- City rides use the vehicle's minimum fare through 2 km, then add the vehicle's per-kilometre rate for each kilometre beyond 2 km:
  - Bike: Rs 50 minimum, then Rs 16/km
  - Rikshaw: Rs 65 minimum, then Rs 35/km
  - Car Mini (with or without AC): Rs 95 minimum, then Rs 45/km
  - Business Car: Rs 115 minimum, then Rs 55/km
- Out-of-city rides are calculated at Rs 45/km.
- Company commission is 15% of the calculated ride fare; the driver payout is the remaining 85%.

### POST /api/ride-requests
- Role: Authenticated User (Rider)
- Content-Type: `application/json`
- Body:
  - `paymentMethod` (string, required) allowed: `online | cash` — chosen by the rider here, up front; fixed for the life of the ride, the driver cannot change it. `online` means the rider will pay the selected driver directly via JazzCash once one is chosen (see step 7 above) — the backend never processes this payment.
  - `pickupLocation` (string, required)
  - `dropoffLocation` (string, required)
  - `vehicleType` (string, required) allowed: `bike | rikshaw | car_without_ac | car_with_ac | business_car`
  - `pickupArea` (string, optional)
  - `pickupLatitude` (number, required)
  - `pickupLongitude` (number, required)
  - `dropoffLatitude` (number, required)
  - `dropoffLongitude` (number, required)
  - `serviceArea` (string, optional) allowed: `city | out_of_city`
  - `offeredPrice` (number, optional) — if provided, backend accepts this as the rider's offered price (recommended to be >= estimate). Note `companyCommission`/`driverPayout` are always derived from the backend's own calculated fare (15% of the distance/vehicle-type based total), **not** from a custom `offeredPrice`.
  - `notes` (string, optional)
- Response: 201
  - `message`
  - `rideRequest` (ride details including `estimatedDistanceKm`, `offeredPrice`, `driverPayout`, `companyCommission`, `paymentMethod`, `status`)
  - `dispatchedAlerts` (integer)

### GET /api/ride-requests/me
- Role: Authenticated User (Rider)
- Response: 200
  - `rideRequests` array (rider's own requests, latest first — this **is** the rider's ride history, no separate history endpoint exists). Once a driver is selected (any `paymentMethod`), each entry also carries `driver: { id, name, phone }`. If `paymentMethod = 'online'`, it additionally carries `driverPaymentDetails: { jazzcashAccountNumber, jazzcashAccountTitle }` — poll this endpoint (or use the `ride_request:driver_selected` socket event) to know when/where to show the transfer instructions, and keep showing them throughout tracking. Both fields are simply absent (not `null`) until a driver is selected.

### GET /api/ride-requests/driver/alerts
- Role: Authenticated User (Driver app view)
- Response: 200
  - `alerts` array with:
    - `id`, `rideRequestId`, `driverId`, `vehicleType`, `message`
    - `inAppStatus`, `systemStatus`, `emailStatus`, `emailError`
    - `isRead`, `createdAt`, `updatedAt`
    - `ride` (embedded summary) — includes `paymentMethod` (`online | cash`) and `companyCommission`, so the driver's app can show upfront, before responding, both how they'll be paid and how much wallet balance responding `interested` will hold. Also includes `distanceToPickupKm` — computed fresh on every call against the driver's *current* live location (`null` if the driver has no live location on record right now), so it changes between polls as the driver moves. Same figure `ride_request:created` reports in real time (see Ride Matching Rules above) — kept consistent so the UI doesn't show two different numbers depending on whether the driver saw the push or found the ride by polling.
- Note: this lists ride *offers/alerts* — it includes rides the driver was never selected for. For the driver's own ride history (rides they were actually selected for), use `GET /api/ride-requests/driver/history` below.

### GET /api/ride-requests/driver/history
- Role: Authenticated User (Driver)
- Response: 200
  - `rideRequests` array (every ride request this driver was ever `selectedDriverId` for — `driver_selected`, `completed`, or `cancelled`-after-selection — latest first). Same shape as `GET /api/ride-requests/me`'s entries, plus a `rider: { id, name, phone }` object (`null` only if the rider account has since been deleted).
- Notes: unlike `driver/alerts`, this only includes rides the driver was actually chosen for — a ride the driver responded `interested` to but wasn't picked for never appears here.

### POST /api/ride-requests/:rideRequestId/driver/respond
- Role: Authenticated User (Driver)
- Content-Type: `application/json`
- Body:
  - `decision` (string, required) — allowed values: `interested` | `declined`
  - `counterOfferPrice` (number, optional) — driver can propose a different price
  - `message` (string, optional)
- Response: 200
  - `message`, `response` (response details, including `counterOfferPrice` if provided)
- Errors: 400 if `decision = 'interested'` and the driver's available wallet balance (`wallet_balance` minus other active holds) is below this ride's `companyCommission` — **the response is not recorded** in that case; the app should surface this as "insufficient wallet balance, top up to accept this ride" and offer the top-up flow (see Wallet Top-Up below).
- Notes: a successful `interested` response places a hold on `companyCommission`. The hold is released if the driver later switches to `declined`, if the rider picks a different driver, or if the ride is cancelled — and is captured (converted into an actual debit) if this driver is selected and completes the ride. A driver can call this repeatedly on the same ride to flip their decision (e.g. `interested` → `declined` → `interested` again) — the hold is re-checked against the current balance each time it's (re)placed.

### GET /api/ride-requests/:rideRequestId/responses
- Role: Authenticated User (Rider)
- Response: 200
  - `rideRequestId`, `status`, `selectedDriverId`, `responses` array with each driver response: `driverId`, `decision`, `counterOfferPrice`, `message`, timestamps

### POST /api/ride-requests/:rideRequestId/select-driver/:driverId
- Role: Authenticated User (Rider)
- Action: sets `status = 'driver_selected'`, records `selectedDriverId`/`selectedAt`, and releases every other interested driver's wallet hold for this ride.
- Response: 200
  - `message`, `rideRequest` (includes `driverPaymentDetails: { jazzcashAccountNumber, jazzcashAccountTitle }` when `paymentMethod = 'online'`), `selectedResponse`
- Errors: 400 if the ride isn't `open`, or the given driver hasn't responded `interested`.

### POST /api/ride-requests/:rideRequestId/cancel
- Role: Authenticated User (Rider, own ride request only)
- Action: allowed while `status` is `open` or `driver_selected`. Sets `status = 'cancelled'`, records `cancelledAt`, and releases any active wallet hold(s) on the ride (every interested driver's hold if no one had been selected yet, or just the selected driver's if one had been).
- Response: 200
  - `message`, `rideRequest`
- Errors: 400 if the ride is already `completed` or `cancelled`; 403 if the caller isn't the owning rider.

### POST /api/ride-requests/:rideRequestId/complete
- Role: Authenticated User (Driver, must be the ride's `selectedDriverId`)
- Body: none — the driver has no input here. `paymentMethod` was already fixed by the rider at creation.
- Precondition: ride must currently be `status = 'driver_selected'`.
- Action: sets `status = 'completed'` and `completedAt`, then debits this ride's `companyCommission` from the driver's wallet (capturing the hold placed when they responded `interested`) — **for both `cash` and `online` rides**. This debit is idempotent: a duplicate/retried call cannot double-debit the same ride.
- Response: 200
  - `message`, `rideRequest` (updated), `wallet` (`{ balance }` reflecting the post-debit balance, or `null` if the commission was `0` or had already been debited)

### GET /api/ride-requests/:rideRequestId/chat
- Role: Authenticated User (the rider or the selected driver on this ride)
- Response: 200
  - Chat message history for the ride. Live messages arrive over the Socket.IO gateway's `chat:message` event once the ride is `driver_selected` (send with the same event name, body `{ rideRequestId, text }`); this REST endpoint is for loading history on screen load/reconnect.

### PATCH /api/ride-requests/driver/alerts/:alertId
- Role: Authenticated User (Driver)
- Body:
  - `isRead` (boolean, required)
- Response: 200
  - `message`, `alert` (updated)

---

## Online Ride Payments (Direct to Driver)

**There is no backend-mediated payment flow for ride fares anymore.** Earlier versions of this API had a JazzCash Hosted Checkout integration (`POST /api/payments/jazzcash/initiate`, `/callback`, `/status`, `/inquire`, `GET /api/payments/ride/:rideRequestId`) that routed the rider's payment through the company's own JazzCash merchant account. **Those endpoints have been removed.** If your app still calls them, remove that code — you'll get 404s.

The new model, for a ride created with `paymentMethod: "online"`:
1. Once the rider selects a driver (`POST /api/ride-requests/:rideRequestId/select-driver/:driverId`), the response — and every subsequent `GET /api/ride-requests/me` poll — includes `rideRequest.driverPaymentDetails: { jazzcashAccountNumber, jazzcashAccountTitle }`.
2. Show those details to the rider (e.g. "Send Rs {offeredPrice} to {jazzcashAccountTitle} — {jazzcashAccountNumber} via JazzCash") and let them complete the transfer in their own JazzCash app, or any P2P method they and the driver agree on. There is no in-app checkout, no webhook, nothing to poll for payment confirmation — the app's job here is purely informational/UI.
3. The driver marks the ride complete once they've received the funds (`POST /api/ride-requests/:rideRequestId/complete`), same call as for a `cash` ride. This is also the point the platform's own commission is deducted from the driver's wallet (see Ride Requests §8 above and Wallet below) — it is unrelated to, and independent of, whatever amount the rider actually transferred to the driver.

If a driver hasn't set up their JazzCash account yet (`PATCH /api/users/driver/payment-method`, see Users above), `driverPaymentDetails` fields will be `null` — the app should handle that gracefully (e.g. fall back to telling the rider to arrange payment directly with the driver via chat).

---

## Wallet (Drivers)

Every driver has a `wallet_balance` on their `users` row, backed by an append-only `wallet_transactions` ledger, plus a set of **holds** (`wallet_holds` table) that temporarily reserve funds against rides the driver has responded `interested` to but not yet completed or been passed over for.

- **`availableBalance`** (`wallet_balance` minus the sum of all currently-`active` holds) is what actually gates whether a driver can respond `interested` to a new ride (see `POST /api/ride-requests/:rideRequestId/driver/respond`) and how much they can withdraw. Always use `availableBalance`, not raw `balance`, when deciding in the UI whether to let the driver tap "Accept" on a ride, so the in-app message matches what the server will actually enforce.
- `wallet_transactions.type` values:
  - `wallet_top_up` — credited when a JazzCash wallet top-up completes (see Wallet Top-Up below).
  - `commission_debit` — debited when the driver completes a ride (`companyCommission`, both `cash` and `online` rides).
  - `withdrawal` — created by the driver via `POST /api/wallet/withdraw`; reserves funds immediately (`status = pending`) pending manual admin payout.
  - `withdrawal_rejected_refund` — created automatically when an admin rejects a pending withdrawal, crediting the reserved amount back.
  - `ride_earning` — legacy type from the old platform-mediated online-payment flow; no longer produced by any current code path, may still appear on old transaction history.

**Note on withdrawals:** the JazzCash credentials configured for this project are collection-only (used for wallet top-ups) — there is no disbursement/payout API wired up for withdrawals. A withdrawal request only reserves the funds in the ledger; actually paying the driver out (bank transfer, JazzCash mobile transfer, etc.) is a manual step the admin performs before calling the "complete" endpoint below. Withdrawal amount is checked against `availableBalance`, not raw balance, so a driver can't withdraw funds that are currently held against an accepted ride.

### GET /api/wallet/me
- Role: Authenticated User (must be a driver — `is_driver = true`, otherwise 403)
- Response: 200
  - `balance` (number) — raw `wallet_balance`
  - `heldBalance` (number) — sum of currently-active holds
  - `availableBalance` (number) — `balance - heldBalance`; this is the number to show as "usable" balance and to compare against a ride's commission before letting the driver tap Accept
  - `recentTransactions` (last 20 ledger entries)

### GET /api/wallet/transactions?page&limit
- Role: Authenticated User (driver)
- Query params: `page` (default 1), `limit` (default 20, max 100)
- Response: 200
  - `transactions` array, `pagination` { `page`, `limit`, `total` }

### POST /api/wallet/withdraw
- Role: Authenticated User (driver)
- Content-Type: `application/json`
- Body:
  - `amount` (number, required, > 0)
- Behavior: rejects (400) if `amount` exceeds `availableBalance` (raw balance minus active holds). On success, immediately deducts the amount and creates a `pending` withdrawal ledger entry.
- Response: 201
  - `message`, `balance` (new raw balance after reservation), `transaction`

---

## Wallet Top-Up

Self-serve JazzCash top-up a driver uses to fund their wallet, so they have enough `availableBalance` to keep responding `interested` to rides. Built against JazzCash's official 2026 REST guides (MWallet REST API v2.0, Card Page Redirection v1.1, IPN, Status Inquiry v2.0, MWallet/Card Refund APIs), and supports **two** distinct JazzCash products, chosen per-request via `method`:

- **`mwallet`** — MWallet REST API v2.0 (with CNIC). A direct, synchronous, server-to-server debit of the driver's own JazzCash mobile account. No redirect, no checkout page: the driver's `mobileNumber` + CNIC last-6-digits (`pp_CNIC`) authorize the debit, and JazzCash's response (`pp_ResponseCode "000"`) tells us immediately whether it succeeded.
- **`card`** — Card Page Redirection v1.1 (`pp_TxnType "MPAY"`). The driver is redirected to JazzCash's hosted checkout page, which itself offers Mobile Account, Voucher, and Credit/Debit Card as payment options. JazzCash then posts the result both to our browser return URL (`pp_ReturnURL`) and, independently, to our REST IPN listener.

Both methods share the same `wallet_topups` row shape, status values, and reconciliation endpoints (`/status`, `/inquire`, IPN). `method` defaults to `card` when omitted.

**Important JazzCash response-code distinction** (source of an earlier bug in this integration — do not conflate these):
- `pp_ResponseCode "000"` — the *API call itself* succeeded. This is the success code for the synchronous MWallet debit response, the Status Inquiry API's own `pp_ResponseCode`, and both refund APIs.
- `pp_ResponseCode "121"` — the *payment* is confirmed complete. This is the success code used by the IPN payload, the Card Page Redirection browser callback, and Status Inquiry's `pp_PaymentResponseCode` (a different field from `pp_ResponseCode` on that same response).

Flow (`mwallet`):
1. Driver must have a CNIC on file (`PATCH /api/users/driver/cnic`) — JazzCash requires the **last 6 digits** of it as `pp_CNIC`; the backend slices this from the stored 13-digit CNIC. `initiate` returns 400 if missing.
2. Driver calls `POST /api/wallet/topup/jazzcash/initiate` with `{ amount, method: "mwallet", mobileNumber }` (`mobileNumber` in local format, e.g. `03001234567`; falls back to the driver's own account phone if omitted).
3. Backend calls JazzCash's MWallet REST API v2.0 directly and returns the result synchronously — no client-side redirect needed. The wallet is credited immediately on `pp_ResponseCode "000"`.
4. As a safety net for an inconclusive network response on our side, the client can still call `POST /api/wallet/topup/:topUpId/inquire` (Status Inquiry API) or wait for the IPN.

Flow (`card`):
1. Driver calls `POST /api/wallet/topup/jazzcash/initiate` with `{ amount, method: "card" }` (or omits `method`).
2. Backend returns a `checkoutUrl` and a `fields` object (all `pp_*` form parameters, including the signed `pp_SecureHash`).
3. Client auto-submits an HTML form (`POST` with all `fields`) to `checkoutUrl` — typically inside a WebView.
4. Driver completes payment on the JazzCash page. JazzCash POSTs the result to our server callback (`/api/wallet/topup/jazzcash/callback`), which the backend verifies and uses to credit the wallet, then redirects the browser to the configured frontend success/failure page with `topUpId`, `status`, `txnRefNo` query params. JazzCash also independently posts the same result to the REST IPN listener (`/api/wallet/topup/jazzcash/ipn`) — both paths funnel through the same idempotent update, so whichever arrives first wins and the other is a no-op.
5. Client can poll `GET /api/wallet/topup/:topUpId/status`, or call `POST /api/wallet/topup/:topUpId/inquire` to force a live JazzCash status check if the WebView was closed before the callback/IPN landed.

### POST /api/wallet/topup/jazzcash/initiate
- Role: Authenticated User (Driver)
- Content-Type: `application/json`
- Body:
  - `amount` (number, required, > 0)
  - `method` (string, optional) — `"mwallet" | "card"`, defaults to `"card"`
  - `mobileNumber` (string, optional, `mwallet` only) — local format `03XXXXXXXXX`; defaults to the driver's account phone number
- Behavior (`card`): reuses an existing non-expired `pending` top-up for the same amount instead of minting a new transaction reference, so re-opening the checkout screen doesn't risk a double charge. Behavior (`mwallet`): always synchronous, no reuse (the call either completes or fails immediately).
- Response: 201
  - `mwallet`: `{ topUp, jazzcash }` — `topUp.status` is already `completed`/`failed`, `jazzcash` is JazzCash's raw MWallet response
  - `card`: `{ message, topUpId, txnRefNo, checkoutUrl, fields }` (object of `pp_*` form fields to POST to `checkoutUrl`)
- Errors: 400 if the driver has no CNIC on file yet (`mwallet` only) — call `PATCH /api/users/driver/cnic` first. 400 if `mobileNumber` isn't a valid local-format JazzCash account number.

### POST /api/wallet/topup/jazzcash/callback
- Role: Public (called by JazzCash's browser redirect, not by app clients)
- Content-Type: `application/x-www-form-urlencoded`
- Action: verifies `pp_SecureHash`, checks `pp_ResponseCode === "121"` for success, verifies `pp_Amount`, updates the matching `wallet_topups` row by `pp_TxnRefNo`, credits the driver's wallet on first success, and issues an HTTP redirect (302) to the frontend success/failure URL.

### POST /api/wallet/topup/jazzcash/ipn
- Role: Public (called server-to-server by JazzCash — must be registered as the IPN URL in the JazzCash merchant portal, Integration > Credentials)
- Content-Type: `application/json`
- Action: same verification/update logic as the callback above (shared, idempotent — a webhook racing a browser callback for the same `pp_TxnRefNo` can't double-credit), but responds with JazzCash's expected REST ack instead of redirecting.
- Response: 200 — `{ pp_ResponseCode: "000", pp_ResponseMessage: "IPN received successfully", pp_SecureHash }` always, regardless of the underlying transaction's own outcome (that's carried in the request's `pp_ResponseCode`, not this ack).

### GET /api/wallet/topup/:topUpId/status
- Role: Authenticated User (must own the top-up)
- Response: 200
  - `topUp` { `id`, `userId`, `provider`, `method` (`mwallet | card`), `amount`, `currency`, `status` (`pending | completed | failed | expired`), `txnRefNo`, `jazzcashResponseCode`, `jazzcashResponseMessage`, `refundStatus` (`null | completed | failed`), `refundedAmount`, `refundedAt`, `paidAt`, `createdAt`, `updatedAt` }

### POST /api/wallet/topup/:topUpId/inquire
- Role: Authenticated User (must own the top-up)
- Action: if the top-up isn't already `completed`, calls JazzCash's Status Inquiry API v2.0 live and syncs the local status (crediting the wallet if `pp_ResponseCode === "000"` **and** `pp_PaymentResponseCode === "121"` — both must hold, per JazzCash's docs).
- Response: 200
  - `topUp` (same shape as status endpoint)

### POST /api/wallet/topup/:topUpId/refund
- Role: Admin
- Content-Type: `application/json`
- Body:
  - `amount` (number, optional) — defaults to the full original top-up amount
- Action: calls JazzCash's MWallet Refund API v1.1 or Card Refund API v2.0 (whichever matches the top-up's `method`), then debits the refunded amount back out of the driver's wallet on success. One refund per top-up — returns 400 if already refunded or if the top-up isn't `completed`.
- Response: 200
  - `topUp` (same shape as status endpoint, now with `refundStatus`/`refundedAmount`/`refundedAt` populated), `jazzcash` (JazzCash's raw refund response — note the Card Refund API returns unprefixed field names, e.g. `ResponseCode` not `pp_ResponseCode`)

---

## Admin

> Admin-only endpoints require: 1) authentication with JWT, 2) the requesting user must have `is_admin = true`.

### GET /api/admin/dashboard/stats
- Role: Admin
- Response: 200
  - `stats` { `totalUsers`, `totalActiveUsers`, `totalDrivers`, `totalRiders`, `totalAdmins`, `pendingDriverApprovals`, `totalRideRequests`, `openRideRequests`, `selectedRideRequests`, `completedRideRequests`, `cancelledRideRequests` }
  - `recentRideRequests` (last 10), `recentUsers` (last 10, summary fields only)

### GET /api/admin/users?role&status&search&page&limit
- Role: Admin
- Query params (all optional): `role` (`admin | driver | rider`), `status` (`active | inactive`), `search` (matches name/email/phone), `page` (default 1), `limit` (default 20, max 100)
- Response: 200
  - `users` array — each: `id`, `name`, `email`, `phone`, `is_active`, `is_admin`, `is_driver`, `wallet_balance`, `created_at`
  - `pagination` { `page`, `limit`, `total`, `totalPages` }

### PATCH /api/admin/users/:id/role
- Role: Admin
- Content-Type: `application/json`
- Body (all optional): `is_admin` (boolean), `is_driver` (boolean), `is_active` (boolean) — only the fields you send are changed.
- Action: this is also how an admin **activates/deactivates** a user (set `is_active`) and grants/revokes admin or driver access. Deactivating a user (`is_active: false`) does not delete anything — it's reversible by calling this again with `is_active: true`.
- **Self-protection:** an admin cannot deactivate their own account (`is_active: false`) or remove their own admin access (`is_admin: false`) through this endpoint — both return 400. This exists so an admin can never accidentally lock themselves out with no other admin necessarily around to undo it. Every other combination on your own account (e.g. toggling your own `is_driver`) is still allowed.
- Response: 200
  - `message`, `user` { `id`, `name`, `email`, `is_admin`, `is_driver`, `is_active` }
- Errors: 404 if the user doesn't exist; 400 for either self-protection case above.

### DELETE /api/admin/users/:id
- Role: Admin
- Action: permanently deletes the user row. **This is not reversible** — there's no soft-delete/undo. If you just want to suspend someone, use `PATCH .../role` with `is_active: false` instead.
- **Self-protection:** an admin cannot delete their own account — 400.
- Response: 200
  - `message`
- Errors: 404 if the user doesn't exist; 400 if deleting your own account.

### GET /api/admin/rides?status&search&page&limit
- Role: Admin
- Query params (all optional): `status` (`open | selected | completed | cancelled | all`), `search`, `page`, `limit`
- Response: 200
  - `rides` array, `summary` { `open`, `selected`, `completed`, `cancelled` }, `pagination` { `page`, `limit`, `total`, `totalPages` }

### GET /api/admin/driver-registrations?status={optional}
- Role: Admin
- Query params:
  - `status` (optional): filter by `pending` / `approved` / `rejected`
- Response: 200
  - `registrations`: array of registration objects

### GET /api/admin/driver-registrations/:id
- Role: Admin
- Response: 200
  - `registration` object

### POST /api/admin/driver-registrations/:id/approve
- Role: Admin
- Action: sets `driver_registrations.status = 'approved'` and sets the corresponding `users.is_driver = true`.
- Response: 200
  - `message`, updated `registration`

### POST /api/admin/driver-registrations/:id/reject
- Role: Admin
- Body (optional):
  - `reason` (string) — admin-provided rejection reason
- Action: sets `driver_registrations.status = 'rejected'`.
- Response: 200
  - `message`, updated `registration`, `reason` (if provided)

### GET /api/admin/wallet/withdrawals?status={optional}
- Role: Admin
- Query params:
  - `status` (optional): filter by `pending` / `completed` / `rejected`
- Response: 200
  - `withdrawals`: array of wallet ledger entries with `type = 'withdrawal'`

### POST /api/admin/wallet/withdrawals/:id/complete
- Role: Admin
- Action: marks a `pending` withdrawal as `completed`, confirming the admin has actually paid the driver out by some external means (bank transfer, JazzCash mobile transfer, etc.). Does not move any money itself.
- Response: 200
  - `message`, `transaction` (updated)

### POST /api/admin/wallet/withdrawals/:id/reject
- Role: Admin
- Body (optional):
  - `reason` (string)
- Action: marks a `pending` withdrawal as `rejected` and refunds the reserved amount back into the driver's wallet balance.
- Response: 200
  - `message`, `transaction` (updated)

### POST /api/admin/wallet/drivers/:id/credit
- Role: Admin
- Content-Type: `application/json`
- Body:
  - `amount` (number, required, > 0, max 2 decimal places)
  - `description` (string, optional) — defaults to `"Manual balance credit by admin (testing)"`
- Action: manually credits a driver's wallet — mainly for testing (e.g. giving a test driver balance without going through JazzCash top-up). Recorded in `wallet_transactions` with `type = 'admin_manual_credit'`, through the same atomic ledger path top-ups use.
- Response: 200
  - `message`, `driverId`, `balance` (new wallet balance)
- Errors: 404 if the target user doesn't exist; 400 if the target user isn't a driver (`is_driver = false`).

---

## Database Fields (high level)
- `users` table includes: `id (uuid)`, `name`, `email`, `phone`, `password`, `is_email_verified`, `profile_picture_url`, `profile_picture_public_id`, `is_active`, `is_admin`, `is_driver`, `gender` (`male | female`, nullable — `null` only for accounts created before this field existed), `wallet_balance` (numeric), `jazzcash_account_number`, `jazzcash_account_title`, `created_at`, `updated_at`.
- `driver_registrations` table includes: `id (uuid)`, `user_id (uuid)`, `firstName` (nullable), `lastName` (nullable), `dateOfBirth` (nullable), `personalPictureUrl`, `personalPicturePublicId`, `licenseNumber`, `expirationDate`, `frontSideOfLicenseUrl`, `frontSideOfLicensePublicId`, `selfieWithDriverLicenseUrl` (nullable), `selfieWithDriverLicensePublicId` (nullable), `idNumber`, `cnicFrontUrl`, `cnicFrontPublicId`, `cnicBackUrl`, `cnicBackPublicId`, `photoOfVehicleUrl` (nullable), `photoOfVehiclePublicId` (nullable), `vehicleRegistrationCertificateUrl` (nullable), `vehicleRegistrationCertificatePublicId` (nullable), `backsideOfVehicleInformationUrl` (nullable), `backsideOfVehicleInformationPublicId` (nullable), `policeCertificateUrl` (nullable), `policeCertificatePublicId` (nullable), `vehicleBrand` (nullable), `vehicleType`, `vehicleModel`, `vehicleColor` (nullable), `numberPlate`, `productionYear`, `status`, `createdAt`, `updatedAt`.
- `driver_registrations.operatingArea` is stored in normalized format for consistent matching.
- `ride_requests` table includes: `id (uuid)`, `rider_id (uuid)`, `pickupLocation`, `dropoffLocation`, `vehicleType`, `serviceArea`, `offeredPrice`, `estimatedDistanceKm`, `companyCommission`, `driverPayout`, optional coordinates (`pickupLatitude`, `pickupLongitude`, `dropoffLatitude`, `dropoffLongitude`), `notes`, `status` (`open | driver_selected | completed | cancelled`), `selected_driver_id`, `selectedAt`, `payment_method` (`online | cash`, chosen by the rider at creation, fixed for the life of the ride), `completed_at`, `cancelled_at`, `createdAt`, `updatedAt`.
- `driver_ride_alerts` table includes: `id (uuid)`, `ride_request_id (uuid)`, `driver_id (uuid)`, `vehicleType`, `message`, `inAppStatus`, `systemStatus`, `emailStatus`, `emailError`, `isRead`, `createdAt`, `updatedAt`.
- `driver_ride_responses` table includes: `id (uuid)`, `ride_request_id (uuid)`, `driver_id (uuid)`, `decision` (`interested | declined`), `counterOfferPrice`, `message`, `createdAt`, `updatedAt`. Unique on `(ride_request_id, driver_id)`.
- `wallet_transactions` table includes: `id (uuid)`, `user_id (uuid)`, `type` (`wallet_top_up | commission_debit | withdrawal | withdrawal_rejected_refund` — plus the now-unused legacy `ride_earning`), `amount` (signed), `balance_after`, `ride_request_id (uuid, nullable)`, `description`, `status` (`completed | pending | rejected`), `rejection_reason`, `createdAt`, `updatedAt`. A unique constraint on `(ride_request_id, type)` guarantees at most one `commission_debit` row per ride, which is what prevents double-debiting from a retried/duplicate `complete` call.
- `wallet_holds` table includes: `id (uuid)`, `driver_id (uuid)`, `ride_request_id (uuid)`, `amount`, `status` (`active | released | captured`), `createdAt`, `updatedAt`. Unique on `(ride_request_id, driver_id)` — one hold per driver per ride.
- `wallet_topups` table includes: `id (uuid)`, `user_id (uuid)`, `provider` (default `jazzcash`), `method` (`mwallet | card`, default `card`), `mobile_number` (nullable, `mwallet` only), `amount`, `currency` (default `PKR`), `status` (`pending | completed | failed | expired`), `txn_ref_no` (unique), `bill_reference`, `jazzcash_response_code`, `jazzcash_response_message`, `jazzcash_retrieval_reference_no`, `jazzcash_auth_code`, `raw_callback_payload` (jsonb), `paid_at`, `expires_at`, `refund_status` (nullable, `completed | failed`), `refunded_amount`, `jazzcash_refund_response_code`, `jazzcash_refund_response_message`, `refunded_at`, `createdAt`, `updatedAt` — same shape the old `payments` table used for ride payments.
- `payments` table: still physically exists in the database (holds historical ride-payment records from before this change) but is no longer read or written by any current code path — safe to ignore going forward.
- **Driver live location is not a database table.** It's held in an in-memory map on the server process (`driverId → { lat, lng, updatedAt }`), populated by the `driver:location:update` socket event and expiring after 2 minutes of inactivity (see Ride Matching Rules above). This means it does **not** survive a server restart/redeploy, and does **not** work correctly if the backend is ever scaled to multiple instances without adding a shared store (e.g. Redis) — worth knowing before that becomes a deployment change.

---

## Security & Notes
- All authenticated endpoints require `Authorization: Bearer <jwt>`.
- File uploads must be image types (jpeg/png/webp/gif) and are validated server-side. Consider adding explicit size limits in the client and server as needed.
- Current alert channels are in-app/system/email. SMS can replace email in a future iteration without changing ride request creation contract.
- For production, set `synchronize = false` for TypeORM migrations and use migrations to evolve schema safely.
- Consider adding audit logs and email notifications when admin approves/rejects registrations.

---

## Gender & Proximity Ride Matching: What Changed, and What to Verify Before Shipping

This is a new, breaking change to signup and to how ride requests are delivered — summarized here so the mobile integration doesn't miss it.

**Breaking:**
- `POST /api/auth/signup` now **requires** `gender` (`male | female`). Update the signup screen before shipping this backend version, or every signup call will start failing with 400.
- `ride_request:created` is no longer broadcast to the `area:{normalizedArea}:{vehicleFamily}` socket room. It's now emitted only to the matched driver's own `driver:{driverId}` room. **If the driver app doesn't already join `driver:{driverId}` on connect, it will stop receiving real-time ride request pushes entirely** — it'll fall back to whatever polling of `GET /api/ride-requests/driver/alerts` the app already does, but that's not real-time. See Ride Matching Rules (under Ride Requests above) for the exact room name and the `join` event to send.

**Added:**
- `gender` field on `users`, returned by `POST /api/auth/login`, `GET /api/auth/me`, and `GET /api/users/profile`. Set once at signup; not currently editable via `PATCH /api/users/profile`.
- New driver-app socket event `driver:location:update` (`{ lat, lng }`) — the driver app should emit this every ~10-30s while online, so ride requests can be matched by live proximity (5 km radius) instead of static operating-area text. Full details under Ride Matching Rules above.
- Ride dispatch now filters by rider/driver gender match (when the rider has a gender on file) in addition to proximity.

**Rollout behavior (not a hard cutover):**
- Existing rider accounts with no `gender` set keep getting unrestricted (any-gender) matching — only riders with `gender` set trigger the filter.
- Drivers who haven't started sending `driver:location:update` yet (old app builds) keep getting matched by the old operating-area text logic instead of GPS radius. Once every driver app sends live location, this fallback stops mattering.
- Net effect: you can ship the backend first and roll out the updated driver/rider app afterward without an outage — matching just stays coarser (area-text, any-gender) for whichever side hasn't updated yet.

**Not yet verified in this change (please confirm before relying on it in production):**
- This was written and confirmed to compile (`npm run build`) cleanly, but has **not** been exercised against a real running database with live socket clients — there's no driver app in this repo to test against. Before shipping, verify end-to-end with a real Flutter build: two test driver accounts (one male, one female) both online near a pickup point, a rider account with a gender set, confirm only the matching-gender driver receives `ride_request:created`; then move one driver's reported location outside the 5 km radius and confirm they stop being matched.
- Run `npm run migration:run` against whichever database you're testing/deploying against — this change ships a new migration (`AddGenderToUsers`) adding `users.gender`. Production runs with `synchronize: false`, so this column doesn't exist there until the migration runs.
- Confirm the driver app actually joins `driver:{driverId}` on every connect/reconnect (not just after being selected for a ride) — this is the one behavior change most likely to silently break real-time dispatch if missed, since the app would otherwise still work fine for everything except receiving new ride pushes.

---

## Live Location Tracking: What Changed, and What to Verify Before Shipping

Builds directly on the gender/proximity matching change above — same `driver:location:update` event, now also used to feed the rider's live tracking screen. Summarized here so the mobile integration doesn't miss it.

**Added (nothing removed/renamed here, all additive):**
- New room `tracking:ride:{rideRequestId}`, new events `driver:location`, `driver:location:snapshot`, `tracking:room_ready`. Full details under **Live Location Tracking** (in the Ride Requests section above).
- `ride_request:driver_selected` / `ride_request:driver_assigned` payloads now also include `pickupLatitude`, `pickupLongitude`, `dropoffLatitude`, `dropoffLongitude` (previously just `rideRequestId`, `driverId`, `selectedAt`).
- `ride_request:created` payload now also includes `pickupLatitude`, `pickupLongitude`, `dropoffLatitude`, `dropoffLongitude`, `driverLatitude`, `driverLongitude`, `distanceToPickupKm`, `driverLocationUpdatedAt` (see Ride Matching Rules above).
- `GET /api/ride-requests/driver/alerts` now includes `distanceToPickupKm` on each alert's embedded `ride` object.

**What the rider app needs to add:**
1. After a driver is selected, send `join` with `{ room: 'tracking:ride:<rideRequestId>' }` (do this even though the backend also tries to auto-join you — your socket may not have been connected yet at the exact moment of selection, or may reconnect later).
2. Listen for `driver:location` and `driver:location:snapshot`; show "Driver location unavailable" until one arrives with actual coordinates (i.e. not `{ available: false }`).
3. Combine the incoming `lat`/`lng` with the ride's own pickup/dropoff coordinates and current `status` to decide (client-side) whether to show "distance to pickup" or "distance to destination" — the backend does not distinguish these itself.

**What the driver app needs to add:** nothing beyond what the gender/proximity change already asked for — the existing `driver:location:update` ping now also drives this rider-facing feature for free.

**Rollout behavior:** fully backward compatible. A driver who isn't sending `driver:location:update` yet simply never triggers a `driver:location` broadcast for their rides (no errors, nothing crashes) — the rider's tracking screen just stays on "Driver location unavailable" for that ride until the driver's app updates.

**Not yet verified in this change (please confirm before relying on it in production):**
- Written and confirmed to compile (`npm run build`) cleanly, but **not** exercised against a real running database with live socket clients on either side (no driver or rider mobile app in this repo to test against). Before shipping, verify end-to-end: select a driver on a test ride, confirm both the automatic room-join snapshot and a manual `join` both deliver a snapshot correctly (including the `available:false` case before any GPS has arrived), then send a few `driver:location:update` pings and confirm `driver:location` arrives in the tracking room, then complete or cancel the ride and confirm no further `driver:location` events arrive even though the driver keeps sending updates.
- Confirm a driver can't join another driver's — or another rider's — tracking room: the `join` handler now looks the ride up in the database and checks `riderId`/`selectedDriverId` server-side, but this hasn't been exercised against a live malicious/mistaken client in this pass.
- No database migration is needed for this change — it's socket/room logic and in-memory location data only, nothing new is persisted.

---

## Simplified Driver Registration: What Changed, and What to Verify Before Shipping

Product decision: registration was collecting too much up front. Several fields/files are now optional, and a police character certificate is deliberately **not** part of registration at all — it's a separate, no-deadline upload for whenever the driver has it ready.

**Changed (non-breaking — old clients that still send everything continue to work unchanged):**
- `POST /api/driver-registration` no longer requires: `firstName`, `lastName`, `dateOfBirth`, `vehicleBrand`, `vehicleColor` (text fields), or `selfieWithDriverLicense`, `photoOfVehicle`, `vehicleRegistrationCertificate`, `backsideOfVehicleInformation` (files). Still required: `vehicleType`, `operatingArea`, `licenseNumber`, `expirationDate`, `idNumber`, `vehicleModel`, `numberPlate`, `productionYear`, and the `personalPicture`/`frontSideOfLicense`/`cnicFront`/`cnicBack` images.
- `firstName`/`lastName` were dropped from the *requirement* specifically because they duplicate the account's own `name` (collected at signup) — no need to ask twice. If you still want to let a driver register under a different name than their account, you can still send them; they're just not mandatory anymore.

**Added:**
- New endpoint `POST /api/driver-registration/police-certificate` (see above) — upload it any time after registration exists, no time limit.
- `driverRegistration` responses (`create`, `GET /me`, admin endpoints) now include `policeCertificateUrl` (`null` until uploaded).
- Admin driver-registration endpoints now embed a linked `user: { id, name, email, phone }` object, since the admin dashboard needs a name to show even when `firstName`/`lastName` are `null`.

**What the Flutter app should do:**
- If you're building/updating the driver registration screen, you can drop the now-optional fields and files from the flow entirely for a simpler onboarding — that's the whole point of this change. The web version of this form (`RegisterYourVehicle.tsx`) was simplified the same way, as a reference for which fields stayed and which didn't.
- Add a "police certificate" upload somewhere in the driver's ongoing profile/dashboard (post-registration, post-login) that calls the new endpoint — there's no rush, this can be built as a lower-priority follow-up screen since the backend places no deadline on it.

**Not yet verified in this change (please confirm before relying on it in production):**
- Written and confirmed to compile (`npm run build`) cleanly, but not exercised against a real running database — verify a registration submitted with only the required fields succeeds, and that admin's driver list/detail views render sensibly with `firstName`/`lastName`/`vehicleBrand`/`vehicleColor` all `null` and no optional documents uploaded.
- Run `npm run migration:run` — this ships a new migration (`SimplifyDriverRegistration`) that relaxes several `NOT NULL` constraints on `driver_registrations` and adds `policeCertificateUrl`/`policeCertificatePublicId`. Existing rows are untouched (they already have all these fields filled in from before); only new registrations can now have nulls there.

---

## Payments & Wallet: What Changed, and What to Verify Before Shipping

This is a significant behavior change from the previous API version — summarized here so the mobile integration doesn't miss anything:

**Removed:**
- `POST /api/payments/jazzcash/initiate`, `POST /api/payments/jazzcash/callback`, `GET /api/payments/jazzcash/:paymentId/status`, `POST /api/payments/jazzcash/:paymentId/inquire`, `GET /api/payments/ride/:rideRequestId` — all gone. If the app calls any of these for an `online`-payment ride, that code needs to be replaced with the `driverPaymentDetails` flow described above.
- The old "credit `driverPayout` to the driver's wallet once online payment is confirmed" behavior — gone. A driver's wallet is no longer credited for ride earnings at all now; it only moves via top-ups, commission debits, and withdrawals.

**Added / changed:**
- `paymentMethod: "cash"` and `"online"` now behave almost identically from the backend's point of view — both are settled entirely outside the platform, and both debit `companyCommission` from the driver's wallet at `POST /.../complete`. The only difference is what the app shows the rider: nothing extra for `cash`, and `driverPaymentDetails` for `online`.
- Driver wallets now support **holds** (`wallet_holds`) — reserved against a ride from the moment a driver responds `interested` until it's released or captured. See the Wallet section above; this is the part of the integration most likely to need careful UI handling (the 400 error on `POST /driver/respond` when balance is insufficient, and using `availableBalance` rather than raw `balance` anywhere the app lets a driver decide whether to accept a ride).
- A new self-serve top-up flow (`/api/wallet/topup/jazzcash/*`) lets drivers fund their wallet themselves.
- A driver now sets their own JazzCash payout details (`PATCH /api/users/driver/payment-method`) rather than the platform holding a single merchant account that pays everyone out.
- Ride requests can now be cancelled (`POST /api/ride-requests/:rideRequestId/cancel`) — this didn't exist at all before.

**Not yet verified in this change (please confirm before relying on them in production):**
- This implementation was written and confirmed to compile (`npm run build`) cleanly, but has **not** been exercised against a real running database with live HTTP calls in this pass — unlike a prior version of this document which claimed full live verification for the old payments flow (no longer applicable, since that flow is removed). Before shipping, run through the full loop at least once against a real dev/staging DB: approve a driver → set their JazzCash payment method → top up their wallet → have them respond `interested` to a ride (including the insufficient-balance 400 case) → get selected → complete the ride (commission debited for both `cash` and `online`) → cancel a different ride and confirm the hold releases → attempt a withdrawal that would exceed available (held-aware) balance and confirm it's rejected.
- Run `npm run migration:run` against whichever database you're testing/deploying against — this change ships a new migration (`AddDriverPayoutWalletHoldsAndTopups`) adding `users.jazzcash_account_number`/`jazzcash_account_title`, `ride_requests.cancelled_at`, and the `wallet_holds`/`wallet_topups` tables. Production runs with `synchronize: false`, so none of this exists there until the migration runs.
- `JAZZCASH_ENV`, `JAZZCASH_RETURN_URL`, and the merchant credentials are now only exercised by the wallet top-up flow (ride payments no longer use JazzCash at all) — confirm these are still set correctly for whichever environment you're testing.
- The mobile app must be updated in lockstep: remove any call to the old `/api/payments/jazzcash/*` endpoints, add a screen to display `driverPaymentDetails` for online rides, add the driver-side "set payment method" and "top up wallet" flows, and surface the new insufficient-balance error from `driver/respond` and the new `cancel` action.

**A subtle environment gotcha worth knowing if you touch payment/wallet expiry logic further:** this server's host clock is UTC+5. Postgres `timestamp` (without timezone) columns populated by `now()`, when read back through the `pg` driver and compared against a freshly computed `Date.now()`/`new Date()` in the same request, come back shifted by the host's UTC offset — a well-known `node-postgres` default-parsing quirk. Both the old `payments.expires_at` and the new `wallet_topups.expires_at` avoid this by computing and storing the expiry explicitly in application code (same pattern as `otp_expires_at`) rather than deriving it from `createdAt` at read time. If you add new expiry logic elsewhere, follow the same pattern — or migrate the column to `timestamptz`, which round-trips correctly regardless of host timezone.

---

## Driver Ride History + `ride_request:created` Dropoff Coordinates: What Changed

Two small additive fixes, bundled here since both were found while investigating a driver-app report of the destination pin showing the wrong place.

**Added:**
- New endpoint `GET /api/ride-requests/driver/history` — a driver's own ride history (every ride they were actually `selectedDriverId` for), distinct from `driver/alerts` which lists offers regardless of outcome. See endpoint doc above.
- `ride_request:created` payload now also includes `dropoffLatitude`/`dropoffLongitude` (previously only `pickupLatitude`/`pickupLongitude` were sent on this event — a driver client rendering the destination from the initial ride alert, before a fuller payload arrived later via `ride_request:driver_selected`, had no dropoff coordinates to work with).

**Not yet verified in this change (please confirm before relying on them in production):**
- Written and confirmed to compile (`npm run build` / `tsc --noEmit`) cleanly, but not exercised against a real running database or live socket clients in this pass.
- No database migration needed — both changes reuse existing `ride_requests` columns.
- The driver (Flutter) app should be updated to read `dropoffLatitude`/`dropoffLongitude` off the `ride_request:created` event directly, rather than relying solely on a later event or a hardcoded fallback, and to add a "ride history" screen backed by the new endpoint.

---

## Driver CNIC for JazzCash Top-Up: What Changed

JazzCash's Mobile Wallet checkout flow requires the payer's CNIC (`pp_CNIC`) on every transaction — flagged by JazzCash for this integration specifically for wallet top-ups.

**Added:**
- New endpoint `PATCH /api/users/driver/cnic` — a driver sets their CNIC (13 digits, no dashes) once. Returned as `cnic` on `user` in the profile/payment-method responses. See endpoint doc above (Users section).
- `POST /api/wallet/topup/jazzcash/initiate` now requires the driver to have a CNIC on file — returns 400 (`"CNIC required before topping up..."`) if not, and includes `pp_CNIC` in the returned `fields` once it is.
- New nullable `users.cnic` column (migration `AddCnicToUsers`).

**Design decisions made without further confirmation (flag if wrong):**
- CNIC is collected **once on the driver's profile** and reused on every top-up, rather than re-asked on each `initiate` call.
- Stored as the **full 13-digit CNIC** (no dashes) on the user's profile — this part is fine. ~~Sent to JazzCash as-is~~ **Update, see the "Rewritten Against JazzCash's Official 2026 REST Guides" entry near the end of this document: this was wrong.** `pp_CNIC` must be the last 6 digits only; the service now slices it at send time. The stored profile field itself did not need to change.
- This is separate from `jazzcash_account_number`/`jazzcash_account_title` (`PATCH /api/users/driver/payment-method`) — that's the driver's own payout account shown to riders; CNIC is for the driver's own top-up checkout, a different money direction.

**Not yet verified in this change (please confirm before relying on it in production):**
- Written and confirmed to compile (`tsc --noEmit`) cleanly, but not exercised against a real JazzCash sandbox transaction — confirm a live top-up with `pp_CNIC` included actually succeeds (or is even accepted) against the sandbox before shipping to production.
- Run `npm run migration:run` — this ships a new migration (`AddCnicToUsers`) adding `users.cnic`. Production runs with `synchronize: false`, so this column doesn't exist there until the migration runs.
- Existing drivers with no CNIC on file will be blocked from topping up until they set one — the driver app needs a prompt/flow for this (e.g. surfaced from the 400 error, or proactively on the wallet screen).

---

## Rider History Missing Driver Info on Cash Rides: Bug Fix

Found while investigating a report that ride history "isn't showing properly" for a rider after booking/completing a ride.

**Root cause:** `GET /api/ride-requests/me` only ever looked up the assigned driver's user record when `paymentMethod === 'online'` (it needed that record for `driverPaymentDetails`). For `cash` rides — the majority of real traffic in this database — the driver was never fetched at all, so once a ride reached `driver_selected` or `completed`, the rider's own history showed only a raw `selectedDriverId` UUID with no name or phone. Nothing for a client to render. Verified directly against the database: a real completed `cash` ride (driver "Ahmad", `+923087154021`) previously returned with no driver info in this response at all.

**Fixed:**
- `GET /api/ride-requests/me` now looks up the selected driver for **every** ride, regardless of `paymentMethod`, and each entry carries `driver: { id, name, phone }` once one is selected — see endpoint doc above. `driverPaymentDetails` (JazzCash payout info) is unchanged, still `online`-only.

**Verified:** confirmed live against the two real accounts this was reported against — a real completed `cash` ride now correctly returns `driver: { name: "Ahmad", phone: "+923087154021" }` on `GET /api/ride-requests/me`, and the driver's own `GET /api/ride-requests/driver/history` correctly returns `rider` on each entry (or `null` on the two rides whose original rider account has since been deleted — expected, not a bug). No migration needed — reuses the existing `users` table, just fetched under a wider condition.

**What the rider (Flutter) app should do:** read `driver.name`/`driver.phone` off each ride history entry once present, rather than only `driverPaymentDetails`, to show who the driver was/is for **all** payment methods.

---

## Forgot Password: Now OTP-Based Instead of Email Link

**Changed:** `POST /api/auth/forgot-password` used to email a clickable reset link containing a long-lived token, directly usable on `reset-password`. That's awkward for a mobile app (requires deep-linking). It now emails a 6-digit OTP instead, and a new endpoint confirms it before issuing the token `reset-password` actually consumes — see the three endpoint docs above (Auth section): `forgot-password` → `forgot-password/verify-otp` → `reset-password`.

**Design:** the OTP itself is never accepted by `reset-password`. Confirming it via `forgot-password/verify-otp` swaps it for a separate opaque `resetToken` (15-minute expiry) and immediately invalidates the OTP, so it can't be reused even to mint another token. This mirrors the existing signup OTP pattern (`POST /api/auth/verify-otp`) for a consistent in-app UX, while keeping `reset-password`'s contract unchanged — no other endpoint or client code needs to change.

**Verified live**, end-to-end, against a throwaway test account (created and deleted for this test — no real account was touched): signup → verify signup OTP → `forgot-password` → confirmed the OTP landed in `reset_password_token` → `forgot-password/verify-otp` → confirmed the same OTP is rejected if replayed → `reset-password` with the returned `resetToken` → confirmed login fails with the old password and succeeds with the new one. `tsc --noEmit` also clean.

**Not yet verified:**
- Real email delivery (SMTP) was not exercised in this test — the OTP was read directly from the database rather than from an actual inbox. Confirm `sendPasswordResetOtpEmail` actually delivers before shipping.
- No migration needed — reuses the existing `users.reset_password_token`/`reset_password_expires_at` columns (previously held a hex token; now holds first an OTP, then a reset token).
- The driver/rider (Flutter) app needs a 3-screen update: enter email → enter OTP (screen calls `forgot-password/verify-otp`, stores the returned `resetToken`) → enter new password (screen calls `reset-password` with that stored token). There's no more link/deep-link to handle.

---

## JazzCash Wallet Top-Up: Rewritten Against JazzCash's Official 2026 REST Guides

The prior JazzCash top-up implementation was a single, self-consistent-looking flow, but it didn't actually match JazzCash's real API contracts once checked against JazzCash's own MWallet REST API v2.0, Card Page Redirection v1.1, IPN, Status Inquiry v2.0, and MWallet/Card Refund API guides. Rewritten to match those guides field-for-field.

**Bugs fixed:**
- **`pp_CNIC` was sent as the full 13-digit CNIC.** MWallet REST API v2.0's own sample payload is explicit — `"pp_CNIC": "{{Last 6-digits}}"`. This resolves the "flag if wrong" note left in the CNIC changelog entry above: it was wrong. The service now sends `user.cnic.slice(-6)`; the stored profile field is unchanged (still the full CNIC), only the value sent to JazzCash changed.
- **The "hosted checkout" endpoint used for top-ups was actually the Card Page Redirection v1.1 endpoint, posted with MWallet-style fields (`pp_CNIC`, no `pp_TxnType`/`pp_Version`).** JazzCash's REST API v2.0 (with CNIC) isn't a redirect/checkout product at all — it's a direct, synchronous, server-to-server mobile-account debit with no `pp_TxnType`/`pp_Version`/`pp_ReturnURL` fields and a completely different endpoint (`/api/v2/rest/payments/m-wallet`, JSON body, not a browser POST). The old code was posting `pp_CNIC` to what was actually the Card Page Redirection endpoint, which doesn't accept or expect that field. These are now correctly split into two methods (`mwallet` and `card` — see Wallet Top-Up above), each hitting its own documented endpoint with its own exact field set.
- **A single response-code check (`=== "000"`) was used everywhere**, including for the Card Page Redirection browser callback. JazzCash's own IPN guide is explicit that `121` — not `000` — is the payment-success code on that payload (`000` there just means "IPN acknowledged", a different signal). The old callback handler would only ever treat a top-up as successful if JazzCash happened to send `000` on that channel, which it doesn't for a completed card payment — this looks like it would have silently failed to credit **every successful card top-up**. Fixed by introducing `isApiSuccessCode` (`000`) vs `isPaymentSuccessCode` (`121`) and using the right one per API (see the distinction called out in the Wallet Top-Up section above).
- Status Inquiry was hitting a legacy-looking `/ApplicationAPI/API/PaymentInquiry/Inquire` URL not present in any of JazzCash's current guides; switched to the documented `/api/v2/rest/payments/status/inquiry`, and the sync logic now correctly requires both `pp_ResponseCode === "000"` (inquiry call ok) and `pp_PaymentResponseCode === "121"` (payment actually complete) rather than a single check.
- The Card Page Redirection checkout POST URL was pointed at an old `sandbox.jazzcash.com.pk/CustomerPortal/...` host; switched to the documented `onlinepayments.jazzcash.com.pk/payment-orchestrator/CustomerPortal/...` host, and the field set now matches the guide's sample exactly (`pp_Version: "1.1"`, `pp_TxnType: "MPAY"`, full `ppmpf_1..5`/`pp_BankID`/`pp_ProductID`/`pp_SubMerchantID` empty-string fields — previously some of these were missing or repurposed).
- `pp_TxnExpiryDateTime` was driven by a configurable `JAZZCASH_TXN_EXPIRY_MINUTES` env var (defaulting to 60). Every JazzCash guide states this must be exactly "transaction date + 1 day" — not merchant-configurable — so the service now always computes `+24h` directly; `JAZZCASH_TXN_EXPIRY_MINUTES` still exists but now only governs an unrelated internal concern (how long we keep reusing a locally-pending `card` top-up before minting a fresh `pp_TxnRefNo` on a retried `initiate`).
- `JAZZCASH_RETURN_URL` and `JAZZCASH_IPN_URL` in production `.env` were `http://api.fastridelive.com/...`, but that host actually force-redirects `http` → `https` (301). A 301 on a POST is either dropped or silently turned into a GET by most HTTP clients — JazzCash's callback/IPN POST would very likely never have reached the app at all. Both switched to `https://` directly against the live server's `.env`.

**Added:**
- A dedicated REST IPN listener, `POST /api/wallet/topup/jazzcash/ipn` — previously not implemented at all, despite JazzCash's MWallet guide listing it as "Mandatory". Must be registered as the IPN URL in the JazzCash merchant portal (Integration > Credentials) for it to actually receive anything; see `JAZZCASH_IPN_URL` in `.env.example`.
- `method: "mwallet"` on `POST /api/wallet/topup/jazzcash/initiate` — direct MWallet debit, synchronous, no redirect (see Wallet Top-Up above). `method: "card"` is the (default) Page Redirection flow the old code was attempting.
- `POST /api/wallet/topup/:topUpId/refund` (Admin) — MWallet Refund API v1.1 / Card Refund API v2.0, previously not implemented at all. New `wallet_topups` columns: `method`, `mobile_number`, `refund_status`, `refunded_amount`, `jazzcash_refund_response_code`, `jazzcash_refund_response_message`, `refunded_at` (migration `AddJazzCashMethodAndRefundFieldsToWalletTopups`).
- `JAZZCASH_MERCHANT_MPIN` env var — required by both refund APIs, wasn't previously collected anywhere. **Must be set in `.env` before `/refund` will work** — left blank in this change since the actual MPIN isn't something to guess at.

**Not yet verified in this change (please confirm before relying on it in production):**
- `tsc --noEmit` is clean, but none of this was exercised against JazzCash's real sandbox — the MWallet endpoint in particular depends on the sandbox mobile account actually being provisioned to approve/complete a debit synchronously; confirm the full `mwallet` flow (initiate → immediate `completed`/`failed`) and the `card` flow (initiate → redirect → callback **and** IPN both landing → single credit) against real sandbox transactions before shipping.
- `JAZZCASH_MERCHANT_MPIN` is blank in `.env` — refunds will fail (or be rejected by JazzCash) until it's filled in from the merchant portal.
- The Card Page Redirection POST URL (`.../payment-orchestrator/CustomerPortal/transactionmanagement/merchantform`) was reconciled from an inconsistency between JazzCash's own documented endpoint tables (hyphenated `payment-orchestrator`) and its bundled PHP sample code (unhyphenated `paymentorchestrator`) — went with the hyphenated form since every other endpoint in every other guide uses it, but this is a guess between two things JazzCash's own materials disagree on. Confirm the checkout page actually loads against sandbox; if it 404s, try `JAZZCASH_CARD_CHECKOUT_URL` with the unhyphenated path.
- ~~Run `npm run migration:run`~~ **Done** — ran against production; it also caught up a previously-pending `AddRefreshTokenToUsers` migration in the same pass. `wallet_topups` now has all the new columns.
- **Since `pp_ReturnURL` changed value** (`http` → `https`, see above), the Return URL registered with JazzCash in the sandbox merchant portal (Integration > Credentials) must be updated to match exactly — JazzCash's own Page Redirection guide states this URL "should always be the same in every request once shared... difference of URL will fail the validation." Not yet confirmed done on JazzCash's side.
- The driver (Flutter) app isn't touched by this change and doesn't yet expose a `method`/`mobileNumber` choice on its top-up screen (if it has one) — needs updating to let a driver pick `mwallet` vs `card` and, for `mwallet`, confirm/enter their JazzCash mobile number.

---

If you'd like, I can:
- Add API examples (curl) for each endpoint,
- Add OpenAPI (Swagger) decorators and generate an interactive docs page,
- Add notification emails on approval/rejection.
