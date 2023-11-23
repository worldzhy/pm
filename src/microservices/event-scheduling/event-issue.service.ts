import {Injectable} from '@nestjs/common';
import {ConfigService} from '@nestjs/config';
import {
  Prisma,
  EventIssue,
  EventIssueType,
  Event,
  User,
  EventIssueStatus,
} from '@prisma/client';
import {PrismaService} from '@toolkit/prisma/prisma.service';
import {
  ceilByMinutes,
  dateMinusMinutes,
  datePlusMinutes,
  floorByMinutes,
} from '@toolkit/utilities/datetime.util';

enum EventIssueDescription {
  Error_CoachNotExisted = 'The coach is not existed.',
  Error_CoachNotConfigured = 'The coach has not been configured.',
  Error_TimeUnavailale = 'The coach is not available at this time.',
  Error_TimeConflict = 'The coach was scheduled at another location at this period of time.',
  Error_ClassUnavailable = 'The coach is not able to teach this type of class.',
  Error_LocationUnavailable = 'The coach is not able to teach in this location.',
}

const MINUTES_OF_CONFLICT_DISTANCE = 30;

@Injectable()
export class EventIssueService {
  private MINUTES_Of_TIMESLOT_UNIT: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService
  ) {
    this.MINUTES_Of_TIMESLOT_UNIT = this.configService.getOrThrow<number>(
      'microservice.eventScheduling.minutesOfTimeslotUnit'
    );
  }

  async findUniqueOrThrow(
    args: Prisma.EventIssueFindUniqueOrThrowArgs
  ): Promise<EventIssue> {
    return await this.prisma.eventIssue.findUniqueOrThrow(args);
  }

  async findMany(args: Prisma.EventIssueFindManyArgs): Promise<EventIssue[]> {
    return await this.prisma.eventIssue.findMany(args);
  }

  async findManyInOnePage(findManyArgs?: Prisma.EventIssueFindManyArgs) {
    return await this.prisma.findManyInOnePage({
      model: Prisma.ModelName.EventIssue,
      findManyArgs,
    });
  }

  async findManyInManyPages(
    pagination: {page: number; pageSize: number},
    findManyArgs?: Prisma.EventIssueFindManyArgs
  ) {
    return await this.prisma.findManyInManyPages({
      model: Prisma.ModelName.EventIssue,
      pagination,
      findManyArgs,
    });
  }

  async create(args: Prisma.EventIssueCreateArgs): Promise<EventIssue> {
    return await this.prisma.eventIssue.create(args);
  }

  async createMany(
    args: Prisma.EventIssueCreateManyArgs
  ): Promise<Prisma.BatchPayload> {
    return await this.prisma.eventIssue.createMany(args);
  }

  async update(args: Prisma.EventIssueUpdateArgs): Promise<EventIssue> {
    return await this.prisma.eventIssue.update(args);
  }

  async updateMany(
    args: Prisma.EventIssueUpdateManyArgs
  ): Promise<Prisma.BatchPayload> {
    return await this.prisma.eventIssue.updateMany(args);
  }

  async upsert(args: Prisma.EventIssueUpsertArgs): Promise<EventIssue> {
    return await this.prisma.eventIssue.upsert(args);
  }

  async delete(args: Prisma.EventIssueDeleteArgs): Promise<EventIssue> {
    return await this.prisma.eventIssue.delete(args);
  }

  async check(event: Event) {
    // [solidcore only, 2023-11-20] Do not check locked event or event with TBD coach.
    if (event.isLocked) {
      return;
    }
    const tag = await this.prisma.tag.findFirst({
      where: {name: 'TBD', group: {name: 'Coach'}},
    });
    if (tag && event.hostUserId) {
      if (
        (await this.prisma.userProfile.count({
          where: {userId: event.hostUserId, tagIds: {has: tag.id}},
        })) > 0
      ) {
        return;
      }
    }

    // [step 0] Delete old unrepaired issues.
    await this.prisma.eventIssue.deleteMany({
      where: {eventId: event.id, status: EventIssueStatus.UNREPAIRED},
    });

    // [step 1] Get the coach.
    let hostUser: User | null = null;
    if (event.hostUserId) {
      hostUser = await this.prisma.user.findUnique({
        where: {id: event.hostUserId},
        include: {profile: true},
      });
    }

    // [step 2] Check issues.
    const issueCreateManyInput: Prisma.EventIssueCreateManyInput[] = [];
    if (!hostUser) {
      // [step 2-1] Check exist.
      issueCreateManyInput.push({
        type: EventIssueType.ERROR_NONEXISTENT_COACH,
        description: EventIssueDescription.Error_CoachNotExisted,
        eventId: event.id,
      });
    } else if (!hostUser['profile']) {
      // [step 2-2] Check coach profile.
      issueCreateManyInput.push({
        type: EventIssueType.ERROR_UNCONFIGURED_COACH,
        description: EventIssueDescription.Error_CoachNotConfigured,
        eventId: event.id,
      });
    } else {
      // [step 2-3] Check class type.
      if (!hostUser['profile']['eventTypeIds'].includes(event.typeId)) {
        issueCreateManyInput.push({
          type: EventIssueType.ERROR_UNAVAILABLE_EVENT_TYPE,
          description: EventIssueDescription.Error_ClassUnavailable,
          eventId: event.id,
        });
      }

      // [step 2-4] Check location.
      if (!hostUser['profile']['eventVenueIds'].includes(event.venueId)) {
        issueCreateManyInput.push({
          type: EventIssueType.ERROR_UNAVAILABLE_EVENT_VENUE,
          description: EventIssueDescription.Error_LocationUnavailable,
          eventId: event.id,
        });
      }

      // [step 2-5] Check availability
      const newDatetimeOfStart = floorByMinutes(
        event.datetimeOfStart,
        this.MINUTES_Of_TIMESLOT_UNIT
      );
      const newDatetimeOfEnd = ceilByMinutes(
        event.datetimeOfEnd,
        this.MINUTES_Of_TIMESLOT_UNIT
      );

      const count = await this.prisma.availabilityTimeslot.count({
        where: {
          hostUserId: hostUser.id,
          venueIds: {has: event.venueId},
          datetimeOfStart: {gte: newDatetimeOfStart},
          datetimeOfEnd: {lte: newDatetimeOfEnd},
        },
      });
      if (count < event.minutesOfDuration / this.MINUTES_Of_TIMESLOT_UNIT) {
        issueCreateManyInput.push({
          type: EventIssueType.ERROR_UNAVAILABLE_EVENT_TIME,
          description: EventIssueDescription.Error_TimeUnavailale,
          eventId: event.id,
        });
      }

      // [step 2-6] Check time conflict among different venues.
      const conflictingEvents = await this.prisma.event.findMany({
        where: {
          hostUserId: hostUser.id,
          venueId: {not: event.venueId},
          datetimeOfStart: {
            lt: datePlusMinutes(
              event.datetimeOfEnd,
              MINUTES_OF_CONFLICT_DISTANCE
            ),
          },
          datetimeOfEnd: {
            gt: dateMinusMinutes(
              event.datetimeOfStart,
              MINUTES_OF_CONFLICT_DISTANCE
            ),
          },
          deletedAt: null,
        },
        select: {venue: {select: {name: true}}},
      });
      if (conflictingEvents.length > 0) {
        const stringVenues = conflictingEvents
          .map(event => {
            return event['venue'].name;
          })
          .toString();
        issueCreateManyInput.push({
          type: EventIssueType.ERROR_CONFLICTING_EVENT_TIME,
          description:
            EventIssueDescription.Error_TimeConflict + '(' + stringVenues + ')',
          eventId: event.id,
        });
      }
    }

    if (issueCreateManyInput.length > 0) {
      await this.prisma.eventIssue.createMany({data: issueCreateManyInput});
    }
  }

  /* End */
}
