"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui";

export function PrintButton() {
  return (
    <Button variant="secondary" onClick={() => window.print()} className="w-full">
      <Printer className="size-4" /> Печать чека
    </Button>
  );
}
