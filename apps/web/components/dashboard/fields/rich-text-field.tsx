"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BoldIcon, Heading2Icon, Heading3Icon, ItalicIcon, LinkIcon, ListIcon, ListOrderedIcon, Redo2Icon, StrikethroughIcon, TextQuoteIcon, Undo2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isBlankHtml, linkAddress, tidyHtml } from "@/lib/rich";
import { cn } from "@/lib/utils";

type Mark = "bold" | "italic" | "strike" | "link" | "h2" | "h3" | "bullets" | "numbers" | "quote";

/**
 * The editor for a rich text field: a page to type on, and a toolbar of the eleven
 * things that can be done to it.
 *
 * It is the browser's own editing (`contentEditable` and `document.execCommand`), with
 * no editor library behind it, so it adds nothing to install or to keep up to date.
 * Browsers disagree on the HTML they write (`<b>` or `<strong>`, `<div>` or `<p>`);
 * Laravel settles that when it cleans what is saved, and sends back the one spelling.
 */
export function RichTextField({
  id,
  value,
  onChange,
  invalid,
  disabled,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const page = useRef<HTMLDivElement>(null);
  /** What the page last said it holds. A value that differs came from outside: a record loading, a form resetting. */
  const said = useRef<string | null>(null);
  /** Where the cursor was when the link box opened, since typing an address moves it away. */
  const place = useRef<Range | null>(null);
  const [marks, setMarks] = useState<Partial<Record<Mark, boolean>>>({});
  const [linking, setLinking] = useState(false);
  const [address, setAddress] = useState("");

  useEffect(() => {
    const element = page.current;
    if (element && value !== said.current) {
      element.innerHTML = value;
      said.current = value;
    }
  }, [value]);

  /** The nearest tag of this name around the cursor, inside the page. */
  const around = useCallback((tag: string): Element | null => {
    const selection = window.getSelection();
    const node = selection && selection.rangeCount > 0 ? selection.anchorNode : null;
    const element = node instanceof Element ? node : (node?.parentElement ?? null);
    const found = element?.closest(tag) ?? null;
    return found && page.current?.contains(found) ? found : null;
  }, []);

  const look = useCallback(() => {
    if (!page.current || !page.current.contains(window.getSelection()?.anchorNode ?? null)) return;
    setMarks({
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      strike: document.queryCommandState("strikeThrough"),
      bullets: document.queryCommandState("insertUnorderedList"),
      numbers: document.queryCommandState("insertOrderedList"),
      link: around("a") !== null,
      h2: around("h2") !== null,
      h3: around("h3") !== null,
      quote: around("blockquote") !== null,
    });
  }, [around]);

  useEffect(() => {
    document.addEventListener("selectionchange", look);
    return () => document.removeEventListener("selectionchange", look);
  }, [look]);

  const say = useCallback(() => {
    const element = page.current;
    if (!element) return;
    // Emptied, a page still holds the paragraph the cursor sits in.
    const html = isBlankHtml(element.innerHTML) ? "" : element.innerHTML;
    said.current = html;
    onChange(html);
  }, [onChange]);

  const run = useCallback(
    (command: string, argument?: string) => {
      page.current?.focus();
      document.execCommand(command, false, argument);
      say();
      look();
    },
    [say, look],
  );

  /** A heading is a kind of line: pressed again, the line goes back to being a paragraph. */
  const heading = (tag: "h2" | "h3") => run("formatBlock", around(tag) ? "p" : tag);
  const quote = () => (around("blockquote") ? run("outdent") : run("formatBlock", "blockquote"));

  function openLink(open: boolean) {
    if (open) {
      const selection = window.getSelection();
      place.current = selection && selection.rangeCount > 0 && page.current?.contains(selection.anchorNode) ? selection.getRangeAt(0).cloneRange() : null;
      setAddress(around("a")?.getAttribute("href") ?? "");
    }
    setLinking(open);
  }

  function applyLink(typed: string) {
    setLinking(false);
    const href = linkAddress(typed);
    // After the box has closed and handed the cursor back.
    window.setTimeout(() => {
      const element = page.current;
      if (!element) return;
      element.focus();
      const selection = window.getSelection();
      if (place.current && selection) {
        selection.removeAllRanges();
        selection.addRange(place.current);
      }
      if (href === "") {
        run("unlink");
      } else if (selection?.isCollapsed && !around("a")) {
        // Nothing selected to make a link of: the address is its own words.
        const text = href.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
        run("insertHTML", `<a href="${text}">${text}</a>`);
      } else {
        run("createLink", href);
      }
    }, 0);
  }

  const tools: { mark?: Mark; label: string; icon: React.ReactNode; press: () => void }[][] = [
    [
      { mark: "bold", label: "Bold", icon: <BoldIcon />, press: () => run("bold") },
      { mark: "italic", label: "Italic", icon: <ItalicIcon />, press: () => run("italic") },
      { mark: "strike", label: "Strikethrough", icon: <StrikethroughIcon />, press: () => run("strikeThrough") },
    ],
    [
      { mark: "h2", label: "Heading", icon: <Heading2Icon />, press: () => heading("h2") },
      { mark: "h3", label: "Smaller heading", icon: <Heading3Icon />, press: () => heading("h3") },
      { mark: "bullets", label: "Bullet list", icon: <ListIcon />, press: () => run("insertUnorderedList") },
      { mark: "numbers", label: "Numbered list", icon: <ListOrderedIcon />, press: () => run("insertOrderedList") },
      { mark: "quote", label: "Quote", icon: <TextQuoteIcon />, press: quote },
    ],
  ];
  const history = [
    { label: "Undo", icon: <Undo2Icon />, press: () => run("undo") },
    { label: "Redo", icon: <Redo2Icon />, press: () => run("redo") },
  ];

  const tool = (item: { mark?: Mark; label: string; icon: React.ReactNode; press: () => void }) => (
    <Button
      key={item.label}
      type="button"
      variant="ghost"
      size="icon-sm"
      title={item.label}
      aria-label={item.label}
      aria-pressed={item.mark ? Boolean(marks[item.mark]) : undefined}
      disabled={disabled}
      className={cn("size-7", item.mark && marks[item.mark] && "bg-accent text-accent-foreground")}
      // Pressing a tool must not take the cursor out of the page.
      onMouseDown={(event) => event.preventDefault()}
      onClick={item.press}
    >
      {item.icon}
    </Button>
  );

  return (
    <div
      className={cn(
        "rounded-md border border-input shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30",
        invalid && "border-destructive ring-destructive/20 dark:ring-destructive/40",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-b border-input px-1.5 py-1">
        {tools[0].map(tool)}
        <Popover open={linking} onOpenChange={openLink}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              title="Link"
              aria-label="Link"
              aria-pressed={Boolean(marks.link)}
              disabled={disabled}
              className={cn("size-7", marks.link && "bg-accent text-accent-foreground")}
              onMouseDown={(event) => event.preventDefault()}
            >
              <LinkIcon />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80">
            {/* Not a form: this sits inside the record's own form, and a form can't hold another. */}
            <div className="flex flex-col gap-2">
              <Input
                autoFocus
                value={address}
                placeholder="https://example.com"
                aria-label="Link address"
                onChange={(event) => setAddress(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    applyLink(address);
                  }
                }}
              />
              <div className="flex justify-end gap-2">
                {marks.link && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => applyLink("")}>
                    Remove link
                  </Button>
                )}
                <Button type="button" size="sm" onClick={() => applyLink(address)}>
                  Apply
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <span aria-hidden className="mx-1 h-5 w-px bg-border" />
        {tools[1].map(tool)}
        <span aria-hidden className="mx-1 h-5 w-px bg-border" />
        {history.map(tool)}
      </div>
      <div
        ref={page}
        id={id}
        role="textbox"
        aria-multiline="true"
        aria-invalid={invalid || undefined}
        aria-placeholder={placeholder}
        data-placeholder={placeholder}
        contentEditable={!disabled}
        suppressContentEditableWarning
        className="rich-text max-h-[32rem] min-h-40 overflow-y-auto px-3 py-2 text-base outline-none empty:before:pointer-events-none empty:before:text-muted-foreground empty:before:content-[attr(data-placeholder)] md:text-sm"
        onFocus={() => document.execCommand("defaultParagraphSeparator", false, "p")}
        onInput={say}
        onBlur={say}
        onPaste={(event) => {
          event.preventDefault();
          const html = event.clipboardData.getData("text/html");
          if (html) run("insertHTML", tidyHtml(html));
          else run("insertText", event.clipboardData.getData("text/plain"));
        }}
      />
    </div>
  );
}
