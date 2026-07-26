/**
 * Option shape for searchable single-select pickers.
 *
 * This type lives outside `@/components/ListPickerModal` so that pure reference
 * data (`src/data/componentCatalog.ts`) can be typed by it without importing a
 * React Native component — that import would drag `react-native`,
 * `react-native-safe-area-context` and `@expo/vector-icons` into any non-RN
 * build that vendors the catalogs. See __tests__/purity.test.ts.
 */
export type PickerOption = {
  value: string;
  /** Optional grouping used for filter chips (e.g. powder maker). */
  group?: string;
  /** Optional secondary line (e.g. burn-rate hint). */
  note?: string;
};
