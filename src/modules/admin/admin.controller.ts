import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminGuard } from '../auth/guards/admin.guard';
import { AdminService } from './admin.service';
import { ChangeUserRoleDto } from './dto/change-user-role.dto';
import { CreditDriverWalletDto } from './dto/credit-driver-wallet.dto';
import { AppVersionQueryDto, UpdateAppVersionDto } from '../app-version/dto/app-version.dto';

@Controller('api/admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard/stats')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  async getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('dashboard/analytics')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  async getAnalytics(@Query('days') days?: string) {
    return this.adminService.getAnalytics(days);
  }

  @Get('users')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  async listUsers(
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('sort') sort?: string,
    @Query('order') order?: string,
  ) {
    return this.adminService.listUsers({ role, status, search, page, limit, sort, order });
  }

  @Get('users/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  async getUserDetail(@Param('id', new ParseUUIDPipe()) userId: string) {
    return this.adminService.getUserDetail(userId);
  }

  @Get('rides')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  async listRides(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.adminService.listRides({ status, search, page, limit });
  }

  @Get('driver-registrations')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  async listDriverRegistrations(@Query('status') status?: string) {
    return this.adminService.listDriverRegistrations(status);
  }

  @Get('driver-registrations/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  async getDriverRegistration(@Param('id') id: string) {
    return this.adminService.getDriverRegistration(id);
  }

  @Post('driver-registrations/:id/approve')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  async approve(@Request() req: any, @Param('id') id: string) {
    return this.adminService.approveDriverRegistration(id, req.user.id);
  }

  @Post('driver-registrations/:id/reject')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  async reject(@Request() req: any, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.adminService.rejectDriverRegistration(id, req.user.id, body?.reason);
  }

  @Patch('users/:id/role')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  async changeUserRole(
    @Request() req: any,
    @Param('id') userId: string,
    @Body() changeRoleDto: ChangeUserRoleDto,
  ) {
    return this.adminService.changeUserRole(req.user.id, userId, changeRoleDto);
  }

  @Delete('users/:id')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  async deleteUser(@Request() req: any, @Param('id') userId: string) {
    return this.adminService.deleteUser(req.user.id, userId);
  }

  @Get('wallet/withdrawals')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  async listWithdrawals(@Query('status') status?: string) {
    return this.adminService.listWithdrawals(status);
  }

  @Post('wallet/withdrawals/:id/complete')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  async completeWithdrawal(@Request() req: any, @Param('id') id: string) {
    return this.adminService.completeWithdrawal(id, req.user.id);
  }

  @Post('wallet/withdrawals/:id/reject')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  async rejectWithdrawal(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.adminService.rejectWithdrawal(id, req.user.id, body?.reason);
  }

  @Post('wallet/drivers/:id/credit')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  async creditDriverWallet(
    @Request() req: any,
    @Param('id') id: string,
    @Body() creditDto: CreditDriverWalletDto,
  ) {
    return this.adminService.creditDriverWallet(
      req.user.id,
      id,
      creditDto.amount,
      creditDto.description,
    );
  }

  @Get('audit-logs')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  async listAuditLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('action') action?: string,
    @Query('search') search?: string,
  ) {
    return this.adminService.listAuditLogs({ page, limit, action, search });
  }

  @Get('app-version')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  async getAppVersion(@Query() query: AppVersionQueryDto) {
    return this.adminService.getAppVersion(query.platform);
  }

  @Put('app-version')
  @UseGuards(JwtAuthGuard, AdminGuard)
  @HttpCode(200)
  async updateAppVersion(
    @Request() req: any,
    @Query() query: AppVersionQueryDto,
    @Body() dto: UpdateAppVersionDto,
  ) {
    return this.adminService.updateAppVersion(req.user.id, query.platform, dto);
  }
}
