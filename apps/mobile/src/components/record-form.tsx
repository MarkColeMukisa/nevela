import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View, type TextInputProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PictureField } from "@/components/pictures";
import { Body, Button, Field, Notice } from "@/components/ui";
import { api, ApiError, messageOf } from "@/lib/api";
import { filesOf, fromLocalInput, toLocalInput, type StoredFile } from "@/lib/format";
import { isPlainRich, richToText, textToRich } from "@/lib/rich";
import { applies, fieldLabel, optionLabel, relatedTitles, titleOf, useResources, type FieldSpec, type Resource, type ResourceRecord } from "@/lib/resources";
import { radius, spacing, text, useColors } from "@/lib/theme";

/**
 * The form for a record of any resource, drawn from its description: a text box, a
 * switch, a list to choose from or a search of another resource, by each field's kind.
 *
 * Laravel checks everything again when it is saved, and its complaint about a field is
 * shown under that field. Pictures are chosen or taken on the phone and sent as they are
 * picked. Rich text is typed as paragraphs (lib/rich.ts). Other files and JSON are the
 * dashboard's to edit for now: they are left exactly as they are when a record is saved from here.
 */

type Values = Record<string, unknown>;

/** A file field that takes pictures and nothing else: the kind a phone can fill from its camera or library. */
export function takesPictures(field: FieldSpec): boolean {
  return field.kind === "file" && (field.accept?.length ?? 0) > 0 && (field.accept ?? []).every((kind) => kind === "image");
}

/** Whether the form has a control for a field. */
function editable(field: FieldSpec): boolean {
  if (field.kind === "file") return takesPictures(field);
  return field.kind !== "json" && !field.auto;
}

/** A record's value as its control holds it: text for anything typed. */
export function toControl(field: FieldSpec, value: unknown): unknown {
  // A picture field holds the key of its file, or the keys of its files.
  if (field.kind === "file") return field.multiple ? (Array.isArray(value) ? value : []) : value || null;
  if (field.kind === "boolean") return Boolean(value);
  if (field.kind === "enum" || field.kind === "belongsTo") return value === null || value === undefined || value === "" ? null : String(value);
  if (field.kind === "datetime") return toLocalInput(value);
  if (field.kind === "date") return value ? String(value).slice(0, 10) : "";
  if (isRich(field)) {
    // Formatting the phone can't keep is kept as it is, until the person chooses to drop it.
    const html = value === null || value === undefined ? "" : String(value);
    return isPlainRich(html) ? richToText(html) : ({ kept: html } satisfies Kept);
  }
  return value === null || value === undefined ? "" : String(value);
}

/** Rich text with formatting a phone can't edit, held as it came. */
interface Kept {
  kept: string;
}

const isKept = (held: unknown): held is Kept => typeof held === "object" && held !== null && "kept" in held;

/** A text field whose value is HTML, written in the dashboard's editor. */
const isRich = (field: FieldSpec): boolean => field.kind === "text" && field.format === "rich";

/** What a control holds, as the API takes it. `problem` when it can't be: letters in a number. */
export function fromControl(field: FieldSpec, held: unknown): { value?: unknown; problem?: string } {
  if (field.kind === "file") return { value: field.multiple ? (Array.isArray(held) ? held : []) : held || null };
  if (field.kind === "boolean") return { value: Boolean(held) };
  if (field.kind === "enum" || field.kind === "belongsTo") return { value: held ?? null };
  if (isKept(held)) return { value: held.kept === "" ? null : held.kept };
  if (isRich(field)) {
    const html = textToRich(String(held ?? ""));
    return { value: html === "" ? null : html };
  }
  const typed = String(held ?? "").trim();
  if (typed === "") return { value: null };
  if (field.kind === "int" || field.kind === "float") {
    const amount = Number(typed.replace(/,/g, ""));
    if (Number.isNaN(amount) || (field.kind === "int" && !Number.isInteger(amount))) return { problem: field.kind === "int" ? "Enter a whole number." : "Enter a number." };
    return { value: amount };
  }
  if (field.kind === "date") return fromLocalInput(`${typed} 00:00`) ? { value: typed } : { problem: "Write the date as 2026-11-15." };
  if (field.kind === "datetime") {
    const iso = fromLocalInput(typed);
    return iso ? { value: iso } : { problem: "Write the date and time as 2026-11-15 14:30." };
  }
  return { value: field.kind === "text" ? String(held) : typed };
}

const KEYBOARDS: Record<string, TextInputProps> = {
  email: { keyboardType: "email-address", autoCapitalize: "none", autoCorrect: false },
  url: { keyboardType: "url", autoCapitalize: "none", autoCorrect: false },
  tel: { keyboardType: "phone-pad" },
  slug: { autoCapitalize: "none", autoCorrect: false },
  domain: { keyboardType: "url", autoCapitalize: "none", autoCorrect: false },
  color: { autoCapitalize: "none", autoCorrect: false, placeholder: "#0a0a0a" },
  time: { placeholder: "09:30", keyboardType: "numbers-and-punctuation" },
  country: { autoCapitalize: "characters", placeholder: "UG", maxLength: 2 },
};

export function RecordForm({ resource, record, onSaved }: { resource: Resource; record?: ResourceRecord; onSaved: (saved: ResourceRecord) => void }) {
  const fields = useMemo(() => Object.entries(resource.fields).filter(([, field]) => editable(field)), [resource]);
  const [values, setValues] = useState<Values>(() =>
    Object.fromEntries(fields.map(([name, field]) => [name, toControl(field, record ? record[name] : field.default)])),
  );
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const set = (name: string, value: unknown) => {
    setValues((current) => ({ ...current, [name]: value }));
    setProblems((current) => (current[name] ? { ...current, [name]: "" } : current));
  };

  const shown = fields.filter(([, field]) => applies(field, values));
  // What the form can't put right itself: a required picture, say.
  const left = Object.entries(resource.fields).filter(([, field]) => !record && !editable(field) && !field.auto && field.required !== false && field.default === undefined);

  const save = async () => {
    const payload: Values = {};
    const found: Record<string, string> = {};
    for (const [name, field] of shown) {
      const { value, problem } = fromControl(field, values[name]);
      if (problem) found[name] = problem;
      else if (record) {
        // A change sends only what changed, so what this form doesn't show stays as it is.
        if (JSON.stringify(value) !== JSON.stringify(fromControl(field, toControl(field, record[name])).value)) payload[name] = value;
      } else if (value !== null && !(Array.isArray(value) && value.length === 0)) payload[name] = value;
    }
    setProblems(found);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    setError(null);
    try {
      const saved = record
        ? Object.keys(payload).length === 0
          ? record
          : // updatedAt goes back, so a save is refused if someone else saved since it was read.
            await api.patch<ResourceRecord>(`/${resource.slug}/${encodeURIComponent(record.id)}`, { ...payload, updatedAt: record.updatedAt })
        : await api.post<ResourceRecord>(`/${resource.slug}`, payload);
      onSaved(saved);
    } catch (caught) {
      setError(caught);
      if (caught instanceof ApiError) setProblems(Object.fromEntries(caught.issues.filter((issue) => issue.path in resource.fields).map((issue) => [issue.path, issue.message])));
    } finally {
      setBusy(false);
    }
  };

  // Complaints with no control to sit under: said at the top, with the field's name.
  const names = new Set(shown.map(([name]) => name));
  const unplaced = error instanceof ApiError ? error.issues.filter((issue) => !names.has(issue.path)) : [];
  const conflict = error instanceof ApiError && error.code === "CHANGED_SINCE_READ";

  return (
    <>
      {conflict ? <Notice>Someone else saved this {resource.label.toLowerCase()} while you had it open, so nothing was changed. Go back and open it again to see their version.</Notice> : null}
      {error && !conflict && (!(error instanceof ApiError) || error.issues.length === 0) ? <Notice>{messageOf(error)}</Notice> : null}
      {unplaced.length > 0 ? <Notice>{unplaced.map((issue) => issue.message).join(" ")}</Notice> : null}
      {left.length > 0 ? <Notice>{left.map(([name, field]) => fieldLabel(name, field)).join(", ")} can't be set from the app yet. Create this {resource.label.toLowerCase()} in the dashboard.</Notice> : null}

      {shown.map(([name, field]) => (
        <Control key={name} name={name} field={field} resource={resource} record={record} value={values[name]} problem={problems[name] || undefined} creating={!record} onChange={(value) => set(name, value)} />
      ))}

      <Button label={record ? "Save changes" : `Create ${resource.label.toLowerCase()}`} busy={busy} onPress={save} />
    </>
  );
}

export function Control({ name, field, resource, record, value, problem, creating, onChange }: { name: string; field: FieldSpec; resource: Resource; record?: ResourceRecord; value: unknown; problem?: string; creating: boolean; onChange: (value: unknown) => void }) {
  const colors = useColors();
  // A slug made from another field may be left empty on a new record: Laravel writes it.
  const optional = field.required === false || (creating && field.format === "slug" && Boolean(field.from));
  const label = `${fieldLabel(name, field)}${optional ? " (optional)" : ""}`;

  if (field.kind === "file") {
    // The pictures the record already has, by key, so each can be shown before anything is sent.
    const known: Record<string, StoredFile> = {};
    if (record) for (const file of filesOf(name, field, record) as (StoredFile & { key?: string })[]) if (file.key) known[file.key] = file;
    return <PictureField label={label} resource={resource.name} name={name} many={Boolean(field.multiple)} value={value as string | string[] | null} known={known} problem={problem} onChange={onChange} />;
  }
  if (field.kind === "boolean") {
    return (
      <View style={{ gap: spacing.xs }}>
        <View style={styles.switchRow}>
          <Text style={{ flex: 1, color: colors.text, fontSize: text.body }}>{fieldLabel(name, field)}</Text>
          <Switch accessibilityLabel={fieldLabel(name, field)} value={Boolean(value)} onValueChange={onChange} />
        </View>
        {problem ? <Text style={{ color: colors.danger, fontSize: text.small }}>{problem}</Text> : null}
      </View>
    );
  }
  if (field.kind === "enum") {
    const options = (field.options ?? []).map((option) => ({ value: option, label: optionLabel(field, option) }));
    return <Choice label={label} problem={problem} shown={value ? optionLabel(field, String(value)) : ""} options={options} value={value as string | null} clearable={optional} onChange={onChange} />;
  }
  if (field.kind === "belongsTo") {
    return <Related label={label} field={field} problem={problem} value={value as string | null} clearable={optional} onChange={onChange} />;
  }
  if (isKept(value)) {
    return (
      <View style={{ gap: spacing.xs }}>
        <Text style={{ color: colors.text, fontSize: text.small, fontWeight: "600" }}>{label}</Text>
        <Text numberOfLines={4} style={{ color: colors.muted, fontSize: text.body }}>{richToText(value.kept)}</Text>
        <Body muted small>It has formatting, such as bold, links or lists, that the app can't edit, so it is kept as it is.</Body>
        <Button variant="link" label="Edit as plain text, without the formatting" onPress={() => onChange(richToText(value.kept))} />
        {problem ? <Text style={{ color: colors.danger, fontSize: text.small }}>{problem}</Text> : null}
      </View>
    );
  }

  const numeric = field.kind === "int" || field.kind === "float";
  return (
    <Field
      label={label}
      error={problem}
      value={String(value ?? "")}
      onChangeText={onChange}
      multiline={field.kind === "text"}
      style={field.kind === "text" ? { minHeight: 112, paddingTop: spacing.md, textAlignVertical: "top" } : undefined}
      maxLength={field.maxLength}
      {...(numeric ? { keyboardType: field.kind === "int" ? "number-pad" : "decimal-pad" } : {})}
      {...(field.kind === "date" ? { placeholder: "2026-11-15", keyboardType: "numbers-and-punctuation" } : {})}
      {...(field.kind === "datetime" ? { placeholder: "2026-11-15 14:30", keyboardType: "numbers-and-punctuation" } : {})}
      {...(field.format ? KEYBOARDS[field.format] : {})}
    />
  );
}

/** A box that shows what was chosen and opens a list to choose from. */
function Chosen({ label, shown, problem, onPress }: { label: string; shown: string; problem?: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={{ color: colors.text, fontSize: text.small, fontWeight: "600" }}>{label}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.chosen, { borderColor: problem ? colors.danger : colors.border }]}>
        <Text numberOfLines={1} style={{ flex: 1, color: shown ? colors.text : colors.muted, fontSize: text.body }}>{shown || "Choose…"}</Text>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
      {problem ? <Text style={{ color: colors.danger, fontSize: text.small }}>{problem}</Text> : null}
    </View>
  );
}

interface Option {
  value: string;
  label: string;
}

/** The list a choice is made from, over the whole screen, with a search box when there is something to search. */
function Sheet({ title, options, value, clearable, search, onSearch, empty, onPick, onClose }: { title: string; options: Option[]; value: string | null; clearable: boolean; search?: string; onSearch?: (text: string) => void; empty?: string; onPick: (value: string | null) => void; onClose: () => void }) {
  const colors = useColors();
  return (
    <Modal animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={styles.sheetHeader}>
          <Text accessibilityRole="header" style={{ flex: 1, color: colors.text, fontSize: text.heading, fontWeight: "600" }}>{title}</Text>
          <Button variant="link" label="Close" onPress={onClose} />
        </View>
        {onSearch ? (
          <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.md }}>
            <TextInput accessibilityLabel="Search" placeholder="Search" placeholderTextColor={colors.muted} value={search} onChangeText={onSearch} autoCorrect={false} autoCapitalize="none" style={[styles.search, { color: colors.text, borderColor: colors.border }]} />
          </View>
        ) : null}
        <FlatList
          data={options}
          keyExtractor={(option) => option.value}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<View style={{ padding: spacing.lg }}><Body muted>{empty ?? "Nothing to choose from."}</Body></View>}
          ListHeaderComponent={clearable && value ? <Pressable accessibilityRole="button" onPress={() => onPick(null)} style={styles.option}><Text style={{ color: colors.muted, fontSize: text.body }}>None</Text></Pressable> : undefined}
          renderItem={({ item }) => (
            <Pressable accessibilityRole="button" accessibilityState={{ selected: item.value === value }} onPress={() => onPick(item.value)} style={[styles.option, { borderTopColor: colors.border }]}>
              <Text style={{ flex: 1, color: colors.text, fontSize: text.body }}>{item.label}</Text>
              {item.value === value ? <Ionicons name="checkmark" size={20} color={colors.brand} /> : null}
            </Pressable>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

/** One of a few fixed values. */
function Choice({ label, shown, problem, options, value, clearable, onChange }: { label: string; shown: string; problem?: string; options: Option[]; value: string | null; clearable: boolean; onChange: (value: string | null) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Chosen label={label} shown={shown} problem={problem} onPress={() => setOpen(true)} />
      {open ? <Sheet title={label} options={options} value={value} clearable={clearable} onPick={(picked) => { onChange(picked); setOpen(false); }} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

/** A record of another resource, found by searching it. */
function Related({ label, field, problem, value, clearable, onChange }: { label: string; field: FieldSpec; problem?: string; value: string | null; clearable: boolean; onChange: (value: string | null) => void }) {
  const { byName } = useResources();
  const target = field.target ? byName(field.target) : undefined;
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [shown, setShown] = useState("");
  const [failed, setFailed] = useState<string | null>(null);

  // What the chosen record is called.
  useEffect(() => {
    let live = true;
    if (!value || !target) {
      setShown("");
      return;
    }
    relatedTitles(target, [value]).then((found) => {
      if (live) setShown(found[value] ?? "");
    });
    return () => {
      live = false;
    };
  }, [value, target]);

  // The list, a moment after the typing stops.
  useEffect(() => {
    if (!open || !target) return;
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const { data } = await api.get<{ data: ResourceRecord[] }>(`/${target.slug}`, { q: search.trim(), perPage: 30 });
        if (live) {
          setOptions(data.map((record) => ({ value: record.id, label: titleOf(target, record) })));
          setFailed(null);
        }
      } catch (caught) {
        if (live) setFailed(messageOf(caught));
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [open, search, target]);

  if (!target) return null;

  return (
    <>
      <Chosen label={label} shown={shown || (value ? "…" : "")} problem={problem} onPress={() => setOpen(true)} />
      {open ? (
        <Sheet
          title={label}
          options={options}
          value={value}
          clearable={clearable}
          search={search}
          onSearch={setSearch}
          empty={failed ?? (search ? `No ${target.pluralLabel.toLowerCase()} match "${search}".` : `No ${target.pluralLabel.toLowerCase()} yet.`)}
          onPick={(picked) => { onChange(picked); setOpen(false); setSearch(""); }}
          onClose={() => { setOpen(false); setSearch(""); }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  switchRow: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: spacing.md },
  chosen: { minHeight: 48, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  sheetHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  search: { minHeight: 44, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, fontSize: text.body },
  option: { minHeight: 52, paddingHorizontal: spacing.lg, flexDirection: "row", alignItems: "center", gap: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
});
