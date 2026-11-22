import { useDndContext } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import type { WritingExplorerCategory } from "../../types";

export type ExplorerDragType = "book" | "chapter" | "page";
export type ExplorerDragData = {
  type: ExplorerDragType;
  itemId: string;
  projectId: string;
  chapterId?: string;
  category?: WritingExplorerCategory;
  title: string;
};

export const explorerSortableId = (type: ExplorerDragType, itemId: string) => `${type}-${itemId}`;

interface SortableExplorerItemProps {
  id: string;
  type: ExplorerDragType;
  projectId: string;
  chapterId?: string;
  category?: WritingExplorerCategory;
  title: string;
  className: string;
  disabled?: boolean;
  expanded?: boolean;
  selected?: boolean;
  children: ReactNode;
}

export function SortableExplorerItem({
  id,
  type,
  projectId,
  chapterId,
  category,
  title,
  className,
  disabled = false,
  expanded,
  selected,
  children,
}: SortableExplorerItemProps) {
  const { active } = useDndContext();
  const {
    attributes, isDragging, isOver, listeners, setActivatorNodeRef, setNodeRef, transform, transition,
  } = useSortable({ id: explorerSortableId(type, id), disabled, data: { type, itemId: id, projectId, chapterId, category, title } satisfies ExplorerDragData });
  const { role: dragRole, tabIndex: dragTabIndex, ...dragAttributes } = attributes;
  const activeData = active?.data.current as ExplorerDragData | undefined;
  const pageDropTarget = type === "chapter" && activeData?.type === "page" && isOver;

  return (
    <div
      ref={setNodeRef}
      role="treeitem"
      aria-expanded={expanded}
      aria-selected={selected}
      className={`${className}${isOver ? " studio-dnd-is-over" : ""}${pageDropTarget ? " studio-dnd-page-target" : ""}${isDragging ? " studio-dnd-dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <span
        ref={setActivatorNodeRef}
        className="studio-tree-drag-handle"
        role={dragRole ?? "button"}
        tabIndex={dragTabIndex ?? (disabled ? -1 : 0)}
        aria-label={`Drag ${title || type}`}
        title={`Drag ${title || type}`}
        {...dragAttributes}
        {...listeners}
        onClick={(event) => event.stopPropagation()}
      ><GripVertical size={12} /></span>
      {children}
    </div>
  );
}
