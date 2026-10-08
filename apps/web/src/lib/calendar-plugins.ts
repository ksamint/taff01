import { createDragAndDropPlugin } from "@schedule-x/drag-and-drop";

// Calendar v4 renamed these entry points. Keep the MIT v3 plugin itself: its
// render hook initializes state used by the bound legacy methods (ADR 0006).
export function createCalendarDragPlugin() {
  const plugin = createDragAndDropPlugin(15);
  return Object.assign(plugin, {
    startTimeGridDrag: plugin.createTimeGridDragHandler.bind(plugin),
    startDateGridDrag: plugin.createDateGridDragHandler.bind(plugin),
    startMonthGridDrag: plugin.createMonthGridDragHandler.bind(plugin),
  });
}
