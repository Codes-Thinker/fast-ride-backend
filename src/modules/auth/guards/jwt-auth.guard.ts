import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable, isObservable } from 'rxjs';

// Auth guard for protected routes. Deliberately logs nothing: request headers
// carry bearer tokens, and the user object carries identifiers.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    return super.canActivate(context) as boolean | Promise<boolean> | Observable<boolean>;
  }
}
