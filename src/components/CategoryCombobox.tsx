import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, Plus, Tag } from "lucide-react";
import { useLanguage } from "./language-provider";

const categories = [
  "Art & Photography",
  "Biography & Memoir",
  "Business & Economics",
  "Children's Books",
  "Comics & Graphic Novels",
  "Cooking & Food",
  "Education & Reference",
  "Fantasy",
  "Fiction",
  "Historical Fiction",
  "History",
  "Horror",
  "Humor",
  "Literary Fiction",
  "Mystery & Detective",
  "Nonfiction",
  "Philosophy",
  "Poetry",
  "Politics & Social Sciences",
  "Religion & Spirituality",
  "Romance",
  "Science",
  "Science Fiction",
  "Self-Help & Personal Development",
  "Sports & Recreation",
  "Technology",
  "Thriller & Suspense",
  "Travel",
  "Uncategorized",
  "Young Adult",
];

interface CategoryOption {
  value: string;
  custom?: boolean;
}

interface CategoryComboboxProps {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}

export default function CategoryCombobox({ label, placeholder, value, onChange }: CategoryComboboxProps) {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const listboxId = useId();
  const query = value.trim();
  const options = useMemo<CategoryOption[]>(() => {
    const matching = categories.filter((category) => category.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
    const exactMatch = categories.some((category) => category.toLocaleLowerCase() === query.toLocaleLowerCase());
    return [
      ...matching.map((category) => ({ value: category })),
      ...(query && !exactMatch ? [{ value: query, custom: true }] : []),
    ];
  }, [query]);

  useEffect(() => {
    if (!isOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [isOpen]);

  const chooseOption = (option: CategoryOption) => {
    onChange(option.value);
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!isOpen) {
        setActiveIndex(0);
        setIsOpen(true);
        return;
      }
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((index) => (index + direction + options.length) % options.length);
    } else if (event.key === "Enter" && isOpen && options[activeIndex]) {
      event.preventDefault();
      chooseOption(options[activeIndex]);
    } else if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      setIsOpen(false);
    } else if (event.key === "Tab") {
      setIsOpen(false);
    }
  };

  return (
    <div className={`category-combobox${isOpen ? " is-open" : ""}`} ref={rootRef}>
      <label className="category-combobox-label" htmlFor={inputId}>{label}</label>
      <div className="category-combobox-input-shell">
        <Tag size={14} aria-hidden="true" />
        <input
          ref={inputRef}
          id={inputId}
          className="category-combobox-input"
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          aria-activedescendant={isOpen && options[activeIndex] ? `${listboxId}-option-${activeIndex}` : undefined}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setActiveIndex(0);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          autoComplete="off"
        />
        <button
          className="category-combobox-toggle"
          type="button"
          tabIndex={-1}
          aria-label={isOpen ? t("Close category options") : t("Show category options")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setIsOpen((open) => !open);
            inputRef.current?.focus();
          }}
        >
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      </div>
      {isOpen && (
        <div id={listboxId} className="category-combobox-options" role="listbox" aria-label={label}>
          <div className="category-combobox-options-heading">{t("Category")}</div>
          {options.length ? options.map((option, index) => {
            const selected = option.value.toLocaleLowerCase() === query.toLocaleLowerCase();
            return (
              <div
                id={`${listboxId}-option-${index}`}
                key={`${option.custom ? "custom" : "category"}-${option.value}`}
                role="option"
                aria-selected={selected}
                className="category-combobox-option"
                data-active={activeIndex === index}
                onMouseEnter={() => setActiveIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseOption(option)}
              >
                <span className="category-combobox-option-icon" aria-hidden="true">
                  {option.custom ? <Plus size={14} /> : <Tag size={13} />}
                </span>
                <span className="category-combobox-option-name">
                  {option.custom && <small>{t("Use")}:</small>}
                  {option.value}
                </span>
                {selected && <Check size={14} className="category-combobox-option-check" aria-hidden="true" />}
              </div>
            );
          }) : (
            <p className="category-combobox-empty">{t("No categories found.")}</p>
          )}
        </div>
      )}
    </div>
  );
}
