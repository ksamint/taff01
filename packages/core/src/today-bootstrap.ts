import {
  type CalendarRange,
  type CalendarViewData,
  calendarCivilTime,
  calendarWallToInstant,
  type Me,
  type Member,
  meSchema,
  type Run,
  type Task,
  type TodayBootstrap,
  type TodayBootstrapQuery,
  todayBootstrapQuerySchema,
  todayBootstrapSchema,
} from "@taff/schemas";
import { CoreError, type Principal, userPrincipal } from "./index";

type TodayReads = {
  getMe(userId: string): Promise<Me>;
  listTasks(principal: Principal, workspaceId: string): Promise<Task[]>;
  listMembers(principal: Principal, workspaceId: string): Promise<Member[]>;
  listRuns(principal: Principal, workspaceId: string): Promise<Run[]>;
  listCalendar(
    principal: Principal,
    workspaceId: string,
    range: CalendarRange,
  ): Promise<CalendarViewData>;
};

/** Compose existing independently authorized reads; never read a hinted workspace. */
export function createTodayBootstrap(
  reads: TodayReads,
  clock: () => number = Date.now,
) {
  return async function getTodayBootstrap(
    userId: string,
    input: TodayBootstrapQuery = {},
  ): Promise<TodayBootstrap> {
    const query = todayBootstrapQuerySchema.parse(input);
    const me = meSchema.parse(await reads.getMe(userId));
    if (me.user.id !== userId) throw new CoreError("unauthorized", 401);
    const preferred =
      query.preferredUserId === me.user.id
        ? me.workspaces.find((row) => row.id === query.workspaceId)
        : undefined;
    const workspace = preferred ?? me.workspaces[0];
    if (!workspace) return todayBootstrapSchema.parse({ me, today: null });
    const now = clock();
    const civil = calendarCivilTime(new Date(now), me.user.tz);
    civil.setUTCHours(0, 0, 0, 0);
    const from = calendarWallToInstant(
      civil.toISOString().slice(0, -1),
      me.user.tz,
    );
    civil.setUTCDate(civil.getUTCDate() + 1);
    const to = calendarWallToInstant(
      civil.toISOString().slice(0, -1),
      me.user.tz,
    );
    const principal = userPrincipal(userId);
    const workspaceId = workspace.id;
    const [tasks, members, runs, calendar] = await Promise.all([
      reads.listTasks(principal, workspaceId),
      reads.listMembers(principal, workspaceId),
      reads.listRuns(principal, workspaceId),
      reads.listCalendar(principal, workspaceId, { from, to }),
    ]);
    return todayBootstrapSchema.parse({
      me,
      today: { workspaceId, now, from, to, tasks, members, runs, calendar },
    });
  };
}
