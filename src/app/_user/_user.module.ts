import {Module} from '@nestjs/common';
import {PrismaModule} from '../../_prisma/_prisma.module';
import {UserController} from './_user.controller';
import {UserService} from './_user.service';
import {ValidatorModule} from '../../_validator/_validator.module';

@Module({
  imports: [PrismaModule, ValidatorModule],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
