"use client";

import { useState, useRef, useEffect } from "react";
import { CaretDown } from "@phosphor-icons/react";

export interface DropdownOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface FilterDropdownProps {
  label: string;
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
}

export default function FilterDropdown({ label, options, value, onChange }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div className="filter-dropdown" ref={ref}>
      {label && <div className="filter-dropdown__label">{label}</div>}
      <button
        className="filter-dropdown__trigger"
        onClick={() => setOpen(!open)}
        type="button"
      >
        <span className="filter-dropdown__selected">
          {selected?.icon && <span className="filter-dropdown__icon">{selected.icon}</span>}
          <span>{selected?.label || "All"}</span>
        </span>
        <CaretDown
          size={12}
          weight="bold"
          className={`filter-dropdown__caret ${open ? "filter-dropdown__caret--open" : ""}`}
        />
      </button>

      {open && (
        <div className="filter-dropdown__menu">
          {options.map((opt) => (
            <button
              key={opt.value}
              className={`filter-dropdown__item ${opt.value === value ? "filter-dropdown__item--active" : ""}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              type="button"
            >
              {opt.icon && <span className="filter-dropdown__icon">{opt.icon}</span>}
              <span>{opt.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
