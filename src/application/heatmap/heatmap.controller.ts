import {Controller, Query, Get} from '@nestjs/common';
import {ApiTags, ApiBearerAuth} from '@nestjs/swagger';
import {AvailabilityTimeslotService} from '@microservices/event-scheduling/availability-timeslot.service';
import {UserService} from '@microservices/account/user/user.service';
import {
  generateMonthlyCalendar,
  generateMonthlyTimeslots,
} from '@toolkit/utilities/datetime.util';

const HEATMAP_TYPE_AVAILABILITY = 'Availability';
const HEATMAP_TYPE_DEMAND = 'Demand';

@ApiTags('Heatmap')
@ApiBearerAuth()
@Controller('heatmap')
export class HeatmapController {
  constructor(
    private readonly availabilityTimeslotService: AvailabilityTimeslotService,
    private readonly coachService: UserService
  ) {}

  @Get('')
  async getHeatmap(
    @Query('venueId') venueId: number,
    @Query('year') year: number,
    @Query('month') month: number
  ) {
    const hourOfOpening = 5;
    const hourOfClosure = 22;
    const minutesOfTimeslot = 30;
    const heatmapTypes = [HEATMAP_TYPE_AVAILABILITY];
    const heatmapInfoTimeslots: {
      year: number;
      month: number;
      dayOfMonth: number;
      dayOfWeek: number;
      hour: number;
      minute: number;
      minutesOfTimeslot: number;
      info: {type: string; count: number}[];
    }[] = [];

    // [step 1] Generate monthly timeslots.
    const heatmapTimeslots = generateMonthlyTimeslots({
      year,
      month,
      hourOfOpening,
      hourOfClosure,
      minutesOfTimeslot,
    });

    // [step 2] Get coach availability heatmap.
    if (heatmapTypes.includes(HEATMAP_TYPE_AVAILABILITY)) {
      // [step 2-1] Get coaches in the location.
      const coaches = await this.coachService.findMany({
        where: {profile: {venueIds: {has: venueId}}},
      });
      const coachIds = coaches.map(coach => {
        return coach.id;
      });

      // [step 2-2] Count available coaches in each heatmap timeslot.
      for (let i = 0; i < heatmapTimeslots.length; i++) {
        const heatmapTimeslot = heatmapTimeslots[i];

        // Get {hostUserId:string, _count:{}}[]
        const groupedAvailabilityTimeslots =
          await this.availabilityTimeslotService.groupByHostUserId({
            hostUserIds: coachIds,
            datetimeOfStart: heatmapTimeslot.datetimeOfStart,
            datetimeOfEnd: heatmapTimeslot.datetimeOfEnd,
          });

        // Count available coaches in this heatmap timeslot.
        let count = 0;
        for (let j = 0; j < groupedAvailabilityTimeslots.length; j++) {
          const element = groupedAvailabilityTimeslots[j];
          // Check if it is seamless in the heatmap timeslot.
          // If it is seamless, then the coach is available for the heatmap timeslot.
          if (
            element._count.hostUserId ===
            minutesOfTimeslot /
              this.availabilityTimeslotService.minutesOfTimeslot
          ) {
            count++;
          }
        }

        heatmapInfoTimeslots.push({
          year: heatmapTimeslot.year,
          month: heatmapTimeslot.month,
          dayOfMonth: heatmapTimeslot.dayOfMonth,
          dayOfWeek: heatmapTimeslot.dayOfWeek,
          hour: heatmapTimeslot.hour,
          minute: heatmapTimeslot.minute,
          minutesOfTimeslot: heatmapTimeslot.minutesOfTimeslot,
          info: [{type: HEATMAP_TYPE_AVAILABILITY, count: count}],
        });
      }
    }

    return {
      calendar: generateMonthlyCalendar(year, month),
      heatmap: heatmapInfoTimeslots,
    };
  }

  /* End */
}
