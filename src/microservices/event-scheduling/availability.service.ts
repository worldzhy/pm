import {Injectable} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {Prisma, AvailabilityExpression} from '@prisma/client';
import {PrismaService} from '@toolkit/prisma/prisma.service';
import {datePlusMinutes, datePlusYears} from '@toolkit/utilities/datetime.util';
const CronParser = require('cron-parser');

@Injectable()
export class AvailabilityService {
  private minutesOfTimeslot: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService
  ) {
    this.minutesOfTimeslot = parseInt(
      this.configService.getOrThrow<string>(
        'microservice.eventScheduling.minutesOfTimeslot'
      )
    );
  }

  async create(
    data: Prisma.AvailabilityExpressionCreateInput
  ): Promise<AvailabilityExpression> {
    return await this.prisma.$transaction(async tx => {
      // [step 1] Update availability expression.
      const expression: AvailabilityExpression =
        await tx.availabilityExpression.create({data});

      // [step 2] Generate availability timeslots.
      const timeslots = this.parse(expression);

      // [step 3] Create timeslots.
      await tx.availabilityTimeslot.createMany({
        data: timeslots,
      });

      return expression;
    });
  }

  async update(
    availabilityExpressionId: number,
    data: Prisma.AvailabilityExpressionUpdateInput
  ): Promise<AvailabilityExpression> {
    return await this.prisma.$transaction(async tx => {
      // [step 1] Update availability expression.
      const expression: AvailabilityExpression =
        await tx.availabilityExpression.update({
          where: {id: availabilityExpressionId},
          data,
        });

      // [step 2] Generate availability timeslots.
      const timeslots = this.parse(expression);

      // [step 3] Create timeslots.
      await tx.availabilityTimeslot.deleteMany({
        where: {expressionId: expression.id},
      });
      await tx.availabilityTimeslot.createMany({
        data: timeslots,
      });

      return expression;
    });
  }

  parse(expression: AvailabilityExpression) {
    // [step 1] Construct cron parser options.
    const cronParserOptions = {
      // ! https://unpkg.com/browse/cron-parser@4.8.1/README.md
      tz: expression.timezone,
      currentDate: expression.dateOfOpening.toISOString(),
      endDate: expression.dateOfClosure
        ? expression.dateOfClosure.toISOString()
        : datePlusYears(expression.dateOfOpening, 1),
      iterator: true,
    };

    // [step 2] Parse availability expressions and collect availability timeslots.
    const availabilityTimeslots: Prisma.AvailabilityTimeslotCreateManyInput[] =
      [];

    for (
      let i = 0;
      i < expression.cronExpressionsOfAvailableTimePoints.length;
      i++
    ) {
      const exp = expression.cronExpressionsOfAvailableTimePoints[i];
      const interval = CronParser.parseExpression(exp, cronParserOptions);

      while (interval.hasNext()) {
        const parsedDatetime = new Date(interval.next().value.toString());

        for (
          let p = 0;
          p < expression.minutesOfDuration / this.minutesOfTimeslot;
          p++
        ) {
          const datetimeOfStart = datePlusMinutes(
            parsedDatetime,
            this.minutesOfTimeslot * p
          );
          const datetimeOfEnd = datePlusMinutes(
            datetimeOfStart,
            this.minutesOfTimeslot
          );

          availabilityTimeslots.push({
            year: datetimeOfStart.getFullYear(),
            month: datetimeOfStart.getMonth() + 1, // 0-11, January gives 0
            dayOfMonth: datetimeOfStart.getDate(),
            dayOfWeek: datetimeOfStart.getDay(), //0-6, Sunday gives 0
            hour: datetimeOfStart.getHours(),
            minute: datetimeOfStart.getMinutes(),
            minutesOfTimeslot: this.minutesOfTimeslot,
            hostUserId: expression.hostUserId,
            datetimeOfStart: datetimeOfStart,
            datetimeOfEnd: datetimeOfEnd,
            expressionId: expression.id,
          });
        }
      }
    }

    // [step 3] Parse unavailability expressions and collect unavailability timeslots.
    const unavailabilityTimeslots: {
      datetimeOfStart: Date;
      datetimeOfEnd: Date;
    }[] = [];

    for (
      let j = 0;
      j < expression.cronExpressionsOfUnavailableTimePoints.length;
      j++
    ) {
      const exp = expression.cronExpressionsOfUnavailableTimePoints[j];
      const interval = CronParser.parseExpression(exp, cronParserOptions);

      while (interval.hasNext()) {
        let datetimeOfStart = new Date(interval.next().value.toString());
        let datetimeOfEnd: Date;

        for (
          let q = 0;
          q < expression.minutesOfDuration / this.minutesOfTimeslot;
          q++
        ) {
          datetimeOfStart = datePlusMinutes(
            datetimeOfStart,
            this.minutesOfTimeslot * q
          );
          datetimeOfEnd = datePlusMinutes(
            datetimeOfStart,
            this.minutesOfTimeslot
          );

          unavailabilityTimeslots.push({
            datetimeOfStart: datetimeOfStart,
            datetimeOfEnd: datetimeOfEnd,
          });
        }
      }
    }

    // [step 4] Collect final availability timeslots.
    const finalAvailabilityTimeslots: Prisma.AvailabilityTimeslotCreateManyInput[] =
      [];
    for (let m = 0; m < availabilityTimeslots.length; m++) {
      const availabilityTimeslot = availabilityTimeslots[m];
      let matched = false;
      for (let n = 0; n < unavailabilityTimeslots.length; n++) {
        const unavailabilityTimeslot = unavailabilityTimeslots[n];
        if (
          availabilityTimeslot.datetimeOfStart.toString() ===
            unavailabilityTimeslot.datetimeOfStart.toString() &&
          availabilityTimeslot.datetimeOfEnd.toString() ===
            unavailabilityTimeslot.datetimeOfEnd.toString()
        ) {
          matched = true;
        }
      }

      if (!matched) {
        finalAvailabilityTimeslots.push(availabilityTimeslot);
      }
    }

    return finalAvailabilityTimeslots;
  }

  /* End */
}
