import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import type { MouseEventHandler, ReactNode } from "react";

type StudioSelectOption = { value: string; label: ReactNode; disabled?: boolean };

interface StudioSelectProps {
  value?: string;
  defaultValue?: string;
  options: StudioSelectOption[];
  ariaLabel: string;
  className?: string;
  onValueChange: (value: string) => void;
  onMouseDown?: MouseEventHandler<HTMLButtonElement>;
}

export function StudioSelect({
  value,
  defaultValue,
  options,
  ariaLabel,
  className = "",
  onValueChange,
  onMouseDown,
}: StudioSelectProps) {
  return (
    <BaseSelect.Root
      value={value}
      defaultValue={defaultValue}
      onValueChange={(nextValue) => {
        if (typeof nextValue === "string") onValueChange(nextValue);
      }}
    >
      <BaseSelect.Trigger className={`studio-select-trigger ${className}`} aria-label={ariaLabel} onMouseDown={onMouseDown}>
        <BaseSelect.Value>{(selectedValue: string | null) => options.find((option) => option.value === selectedValue)?.label ?? selectedValue}</BaseSelect.Value>
        <ChevronDown size={12} aria-hidden="true" />
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className="studio-select-positioner" sideOffset={4} align="start">
          <BaseSelect.Popup className="studio-select-popup">
            <BaseSelect.List>
              {options.map((option) => <BaseSelect.Item key={option.value} value={option.value} disabled={option.disabled} className="studio-select-option">
                <BaseSelect.ItemText>{option.label}</BaseSelect.ItemText>
                <BaseSelect.ItemIndicator className="studio-select-indicator"><Check size={12} /></BaseSelect.ItemIndicator>
              </BaseSelect.Item>)}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
