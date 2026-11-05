import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter!: nodemailer.Transporter;
  private readonly logger = new Logger(EmailService.name);

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const auth = {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    };

    // SMTP_HOST takes precedence so mailboxes hosted elsewhere (e.g. Hostinger) work.
    // Without it, SMTP_SERVICE (default gmail) is used, which only accepts Gmail/Workspace accounts.
    if (process.env.SMTP_HOST) {
      const port = Number(process.env.SMTP_PORT) || 465;
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
        auth,
      });
      return;
    }

    this.transporter = nodemailer.createTransport({
      service: process.env.SMTP_SERVICE || 'gmail',
      auth,
    });
  }

  // A bare address makes inboxes show the part before "@" as the sender (e.g. "info").
  private get fromAddress(): string {
    const name = process.env.SMTP_FROM_NAME || 'FastRide';
    return `"${name}" <${process.env.SMTP_USER}>`;
  }

  async sendOtpEmail(email: string, otp: string, userName: string): Promise<void> {
    try {
      const htmlContent = `
        <html>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
              <h2 style="color: #007bff;">Welcome to Indrive! 🚗</h2>
              <p>Hi <strong>${userName}</strong>,</p>
              <p>Thank you for registering with Indrive. To complete your registration and verify your email, please use the OTP code below:</p>
              
              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: center;">
                <h1 style="letter-spacing: 5px; color: #007bff; margin: 0;">${otp}</h1>
              </div>

              <p><strong>Important:</strong> This OTP will expire in 10 minutes.</p>
              <p style="color: #666; font-size: 14px;">If you did not request this code, please ignore this email.</p>
              
              <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
              
              <p style="color: #999; font-size: 12px; text-align: center;">
                © 2026 Indrive. All rights reserved.
              </p>
            </div>
          </body>
        </html>
      `;

      const mailOptions = {
        from: this.fromAddress,
        to: email,
        subject: 'Indrive Email Verification - OTP Code',
        html: htmlContent,
      };

      await this.transporter.sendMail(mailOptions);
      this.logger.log(`OTP email sent successfully to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send OTP email to ${email}:`, (error as Error).message);
      throw new Error(`Email sending failed: ${(error as Error).message}`);
    }
  }

  async sendPasswordResetOtpEmail(email: string, otp: string, userName: string): Promise<void> {
    try {
      const htmlContent = `
        <html>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
              <h2 style="color: #007bff;">Password Reset Request 🔐</h2>
              <p>Hi <strong>${userName}</strong>,</p>
              <p>We received a request to reset your password. Use the OTP code below to confirm it's you:</p>

              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0; text-align: center;">
                <h1 style="letter-spacing: 5px; color: #007bff; margin: 0;">${otp}</h1>
              </div>

              <p><strong>Important:</strong> This OTP will expire in 10 minutes.</p>
              <p style="color: #666; font-size: 14px;">If you did not request a password reset, please ignore this email — your password will remain unchanged.</p>

              <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">

              <p style="color: #999; font-size: 12px; text-align: center;">
                © 2026 Indrive. All rights reserved.
              </p>
            </div>
          </body>
        </html>
      `;

      const mailOptions = {
        from: this.fromAddress,
        to: email,
        subject: 'Indrive Password Reset - OTP Code',
        html: htmlContent,
      };

      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Password reset OTP email sent successfully to ${email}`);
    } catch (error) {
      this.logger.error(`Failed to send password reset OTP email to ${email}:`, (error as Error).message);
      throw new Error(`Email sending failed: ${(error as Error).message}`);
    }
  }

  async sendDriverRideAlertEmail(
    email: string,
    driverName: string,
    details: {
      pickupLocation: string;
      dropoffLocation: string;
      vehicleType: string;
      offeredPrice: number;
      rideRequestId: string;
    },
  ): Promise<void> {
    try {
      const htmlContent = `
        <html>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
              <h2 style="color: #007bff;">New Ride Request Available</h2>
              <p>Hi <strong>${driverName}</strong>,</p>
              <p>A rider is looking for a <strong>${details.vehicleType}</strong> ride.</p>

              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p><strong>From:</strong> ${details.pickupLocation}</p>
                <p><strong>To:</strong> ${details.dropoffLocation}</p>
                <p><strong>Offer:</strong> ${details.offeredPrice}</p>
                <p><strong>Request ID:</strong> ${details.rideRequestId}</p>
              </div>

              <p>Open your app to accept this ride request.</p>

              <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
              <p style="color: #999; font-size: 12px; text-align: center;">
                © 2026 Indrive. All rights reserved.
              </p>
            </div>
          </body>
        </html>
      `;

      await this.transporter.sendMail({
        from: this.fromAddress,
        to: email,
        subject: 'Indrive - New Ride Request Alert',
        html: htmlContent,
      });

      this.logger.log(`Ride alert email sent successfully to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send ride alert email to ${email}:`,
        (error as Error).message,
      );
      throw new Error(`Email sending failed: ${(error as Error).message}`);
    }
  }

  async sendRefundRequestedEmail(
    adminEmail: string,
    details: { driverName: string; txnRefNo: string; amount: number; reason?: string },
  ): Promise<void> {
    try {
      const htmlContent = `
        <html>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
              <h2 style="color: #d97706;">New Refund Request</h2>
              <p><strong>${details.driverName}</strong> has requested a refund for a wallet top-up.</p>

              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p><strong>Transaction Ref:</strong> ${details.txnRefNo}</p>
                <p><strong>Amount:</strong> PKR ${details.amount.toFixed(2)}</p>
                <p><strong>Reason:</strong> ${details.reason || 'Not provided'}</p>
              </div>

              <p>Please review this request in the admin dashboard.</p>

              <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
              <p style="color: #999; font-size: 12px; text-align: center;">
                © 2026 Indrive. All rights reserved.
              </p>
            </div>
          </body>
        </html>
      `;

      await this.transporter.sendMail({
        from: this.fromAddress,
        to: adminEmail,
        subject: `Indrive - New Refund Request (${details.txnRefNo})`,
        html: htmlContent,
      });

      this.logger.log(`Refund request notification sent to admin ${adminEmail}`);
    } catch (error) {
      this.logger.error(
        `Failed to send refund request email to ${adminEmail}:`,
        (error as Error).message,
      );
    }
  }

  async sendRefundApprovedEmail(
    email: string,
    driverName: string,
    details: { txnRefNo: string; amount: number },
  ): Promise<void> {
    try {
      const htmlContent = `
        <html>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
              <h2 style="color: #16a34a;">Refund Approved</h2>
              <p>Hi <strong>${driverName}</strong>,</p>
              <p>Your refund request has been approved and processed.</p>

              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p><strong>Transaction Ref:</strong> ${details.txnRefNo}</p>
                <p><strong>Refunded Amount:</strong> PKR ${details.amount.toFixed(2)}</p>
              </div>

              <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
              <p style="color: #999; font-size: 12px; text-align: center;">
                © 2026 Indrive. All rights reserved.
              </p>
            </div>
          </body>
        </html>
      `;

      await this.transporter.sendMail({
        from: this.fromAddress,
        to: email,
        subject: 'Indrive - Your Refund Has Been Approved',
        html: htmlContent,
      });

      this.logger.log(`Refund approved email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send refund approved email to ${email}:`,
        (error as Error).message,
      );
    }
  }

  async sendRefundRejectedEmail(
    email: string,
    driverName: string,
    details: { txnRefNo: string; amount: number; reason?: string },
  ): Promise<void> {
    try {
      const htmlContent = `
        <html>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 8px;">
              <h2 style="color: #dc2626;">Refund Request Rejected</h2>
              <p>Hi <strong>${driverName}</strong>,</p>
              <p>Unfortunately, your refund request could not be approved.</p>

              <div style="background-color: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p><strong>Transaction Ref:</strong> ${details.txnRefNo}</p>
                <p><strong>Amount:</strong> PKR ${details.amount.toFixed(2)}</p>
                <p><strong>Reason:</strong> ${details.reason || 'Not specified'}</p>
              </div>

              <p>If you believe this is a mistake, please contact support.</p>

              <hr style="margin: 30px 0; border: none; border-top: 1px solid #ddd;">
              <p style="color: #999; font-size: 12px; text-align: center;">
                © 2026 Indrive. All rights reserved.
              </p>
            </div>
          </body>
        </html>
      `;

      await this.transporter.sendMail({
        from: this.fromAddress,
        to: email,
        subject: 'Indrive - Your Refund Request Was Rejected',
        html: htmlContent,
      });

      this.logger.log(`Refund rejected email sent to ${email}`);
    } catch (error) {
      this.logger.error(
        `Failed to send refund rejected email to ${email}:`,
        (error as Error).message,
      );
    }
  }
}
