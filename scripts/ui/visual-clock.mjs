// Test driver only. Never preload into an ordinary API, worker, or MCP process.
import { AsyncLocalStorage } from "node:async_hooks";
import { Server } from "node:http";

if (process.env.TAFF_VISUAL_API_CLOCK !== "ui-v2")
  throw new Error(
    "Visual API clock requires explicit TAFF_VISUAL_API_CLOCK=ui-v2",
  );

const scope = new AsyncLocalStorage();
const NativeDate = globalThis.Date;
const fixed = NativeDate.parse("2026-10-08T11:20:00Z");
function CaptureDate(...args) {
  if (!new.target)
    return new NativeDate(
      scope.getStore() ? fixed : NativeDate.now(),
    ).toString();
  return Reflect.construct(
    NativeDate,
    args.length ? args : [scope.getStore() ? fixed : NativeDate.now()],
    new.target,
  );
}
Object.setPrototypeOf(CaptureDate, NativeDate);
CaptureDate.prototype = NativeDate.prototype;
CaptureDate.now = () => (scope.getStore() ? fixed : NativeDate.now());
globalThis.Date = CaptureDate;

const emit = Server.prototype.emit;
Server.prototype.emit = function (event, ...args) {
  const request = args[0];
  // These real read handlers calculate relative dates, including the server
  // Calendar first-paint snapshot. Their middleware shares
  // this scope too. Login, auth endpoints, write requests, timers, SQL and other
  // requests retain real time; no response or business calculation is mocked.
  if (
    event === "request" &&
    request.method === "GET" &&
    /^\/api\/(bootstrap\/today|brief|projects\/[0-9a-f-]{36}\/timeline)(?:\?|$)/i.test(
      request.url,
    )
  )
    return scope.run(true, () => emit.call(this, event, ...args));
  return emit.call(this, event, ...args);
};
