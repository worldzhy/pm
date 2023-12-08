import {Processor, Process, OnQueueCompleted} from '@nestjs/bull';
import {Job} from 'bull';
import {QueueName} from '@microservices/queue/queue.service';
import {AvailabilityExpressionService} from '@microservices/event-scheduling/availability-expression.service';
import {AvailabilityExpressionStatus} from '@prisma/client';
import {PrismaService} from '@toolkit/prisma/prisma.service';

@Processor(QueueName.DEFAULT)
export class AvailabilityJobConsumer {
  constructor(
    private readonly prisma: PrismaService,
    private availabilityExpressionService: AvailabilityExpressionService
  ) {}

  // @Process({concurrency: 10}) // todo: Check if the concurrency is valid.
  @Process()
  async parseAvailability(job: Job) {
    let availabilityExpressionId = (job.data as any)
      .availabilityExpressionId as number;

    // [step 1] Parse expression to timeslots.
    const availabilityTimeslots =
      await this.availabilityExpressionService.parse(availabilityExpressionId);

    if (availabilityTimeslots.length === 0) {
      return {};
    }

    // [step 2] Delete and create timeslots.
    await this.prisma.availabilityTimeslot.deleteMany({
      where: {expressionId: availabilityExpressionId},
    });
    await this.prisma.availabilityTimeslot.createMany({
      data: availabilityTimeslots,
    });

    // [step 3] Update expression status.
    await this.prisma.availabilityExpression.update({
      where: {id: availabilityExpressionId},
      data: {
        status: AvailabilityExpressionStatus.PUBLISHED,
      },
    });

    return {};
  }

  @OnQueueCompleted()
  onCompleted(job: Job, result: any) {
    console.log('Availability job ' + job.id + ' is completed.');
  }
}
