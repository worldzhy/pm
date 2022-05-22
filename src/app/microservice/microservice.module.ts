import {Module} from '@nestjs/common';
import {MicroserviceController} from './microservice.controller';
import {MicroserviceService} from './microservice.service';
import {PrismaModule} from '../../_prisma/_prisma.module';
import {InfrastructureModule} from '../infrastructure/infrastructure.module';

@Module({
  imports: [PrismaModule, InfrastructureModule],
  controllers: [MicroserviceController],
  providers: [MicroserviceService],
  exports: [MicroserviceService],
})
export class MicroserviceModule {}
