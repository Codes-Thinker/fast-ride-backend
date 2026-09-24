import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { Request as ExpressRequest, Response } from 'express';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { InitiateTopUpDto } from './dto/initiate-top-up.dto';
import { RefundTopUpDto } from './dto/refund-top-up.dto';
import { RequestRefundDto } from './dto/request-refund.dto';
import { RejectRefundDto } from './dto/reject-refund.dto';
import { WalletTopUpService } from './services/wallet-top-up.service';

@Controller('api/wallet/topup')
export class WalletTopUpController {
  constructor(private readonly walletTopUpService: WalletTopUpService) {}

  /** Admin listing of JazzCash top-ups across all drivers — must be registered before the :topUpId routes. */
  @Get('admin/list')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  async listForAdmin(
    @Query('status') status?: string,
    @Query('refundStatus') refundStatus?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.walletTopUpService.listForAdmin({ status, refundStatus, search, page, limit });
  }

  @Post('jazzcash/initiate')
  @UseGuards(JwtAuthGuard)
  @HttpCode(201)
  async initiate(@Request() req: any, @Body() dto: InitiateTopUpDto) {
    return this.walletTopUpService.initiate(
      req.user.id,
      dto.amount,
      dto.method ?? 'card',
      dto.mobileNumber,
    );
  }

  /** Browser return URL for the Card Page Redirection checkout (pp_ReturnURL). */
  @Post('jazzcash/callback')
  async jazzCashCallback(@Req() req: ExpressRequest, @Res() res: Response) {
    const payload = req.body as Record<string, string>;
    const { redirectUrl, topUp } = await this.walletTopUpService.handleJazzCashCallback(payload);

    const url = new URL(redirectUrl);
    if (topUp) {
      url.searchParams.set('topUpId', topUp.id);
      url.searchParams.set('status', topUp.status);
      url.searchParams.set('txnRefNo', topUp.txnRefNo);
    }

    return res.redirect(url.toString());
  }

  /** REST IPN listener — must be registered as the IPN URL in the JazzCash merchant portal. */
  @Post('jazzcash/ipn')
  @HttpCode(200)
  async jazzCashIpn(@Body() payload: Record<string, string>) {
    return this.walletTopUpService.handleJazzCashIpn(payload);
  }

  @Get(':topUpId/status')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async getStatus(@Request() req: any, @Param('topUpId') topUpId: string) {
    return this.walletTopUpService.getStatus(req.user.id, topUpId);
  }

  @Post(':topUpId/inquire')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async inquire(@Request() req: any, @Param('topUpId') topUpId: string) {
    return this.walletTopUpService.inquireAndSync(req.user.id, topUpId);
  }

  @Post(':topUpId/refund')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  async refund(@Param('topUpId') topUpId: string, @Body() dto: RefundTopUpDto) {
    return this.walletTopUpService.refund(topUpId, dto.amount);
  }

  /** Driver requests a refund from the app — awaits admin review. */
  @Post(':topUpId/refund-request')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async requestRefund(
    @Request() req: any,
    @Param('topUpId') topUpId: string,
    @Body() dto: RequestRefundDto,
  ) {
    return this.walletTopUpService.requestRefund(req.user.id, topUpId, dto.reason);
  }

  @Post(':topUpId/refund/accept')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  async acceptRefundRequest(@Param('topUpId') topUpId: string, @Body() dto: RefundTopUpDto) {
    return this.walletTopUpService.acceptRefundRequest(topUpId, dto.amount);
  }

  @Post(':topUpId/refund/reject')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  async rejectRefundRequest(@Param('topUpId') topUpId: string, @Body() dto: RejectRefundDto) {
    return this.walletTopUpService.rejectRefundRequest(topUpId, dto.reason);
  }
}
