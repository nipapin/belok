"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from "react";

const POPULAR_DOMAINS = [
  "gmail.com",
  "yandex.ru",
  "ya.ru",
  "mail.ru",
  "yahoo.com",
  "outlook.com",
  "hotmail.com",
  "icloud.com",
  "list.ru",
  "bk.ru",
  "inbox.ru",
  "rambler.ru",
  "proton.me",
] as const;

interface EmailAutocompleteInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  value: string;
  onChange: (value: string) => void;
  domains?: readonly string[];
}

function buildSuggestions(value: string, domains: readonly string[]): string[] {
  const atIdx = value.indexOf("@");
  const local = atIdx === -1 ? value : value.slice(0, atIdx);
  if (!local) return [];

  if (atIdx === -1) return domains.map((d) => `${local}@${d}`);

  const fragment = value.slice(atIdx + 1).toLowerCase();
  const matches = fragment ? domains.filter((d) => d.startsWith(fragment) && d !== fragment) : domains;
  return matches.map((d) => `${local}@${d}`);
}

const EmailAutocompleteInput = forwardRef<HTMLInputElement, EmailAutocompleteInputProps>(function EmailAutocompleteInput(
  { value, onChange, domains = POPULAR_DOMAINS, onKeyDown, ...inputProps },
  ref,
) {
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const suggestions = useMemo(() => buildSuggestions(value, domains), [value, domains]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const commit = useCallback(
    (suggestion: string) => {
      onChange(suggestion);
      setOpen(false);
    },
    [onChange],
  );

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    onChange(event.target.value);
    setOpen(true);
    setActiveIndex(0);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;

    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      if (suggestions.length > 0) {
        event.preventDefault();
        setOpen(true);
        setActiveIndex(event.key === "ArrowDown" ? 0 : suggestions.length - 1);
      }
      return;
    }
    if (!open) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((idx) => (idx + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((idx) => (idx - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" && suggestions[activeIndex]) {
      event.preventDefault();
      commit(suggestions[activeIndex]);
    } else if (event.key === "Tab" && suggestions[activeIndex]) {
      // Tab completes the suggestion without leaving the field.
      event.preventDefault();
      commit(suggestions[activeIndex]);
    }
  }

  const showList = open && suggestions.length > 0;

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={ref}
        {...inputProps}
        type="email"
        inputMode="email"
        autoComplete="email"
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        value={value}
        onChange={handleChange}
        onFocus={(e) => {
          setOpen(true);
          inputProps.onFocus?.(e);
        }}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${listboxId}-opt-${activeIndex}` : undefined}
      />
      {showList ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-2xl text-black bg-[#ffffffee] scrollbar-hide"
        >
          {suggestions.map((s, idx) => {
            const at = s.indexOf("@");
            const local = at === -1 ? s : s.slice(0, at);
            const domain = at === -1 ? "" : s.slice(at);
            const isActive = idx === activeIndex;
            return (
              <li
                key={s}
                id={`${listboxId}-opt-${idx}`}
                role="option"
                aria-selected={isActive}
                className={"flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors text-black"}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  commit(s);
                }}
              >
                <span className="truncate text-black">
                  <span>{local}</span>
                  <span className="font-medium text-black">{domain}</span>
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
});

export default EmailAutocompleteInput;
