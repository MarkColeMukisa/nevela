import { useMemo } from "react";
import { View } from "react-native";
import { encode } from "uqr";

/**
 * A QR code, drawn from plain views: no image to fetch and no native module to build.
 * Always dark on white, whatever the app's appearance, because that is what a camera reads.
 */
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  // Each row as runs of dark cells, so a row is a handful of views instead of fifty.
  const rows = useMemo(() => {
    const { data } = encode(value, { border: 2 });
    return data.map((row) => {
      const runs: { start: number; length: number }[] = [];
      row.forEach((dark, column) => {
        const last = runs[runs.length - 1];
        if (!dark) return;
        if (last && last.start + last.length === column) last.length += 1;
        else runs.push({ start: column, length: 1 });
      });
      return runs;
    });
  }, [value]);

  // Whole pixels per cell, or the gaps between cells show as hairlines.
  const cell = Math.max(2, Math.floor(size / rows.length));
  const side = cell * rows.length;

  return (
    <View accessible accessibilityRole="image" accessibilityLabel="QR code for your authenticator app" style={{ width: side, height: side, backgroundColor: "#ffffff" }}>
      {rows.map((runs, row) =>
        runs.map((run) => <View key={`${row}-${run.start}`} style={{ position: "absolute", top: row * cell, left: run.start * cell, width: run.length * cell, height: cell, backgroundColor: "#000000" }} />),
      )}
    </View>
  );
}
