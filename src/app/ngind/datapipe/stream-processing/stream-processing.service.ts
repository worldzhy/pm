import {Injectable} from '@nestjs/common';
import {Datapipe, PostgresqlDatasourceTable} from '@prisma/client';
import {PrismaService} from '../../../../_prisma/_prisma.service';

@Injectable()
export class DatapipeStreamProcessingService {
  private prisma: PrismaService = new PrismaService();

  async start(datapipe: Datapipe) {
    const fromTable = datapipe['fromTable'] as PostgresqlDatasourceTable;
    const hasManyTables = datapipe.hasManyTables;
    const belongsToTables = datapipe.belongsToTables;

    this.prisma.$queryRawUnsafe(`SELECT * FROM "${fromTable.name}"`);
    return true;
  }

  /* End */
}
