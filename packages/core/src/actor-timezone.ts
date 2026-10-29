import {
  agentTokens,
  type Database,
  members,
  type Transaction,
  user,
} from "@taff/db";
import { and, eq } from "drizzle-orm";
import { CoreError, type Principal } from "./index";
import type { Actor } from "./permissions";

/** Actor-relative dates use the human caller or the token issuer's saved zone. */
export async function actorTimeZone(
  q: Database | Transaction,
  principal: Principal,
  actor?: Actor,
): Promise<{ userId: string; timeZone: string }> {
  const personId =
    principal.kind === "user"
      ? principal.userId
      : actor &&
        (
          await q
            .select({ userId: members.userId })
            .from(agentTokens)
            .innerJoin(
              members,
              and(
                eq(members.id, agentTokens.createdBy),
                eq(members.workspaceId, actor.workspaceId),
              ),
            )
            .where(
              and(
                eq(agentTokens.id, principal.tokenId),
                eq(agentTokens.workspaceId, actor.workspaceId),
                eq(agentTokens.memberId, actor.id),
              ),
            )
        )[0]?.userId;
  if (!personId) throw new CoreError("unauthorized", 401);
  const [person] = await q
    .select({ tz: user.tz })
    .from(user)
    .where(eq(user.id, personId));
  if (!person) throw new CoreError("unauthorized", 401);
  return { userId: personId, timeZone: person.tz };
}

export async function zoneOf(
  q: Database | Transaction,
  p: Principal,
  actor?: Actor,
): Promise<string> {
  return (await actorTimeZone(q, p, actor)).timeZone;
}
