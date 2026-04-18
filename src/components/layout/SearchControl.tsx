"use client";

import { Search } from "lucide-react";
import { useState } from "react";
import SearchModal from "./SearchModal";

export default function SearchControl() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="lg-button-icon shrink-0"
        aria-label="Открыть поиск"
      >
        <Search className="size-[1.15rem]" strokeWidth={1.75} />
      </button>
      <SearchModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
