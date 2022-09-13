/* eslint-disable @typescript-eslint/no-explicit-any */
import {Controller, Body, Post, Request} from '@nestjs/common';
import {ApiTags, ApiBody, ApiBearerAuth} from '@nestjs/swagger';
import {Public} from './auth/auth-jwt/auth-jwt.decorator';
import {LoggingInByPassword} from './auth/auth-password/auth-password.decorator';
import {LoggingInByProfile} from './auth/auth-profile/auth-profile.decorator';
import {LoggingInByUuid} from './auth/auth-uuid/auth-uuid.decorator';
import {LoggingInByVerificationCode} from './auth/auth-verification-code/auth-verification-code.decorator';
import {AccountService} from './account.service';
import {UserService} from './user/user.service';
import {ProfileService} from './profile/profile.service';
import * as validator from '../../_validator/_account.validator';

@ApiTags('[Product] Account')
@Controller()
export class AccountController {
  private userService = new UserService();

  constructor(private accountService: AccountService) {}

  @Post('account/check')
  @Public()
  @ApiBody({
    description:
      "The request body should contain at least one of the three attributes ['username', 'email', 'phone']. If 'username' is contained, then 'password' is required, or 'password' is optional.",
    examples: {
      a: {
        summary: '1. Check username',
        value: {
          username: 'henry',
        },
      },
      b: {
        summary: '2. Check email',
        value: {
          email: 'email@example.com',
        },
      },
      c: {
        summary: '3. Check phone',
        value: {
          phone: '13960068008',
        },
      },
      d: {
        summary: '4. Check profile',
        value: {
          profile: {
            givenName: 'Robert',
            middleName: 'William',
            familyName: 'Smith',
            suffix: 'PhD',
            birthday: '2019-05-27T11:53:32.118Z',
          },
        },
      },
    },
  })
  async check(
    @Body()
    body: {
      username?: string;
      email?: string;
      phone?: string;
      profile?: object;
    }
  ): Promise<{count: number; message: string}> {
    // [step 1] Check account existence with username, email and phone.
    const existed = await this.userService.checkAccount({
      username: body.username,
      email: body.email,
      phone: body.phone,
    });
    if (existed) {
      return {
        count: 1,
        message: 'Your account exists.',
      };
    }

    // [step 2] Check account existence with profile.
    if (body.profile) {
      const profileService = new ProfileService();
      const profiles = await profileService.findMany({...body.profile});
      if (profiles.length === 1) {
        return {
          count: 1,
          message: 'Your account exists.',
        };
      } else if (profiles.length > 1) {
        return {
          count: 2,
          message: 'Multiple accounts exist.',
        };
      }
    }

    return {
      count: 0,
      message: 'Your account does not exist.',
    };
  }

  /**
   * Sign up by:
   * [1] username: password is required
   * [2] email: password is optional
   * [3] phone: password is optional
   *
   * [Constraint] 'password' is required if neither email nor phone is provided.
   *
   * @param {{
   *       username?: string;
   *       password?: string;
   *       email?: string;
   *       phone?: string;
   *       profile?: object;
   *     }} signupUser
   * @returns {(Promise<{data: object | null; err: object | null}>)}
   * @memberof AccountController
   */
  @Post('account/signup')
  @Public()
  @ApiBody({
    description:
      "The request body should contain at least one of the three attributes ['username', 'email', 'phone']. If 'username' is contained, then 'password' is required, or 'password' is optional.",
    examples: {
      a: {
        summary: '1. Sign up with username',
        value: {
          username: 'henry',
          password: 'Abc1234!',
        },
      },
      b: {
        summary: '2. Sign up with email',
        value: {
          email: 'email@example.com',
        },
      },
      c: {
        summary: '3. Sign up with phone',
        value: {
          phone: '13960068008',
        },
      },
      d: {
        summary: '4. Sign up with profile',
        value: {
          profile: {
            givenName: 'Robert',
            middleName: 'William',
            familyName: 'Smith',
            suffix: 'PhD',
            birthday: '2019-05-27T11:53:32.118Z',
          },
        },
      },
    },
  })
  async signup(
    @Body()
    signupUser: {
      username?: string;
      password?: string;
      email?: string;
      phone?: string;
      profile?: object;
    }
  ): Promise<{data: object | null; err: object | null}> {
    let usernameCount = 0;
    let emailCount = 0;
    let phoneCount = 0;
    let profileCount = 0;

    // [step 1] Validate parameters.
    if (signupUser.password) {
      if (!validator.verifyPassword(signupUser.password)) {
        return {
          data: null,
          err: {message: 'Your password is not strong enough.'},
        };
      } else {
        // Go on validating...
        usernameCount += 1;
      }
    }

    if (signupUser.username) {
      if (!validator.verifyUsername(signupUser.username)) {
        return {
          data: null,
          err: {message: 'Your username is not valid.'},
        };
      } else {
        // Go on validating...
        usernameCount += 1;
      }
    }

    if (signupUser.email) {
      if (!validator.verifyEmail(signupUser.email)) {
        return {
          data: null,
          err: {message: 'Your email is not valid.'},
        };
      } else {
        // Go on validating...
        emailCount += 1;
      }
    }

    if (signupUser.phone) {
      if (!validator.verifyPhone(signupUser.phone)) {
        return {
          data: null,
          err: {message: 'Your phone is not valid.'},
        };
      } else {
        // End of validating.
        phoneCount += 1;
      }
    }

    if (signupUser.profile) {
      profileCount += 1;
    }

    // [step 2] Check account existence.
    const existed = await this.userService.checkAccount({
      username: signupUser.username,
      email: signupUser.email,
      phone: signupUser.phone,
    });
    if (existed) {
      return {
        data: null,
        err: {message: 'Your username exists.'},
      };
    }

    // [step 3] Sign up a new account.
    if (
      usernameCount === 2 ||
      emailCount === 1 ||
      phoneCount === 1 ||
      profileCount === 1
    ) {
      const user = await this.accountService.signup(signupUser);
      if (user) {
        return {
          data: user,
          err: null,
        };
      } else {
        // [Tip] This should not happen.
        return {
          data: null,
          err: {message: 'Create user failed.'},
        };
      }
    } else {
      return {
        data: null,
        err: {message: 'Your parameters are invalid.'},
      };
    }
  }

  /**
   * The 'account' parameter accepts:
   * [1] account
   * [2] email
   * [3] phone
   *
   * @param {{
   *       account: string;
   *       password: string;
   *     }} loginUser
   * @returns {(Promise<{data: object | null; err: object | null}>)}
   * @memberof AccountController
   */
  @Post('account/login-by-password')
  @LoggingInByPassword()
  @ApiBody({
    description:
      "The request body should contain 'account' and 'password' attributes.",
    examples: {
      a: {
        summary: '1. Log in with username',
        value: {
          account: 'henry',
          password: 'Abc1234!',
        },
      },
      b: {
        summary: '2. Log in with email',
        value: {
          account: 'email@example.com',
          password: 'Abc1234!',
        },
      },
      c: {
        summary: '3. Log in with phone',
        value: {
          account: '13960068008',
          password: 'Abc1234!',
        },
      },
    },
  })
  async loginByPassword(
    @Body()
    body: {
      account: string;
      password: string;
    }
  ): Promise<{data: object | null; err: object | null}> {
    return await this.accountService.login(body.account);
  }

  /**
   * Login by profile.
   *
   * @param {{
   *       givenName: string;
   *       middleName: string;
   *       familyName: string;
   *       suffix?: string;
   *       birthday: Date;
   *     }} body
   * @returns {(Promise<{data: object | null; err: object | null}>)}
   * @memberof AccountController
   */
  @Post('account/login-by-profile')
  @LoggingInByProfile()
  @ApiBody({
    description:
      "The request body should contain 'giveName', 'middleName', 'familyName' and 'birthday' attributes. The 'suffix' is optional.",
    examples: {
      a: {
        summary: '1. Profile with suffix',
        value: {
          givenName: 'Robert',
          middleName: 'William',
          familyName: 'Smith',
          suffix: 'PhD',
          birthday: '2019-05-27T11:53:32.118Z',
        },
      },
      b: {
        summary: '2. Profile without suffix',
        value: {
          givenName: 'Mary',
          middleName: 'Rose',
          familyName: 'Johnson',
          birthday: '2019-05-27T11:53:32.118Z',
        },
      },
    },
  })
  async loginByProfile(
    @Body()
    body: {
      givenName: string;
      middleName: string;
      familyName: string;
      suffix?: string;
      birthday: Date;
    }
  ): Promise<{data: object | null; err: object | null}> {
    const profileService = new ProfileService();

    // [step 1] It has been confirmed there is only one profile.
    const {givenName, middleName, familyName, suffix, birthday} = body;
    const profiles = await profileService.findMany({
      givenName,
      middleName,
      familyName,
      suffix,
      birthday,
    });

    // [step 2] Login with userId.
    return await this.accountService.login(profiles[0].userId);
  }

  /**
   * Login by uuid.
   *
   * @param {{
   *       uuid: string;
   *     }} body
   * @returns {(Promise<{data: object | null; err: object | null}>)}
   * @memberof AccountController
   */
  @Post('account/login-by-uuid')
  @LoggingInByUuid()
  @ApiBody({
    description: 'Verfiy account by uuid.',
    examples: {
      a: {
        summary: '1. Valid uuid',
        value: {
          uuid: 'e51b4030-39ab-4420-bc87-2907acae824c',
        },
      },
    },
  })
  async loginByUuid(
    @Body()
    body: {
      uuid: string;
    }
  ): Promise<{data: object | null; err: object | null}> {
    return await this.accountService.login(body.uuid);
  }

  /**
   * The 'account' parameter accepts:
   * [1] username
   * [2] email
   * [3] phone
   *
   * @param {{
   *       account: string;
   *       verificationCode: string;
   *     }} body
   * @returns {(Promise<{data: object | null; err: object | null}>)}
   * @memberof AccountController
   */
  @Post('account/login-by-verification-code')
  @LoggingInByVerificationCode()
  @ApiBody({
    description:
      "The request body must contain 'account' and 'verificationCode' attributes. The 'username' accepts username, email or phone.",
    examples: {
      a: {
        summary: '1. Log in with email',
        value: {
          account: 'email@example.com',
          verificationCode: '123456',
        },
      },
      b: {
        summary: '2. Log in with phone',
        value: {
          account: '13960068008',
          verificationCode: '123456',
        },
      },
      c: {
        summary: '3. Log in with username',
        value: {
          account: 'henry',
          verificationCode: '123456',
        },
      },
    },
  })
  async loginByVerificationCode(
    @Body()
    body: {
      account: string;
      verificationCode: string;
    }
  ): Promise<{data: object | null; err: object | null}> {
    return await this.accountService.login(body.account);
  }

  /**
   * Log out
   *
   * @param {*} request
   * @param {{userId: string}} body
   * @returns {(Promise<{data: object | null; err: object | null}>)}
   * @memberof AccountController
   */
  @ApiBearerAuth()
  @ApiBody({
    description: "The request body must contain 'userId' attribute.",
    examples: {
      a: {
        summary: '1. Log out',
        value: {
          userId: 'fd5c948e-d15d-48d6-a458-7798e4d9921c',
        },
      },
    },
  })
  @Post('account/logout')
  async logout(
    @Request() request: any,
    @Body() body: {userId: string}
  ): Promise<{data: object | null; err: object | null}> {
    const accessToken = request.headers['authorization'].split(' ')[1];

    await this.accountService.logout(body.userId, accessToken);

    // Always return success no matter if the user exists.
    return {
      data: {message: 'User logs out successfully'},
      err: null,
    };
  }

  /**
   * Close account
   * 1. Call account/apply-verification-code first.
   * 2. Use verification code and userId to close account.
   *
   * @param {{account: string; verificationCode: string}} body
   * @returns {(Promise<{data: object | null; err: object | null}>)}
   * @memberof AccountController
   */
  @Post('account/close')
  @LoggingInByVerificationCode()
  @ApiBody({
    description: "The request body must contain 'userId' attribute.",
    examples: {
      a: {
        summary: '1. Close with email',
        value: {
          account: 'email@example.com',
          verificationCode: '123456',
        },
      },
      b: {
        summary: '2. Close with phone',
        value: {
          account: '13960068008',
          verificationCode: '123456',
        },
      },
    },
  })
  async close(
    @Body() body: {account: string; verificationCode: string}
  ): Promise<{data: object | null; err: object | null}> {
    await this.accountService.close(body.account);

    // Always return success no matter if the user exists.
    return {
      data: {
        message:
          'The account is closed. Please apply to recover it if you want to login again.',
      },
      err: null,
    };
  }

  /**
   * Recover account:
   * 1. Call account/apply-verification-code first.
   * 2. Use verification code and userId to recover account.
   *
   * @param {{account: string; verificationCode: string}} body
   * @returns {(Promise<{data: object | null; err: object | null}>)}
   * @memberof AccountController
   */
  @Post('account/recover')
  @LoggingInByVerificationCode()
  @ApiBody({
    description: "The request body must contain 'userId' attribute.",
    examples: {
      a: {
        summary: '1. Recover with email',
        value: {
          account: 'email@example.com',
          verificationCode: '123456',
        },
      },
      b: {
        summary: '2. Recover with phone',
        value: {
          account: '13960068008',
          verificationCode: '123456',
        },
      },
    },
  })
  async recover(
    @Body() body: {account: string; verificationCode: string}
  ): Promise<{data: object | null; err: object | null}> {
    await this.accountService.recover(body.account);

    // Always return success no matter if the user exists.
    return {
      data: {
        message: 'The account is recovered.',
      },
      err: null,
    };
  }
  /* End */
}
