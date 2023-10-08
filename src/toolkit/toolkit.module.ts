import {Global, Module} from '@nestjs/common';
import {AwsModule} from './aws/aws.module';
import {ElasticModule} from './elastic/elastic.module';
import {CustomLoggerModule} from './logger/logger.module';
import {PrismaModule} from './prisma/prisma.module';
import {SnowflakeModule} from './snowflake/snowflake.module';
import {XLSXModule} from './xlsx/xlsx.module';

@Global()
@Module({
  imports: [
    AwsModule,
    ElasticModule,
    CustomLoggerModule,
    PrismaModule,
    SnowflakeModule,
    XLSXModule,
  ],
  //   exports: [AwsModule, ElasticModule, CustomLoggerModule, PrismaModule, SnowflakeModule, XLSXModule],
})
export class ToolkitModule {}
