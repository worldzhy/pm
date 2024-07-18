import {Injectable, NotFoundException} from '@nestjs/common';
import {UserStatus} from '@prisma/client';
import {UserService} from './user/user.service';
import {VerificationCodeService} from './verification-code/verification-code.service';
import {LimitLoginByUserService} from './security/rate-limiter/rate-limiter.service';
import {AccessTokenService} from '@microservices/account/security/token/access-token.service';
import {RefreshTokenService} from '@microservices/account/security/token/refresh-token.service';
import {PrismaService} from '@toolkit/prisma/prisma.service';
import {Request} from 'express';
import {RoleService} from './role/role.service';

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    private readonly accessTokenService: AccessTokenService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly limitLoginByUserService: LimitLoginByUserService
  ) {}

  async me(request: Request) {
    // [step 1] Parse token from http request header.
    const accessToken =
      this.accessTokenService.getTokenFromHttpRequest(request);

    // [step 2] Get UserToken record.
    const userToken = await this.prisma.accessToken.findFirstOrThrow({
      where: {token: accessToken},
    });

    // [step 3] Get user.
    return await this.prisma.user.findUniqueOrThrow({
      where: {id: userToken.userId},
      select: {
        id: true,
        email: true,
        phone: true,
        roles: true,
        profile: true,
        profiles: true,
        organization: true,
      },
    });
  }

  async isAdmin(request: Request) {
    // [step 1] Parse token from http request header.
    const accessToken =
      this.accessTokenService.getTokenFromHttpRequest(request);

    // [step 2] Get UserToken record.
    const userToken = await this.prisma.accessToken.findFirstOrThrow({
      where: {token: accessToken},
    });

    // [step 3] Get user.
    const count = await this.prisma.user.count({
      where: {
        id: userToken.userId,
        roles: {some: {name: RoleService.RoleName.ADMIN}},
      },
    });

    return count > 0 ? true : false;
  }

  async login(account: string) {
    // [step 1] Get user.
    const user = await this.userService.findByAccount(account);
    if (!user) {
      throw new NotFoundException('Your account does not exist.');
    }

    // [step 2] Check if the account is active.
    if (user.status === UserStatus.INACTIVE) {
      throw new NotFoundException(
        'You have closed your account, do you want to recover it?'
      );
    }

    // [step 3] Disable active JSON web token if existed.
    await this.invalidateTokens(user.id);

    // [step 4] Update last login time.
    await this.prisma.user.update({
      where: {id: user.id},
      data: {lastLoginAt: new Date()},
    });

    // [step 5] Generate new tokens.
    return await this.generateTokens({userId: user.id, sub: account});
  }

  async logout(userId: string) {
    // [step 1] Invalidate all tokens.
    await this.invalidateTokens(userId);

    // [step 2] Clear user attempts.
    await this.limitLoginByUserService.delete(userId);
  }

  async invalidateTokens(userId: string) {
    await Promise.all([
      this.prisma.accessToken.deleteMany({
        where: {userId},
      }),
      this.prisma.refreshToken.deleteMany({
        where: {userId},
      }),
    ]);
  }

  async generateTokens(
    payload: {
      userId: string;
      sub: string;
    },
    refreshTokenOptions?: {expiresIn: number}
  ) {
    // [step 1] Generate tokens
    const [accessToken, refreshToken] = await Promise.all([
      this.prisma.accessToken.create({
        data: {
          userId: payload.userId,
          token: this.accessTokenService.sign(payload),
        },
      }),
      this.prisma.refreshToken.create({
        data: {
          userId: payload.userId,
          token: this.refreshTokenService.sign(payload, refreshTokenOptions),
        },
      }),
    ]);

    // [step 2] Parse access token to get the expiry.
    const accessTokenInfo = this.accessTokenService.decodeToken(
      accessToken.token
    ) as {iat: number; exp: number};
    accessToken['tokenExpiresInSeconds'] =
      accessTokenInfo.exp - accessTokenInfo.iat;

    return {
      accessToken,
      refreshToken: {
        ...refreshToken,
        cookie: {
          name: this.refreshTokenService.cookieName,
          options: this.refreshTokenService.getCookieOptions(
            refreshToken.token
          ),
        },
      },
    };
  }

  /* End */
}
