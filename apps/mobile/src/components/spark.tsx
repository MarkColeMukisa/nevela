import { View } from "react-native";

/**
 * A small bar chart of counts, oldest first: how many were made each day. Drawn from
 * plain views, so it costs nothing to show a few at once. The last bar is today.
 */
export function Spark({ values, color, muted, height = 32 }: { values: number[]; color: string; muted: string; height?: number }) {
  const most = Math.max(1, ...values);
  return (
    <View accessible accessibilityLabel={`${values.reduce((sum, value) => sum + value, 0)} in the last ${values.length} days`} style={{ height, flexDirection: "row", alignItems: "flex-end", gap: 2 }}>
      {values.map((value, index) => (
        <View
          key={index}
          style={{
            flex: 1,
            // An empty day still shows as a sliver, so the chart reads as thirty days and not as a gap.
            height: value === 0 ? 2 : Math.max(3, Math.round((value / most) * height)),
            borderRadius: 1.5,
            backgroundColor: value === 0 ? muted : color,
            opacity: index === values.length - 1 ? 1 : 0.85,
          }}
        />
      ))}
    </View>
  );
}
