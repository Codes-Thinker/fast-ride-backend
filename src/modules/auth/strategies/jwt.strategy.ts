import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { User } from '../../user/entities/user.entity';

// Tokens are signed with JWT_SECRET (see app.module.ts). Falling back to a
// public default would let anyone forge a token, so refuse to start without it.
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set. Add it to the environment before starting the server.');
  }
  return secret;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: getJwtSecret(),
    });
  }

  async validate(payload: { id: string; email: string }) {
    // A valid signature is not enough: an account deleted after the token was
    // issued must stop working right away. Deactivated accounts are still
    // allowed through so they can reactivate via POST /api/users/activate.
    const user = await this.userRepository.findOne({
      where: { id: payload.id },
      select: ['id', 'deleted_at'],
    });

    if (!user || user.deleted_at) {
      throw new UnauthorizedException('Account no longer exists');
    }

    return {
      id: payload.id,
      email: payload.email,
    };
  }
}
