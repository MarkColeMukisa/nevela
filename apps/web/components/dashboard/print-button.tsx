"use client";

import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import "./print-record.css";

/** Prints the record on the page, without the dashboard around it: see print-record.css. */
export function PrintButton() {
  return (
    <Button variant="outline" onClick={() => window.print()}>
      <PrinterIcon data-icon="inline-start" />
      Print
    </Button>
  );
}
