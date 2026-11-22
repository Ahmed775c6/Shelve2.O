import type { MouseEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

type ResizeDirection = Parameters<ReturnType<typeof getCurrentWindow>["startResizeDragging"]>[0];

const edges: { name: string; direction: ResizeDirection }[] = [
  { name: "north", direction: "North" },
  { name: "north-east", direction: "NorthEast" },
  { name: "east", direction: "East" },
  { name: "south-east", direction: "SouthEast" },
  { name: "south", direction: "South" },
  { name: "south-west", direction: "SouthWest" },
  { name: "west", direction: "West" },
  { name: "north-west", direction: "NorthWest" },
];

export default function WindowResizeHandles() {
  if (!isTauri()) return null;

  const startResize = (event: MouseEvent<HTMLDivElement>, direction: ResizeDirection) => {
    if (event.button !== 0) return;
    void getCurrentWindow().startResizeDragging(direction).catch((error: unknown) => {
      console.error("Could not resize the Shelve window:", error);
    });
  };

  return (
    <div className="window-resize-handles" aria-hidden="true">
      {edges.map(({ name, direction }) => (
        <div
          key={name}
          className={`window-resize-handle window-resize-${name}`}
          onMouseDown={(event) => startResize(event, direction)}
        />
      ))}
    </div>
  );
}
