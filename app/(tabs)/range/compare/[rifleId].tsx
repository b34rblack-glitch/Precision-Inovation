import Ionicons from '@expo/vector-icons/Ionicons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { EmptyState } from '@/components/EmptyState';
import { CollapsibleSection, Segmented } from '@/components/Form';
import { HBarChart, type HBarRow } from '@/components/charts/HBarChart';
import { XYChart, type XYSeries } from '@/components/charts/XYChart';
import { RangeSlider } from '@/components/RangeSlider';
import { Screen } from '@/components/Screen';
import {
  allDopeEntriesQuery,
  allLoadVersionsQuery,
  allShotStringsQuery,
  allWorkupStepsQuery,
  sessionsForRifleQuery,
  workupsForRifleQuery,
} from '@/db/repositories/compare';
import { activeLoadsQuery } from '@/db/repositories/loads';
import { activeRiflesQuery } from '@/db/repositories/rifles';
import {
  applyFilters,
  bestGroups,
  buildCompareModel,
  dataExtent,
  dopeCurves,
  groupInUnit,
  groupPoints,
  ladderCurves,
  MAX_SERIES,
  velocitySummary,
  velocityTrends,
  type CompareFilters,
  type CompareSource,
  type GroupUnit,
} from '@/lib/compare/model';
import { formatHold, ydToDistance } from '@/lib/units';
import { colors, radii, spacing, type } from '@/theme';

const DAY_MS = 86_400_000;
const VELOCITY_METRICS = ['Avg fps', 'SD fps', 'ES fps'] as const;
const GROUP_UNITS = ['MOA', 'in'] as const;
const SOURCE_CHOICES = ['Both', 'Sessions', 'Workups'] as const;

const shortDate = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export default function CompareLoadsScreen() {
  const { rifleId } = useLocalSearchParams<{ rifleId: string }>();
  const router = useRouter();
  const { data: rifles, updatedAt: riflesLoadedAt } = useLiveQuery(activeRiflesQuery());
  const { data: loads } = useLiveQuery(activeLoadsQuery());
  const { data: versions } = useLiveQuery(allLoadVersionsQuery());
  const { data: sessions } = useLiveQuery(sessionsForRifleQuery(rifleId), [rifleId]);
  const { data: strings } = useLiveQuery(allShotStringsQuery());
  const { data: dope } = useLiveQuery(allDopeEntriesQuery());
  const { data: workups } = useLiveQuery(workupsForRifleQuery(rifleId), [rifleId]);
  const { data: steps } = useLiveQuery(allWorkupStepsQuery());
  const rifle = rifles.find((r) => r.id === rifleId);

  const model = useMemo(
    () =>
      rifle
        ? buildCompareModel({
            rifle: { id: rifle.id, turretUnit: rifle.turretUnit },
            loads,
            versions,
            sessions,
            strings,
            dope,
            workups,
            steps,
          })
        : null,
    [rifle, loads, versions, sessions, strings, dope, workups, steps],
  );
  const extent = useMemo(() => (model ? dataExtent(model) : null), [model]);

  // Filter state. Ranges are null until the reader moves a slider, so new
  // data widens the default window instead of being clipped by a stale one.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [sourceChoice, setSourceChoice] = useState<(typeof SOURCE_CHOICES)[number]>('Both');
  const [dateRange, setDateRange] = useState<[number, number] | null>(null);
  const [distRange, setDistRange] = useState<[number, number] | null>(null);
  const [minShots, setMinShots] = useState(1);
  const [confirmedOnly, setConfirmedOnly] = useState(false);
  const [groupUnit, setGroupUnit] = useState<GroupUnit>('MOA');
  const [velocityMetric, setVelocityMetric] = useState<(typeof VELOCITY_METRICS)[number]>('Avg fps');
  useEffect(() => {
    setHidden(new Set());
    setDateRange(null);
    setDistRange(null);
  }, [rifleId]);

  const dateBounds = extent?.dateMs
    ? ([Math.floor(extent.dateMs[0] / DAY_MS) * DAY_MS, Math.ceil(extent.dateMs[1] / DAY_MS) * DAY_MS] as const)
    : null;
  const distBounds = extent?.distanceYd
    ? ([Math.floor(extent.distanceYd[0] / 25) * 25, Math.ceil(extent.distanceYd[1] / 25) * 25] as const)
    : null;
  const clampTo = (r: [number, number] | null, b: readonly [number, number] | null): [number, number] | null =>
    b === null ? null : r === null ? [b[0], b[1]] : [Math.max(r[0], b[0]), Math.min(r[1], b[1])];
  const effectiveDate = clampTo(dateRange, dateBounds);
  const effectiveDist = clampTo(distRange, distBounds);

  const filters: CompareFilters = useMemo(
    () => ({
      hidden,
      sources: new Set<CompareSource>(
        sourceChoice === 'Both' ? ['session', 'workup'] : sourceChoice === 'Sessions' ? ['session'] : ['workup'],
      ),
      dateRangeMs: dateRange ? effectiveDate : null,
      distanceRangeYd: distRange ? effectiveDist : null,
      minShots,
      confirmedOnly,
    }),
    // effectiveDate/effectiveDist derive from dateRange/distRange and the extent.
    [hidden, sourceChoice, dateRange, distRange, effectiveDate, effectiveDist, minShots, confirmedOnly],
  );
  const shown = useMemo(() => (model ? applyFilters(model, filters) : null), [model, filters]);

  if (!rifle || !model || !shown) {
    if (riflesLoadedAt === undefined) return <Screen underHeader>{null}</Screen>;
    return (
      <Screen underHeader>
        <EmptyState
          icon="alert-circle-outline"
          title="Rifle not found"
          message="This rifle may have been archived or deleted."
          action={{ label: 'Back to Range', onPress: () => router.replace('/range') }}
        />
      </Screen>
    );
  }

  const distUnit = rifle.distanceUnit;
  const fmtDist = (yd: number) => `${Math.round(ydToDistance(yd, distUnit))} ${distUnit}`;
  const fmtHold = (v: number) => `${formatHold(v, rifle.turretUnit)} ${rifle.turretUnit}`;
  const fmtGroup = (v: number) => (groupUnit === 'MOA' ? `${v.toFixed(2)} MOA` : `${v.toFixed(2)} in`);
  const colorOf = (loadId: string) => model.loads.find((l) => l.loadId === loadId)?.color ?? colors.textTertiary;
  const nameOf = (loadId: string) => model.loads.find((l) => l.loadId === loadId)?.name ?? loadId;
  const visibleLoads = model.loads.filter((l) => l.color && !hidden.has(l.loadId));
  const chartable = model.loads.filter((l) => l.color);

  const toggle = (loadId: string) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(loadId)) next.delete(loadId);
      else next.add(loadId);
      return next;
    });

  // --- series ---------------------------------------------------------------
  const summaries = velocitySummary(shown.velocity);
  const metricOf = (s: (typeof summaries)[number]) =>
    velocityMetric === 'Avg fps' ? s.avgFps : velocityMetric === 'SD fps' ? s.sdFps : s.esFps;
  const velocityRows: HBarRow[] = summaries
    .map((s) => ({ s, v: metricOf(s) }))
    .filter((x): x is { s: (typeof summaries)[number]; v: number } => x.v != null)
    .sort((a, b) => (velocityMetric === 'Avg fps' ? b.v - a.v : a.v - b.v))
    .map(({ s, v }) => ({
      key: s.loadId,
      label: nameOf(s.loadId),
      color: colorOf(s.loadId),
      value: v,
      valueText: velocityMetric === 'Avg fps' ? `${Math.round(v)} fps` : `${v.toFixed(1)} fps`,
      detail: [
        s.sdFps != null && velocityMetric !== 'SD fps' ? `SD ${s.sdFps.toFixed(1)}` : null,
        s.esFps != null && velocityMetric !== 'ES fps' ? `ES ${Math.round(s.esFps)}` : null,
        `${s.shots} shots in ${s.strings} ${s.strings === 1 ? 'string' : 'strings'}`,
      ]
        .filter(Boolean)
        .join(' · '),
    }));
  const avgBaseline =
    velocityMetric === 'Avg fps' && velocityRows.length > 1
      ? Math.floor((Math.min(...velocityRows.map((r) => r.value)) - 25) / 25) * 25
      : undefined;

  const toSeries = (map: Map<string, { x: number; y: number }[]>, connect: boolean): XYSeries[] =>
    visibleLoads
      .filter((l) => map.has(l.loadId))
      .map((l) => ({ key: l.loadId, label: l.name, color: l.color!, points: map.get(l.loadId)!, connect }));
  const trendSeries = toSeries(velocityTrends(shown.velocity), true);
  const groupSeries = toSeries(groupPoints(shown.groups, groupUnit), false);
  const dopeSeries = toSeries(dopeCurves(shown.dope), true);
  const ladderMap = ladderCurves(shown.ladders);
  const ladderSeries = toSeries(new Map([...ladderMap].map(([k, v]) => [k, v.points])), true);
  const best = bestGroups(shown.groups, groupUnit);
  const dopeCount = (loadId: string) => shown.dope.filter((d) => d.loadId === loadId).length;

  return (
    <Screen underHeader>
      {rifles.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipRow}
          accessibilityLabel="Rifle"
        >
          {rifles.map((r) => (
            <Chip
              key={r.id}
              label={r.name}
              selected={r.id === rifle.id}
              onPress={() => router.setParams({ rifleId: r.id })}
            />
          ))}
        </ScrollView>
      ) : null}

      {model.loads.length === 0 ? (
        <EmptyState
          icon="flask"
          title="No loads for this rifle"
          message="Assign a load to the rifle, then log sessions or a workup against it to compare."
          action={{ label: 'New Load', onPress: () => router.push(`/loads/new?rifleId=${rifle.id}`) }}
        />
      ) : (
        <>
          <Card>
            <View style={styles.cardHead}>
              <Text style={type.label}>Loads</Text>
              <View style={{ flexDirection: 'row', gap: spacing.md }}>
                <Pressable onPress={() => setHidden(new Set())} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.link}>Show all</Text>
                </Pressable>
                <Pressable
                  onPress={() => setHidden(new Set(chartable.map((l) => l.loadId)))}
                  hitSlop={8}
                  accessibilityRole="button"
                >
                  <Text style={styles.link}>Hide all</Text>
                </Pressable>
              </View>
            </View>
            {model.loads.map((l) => {
              const on = !!l.color && !hidden.has(l.loadId);
              const strings = model.velocity.filter((s) => s.loadId === l.loadId).length;
              const groups = model.groups.filter((g) => g.loadId === l.loadId).length;
              const holds = model.dope.filter((d) => d.loadId === l.loadId).length;
              const tested = strings + groups + holds > 0;
              return (
                <Pressable
                  key={l.loadId}
                  onPress={() => (l.color ? toggle(l.loadId) : undefined)}
                  disabled={!l.color}
                  style={({ pressed }) => [styles.loadRow, pressed && { opacity: 0.7 }]}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: on, disabled: !l.color }}
                  accessibilityLabel={`${l.name}${tested ? '' : ', no results yet'}`}
                >
                  <View style={[styles.swatch, { backgroundColor: l.color ?? colors.border }, !on && styles.swatchOff]} />
                  <View style={{ flex: 1 }}>
                    <Text style={[type.body, !on && { color: colors.textTertiary }]} numberOfLines={1}>
                      {l.name}
                    </Text>
                    <Text style={type.caption} numberOfLines={1}>
                      {[l.bullet, l.chargeGr != null ? `${l.chargeGr} gr` : null].filter(Boolean).join(' · ') ||
                        'No recipe recorded'}
                      {tested
                        ? `  ·  ${strings} strings · ${groups} groups · ${holds} holds`
                        : '  ·  not tested yet'}
                    </Text>
                  </View>
                  <Ionicons
                    name={!l.color ? 'ban-outline' : on ? 'eye' : 'eye-off'}
                    size={20}
                    color={on ? colors.accent : colors.textTertiary}
                  />
                </Pressable>
              );
            })}
            {model.loads.length > MAX_SERIES ? (
              <Text style={[type.caption, { marginTop: spacing.sm, color: colors.textTertiary }]}>
                Only the first {MAX_SERIES} loads can be charted at once; archive one to make room.
              </Text>
            ) : null}
          </Card>

          <CollapsibleSection title="Filters">
            <Segmented label="Data from" options={SOURCE_CHOICES} value={sourceChoice} onChange={setSourceChoice} />
            {dateBounds && effectiveDate ? (
              <RangeSlider
                mode="range"
                label="Dates"
                min={dateBounds[0]}
                max={Math.max(dateBounds[1], dateBounds[0] + DAY_MS)}
                step={DAY_MS}
                value={effectiveDate}
                onChange={setDateRange}
                format={shortDate}
              />
            ) : null}
            {distBounds && effectiveDist ? (
              <RangeSlider
                mode="range"
                label="Distance"
                min={distBounds[0]}
                max={Math.max(distBounds[1], distBounds[0] + 25)}
                step={25}
                value={effectiveDist}
                onChange={setDistRange}
                format={fmtDist}
              />
            ) : null}
            <RangeSlider
              mode="single"
              label="Min shots per string"
              min={1}
              max={Math.max(2, extent?.maxShots ?? 0)}
              step={1}
              value={minShots}
              onChange={setMinShots}
            />
            <Pressable
              onPress={() => setConfirmedOnly((v) => !v)}
              style={styles.checkRow}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: confirmedOnly }}
            >
              <Ionicons
                name={confirmedOnly ? 'checkbox' : 'square-outline'}
                size={22}
                color={confirmedOnly ? colors.accent : colors.textTertiary}
              />
              <Text style={type.body}>Confirmed DOPE only</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setSourceChoice('Both');
                setDateRange(null);
                setDistRange(null);
                setMinShots(1);
                setConfirmedOnly(false);
              }}
              hitSlop={8}
              accessibilityRole="button"
              style={{ alignSelf: 'flex-start', marginTop: spacing.xs }}
            >
              <Text style={styles.link}>Reset filters</Text>
            </Pressable>
          </CollapsibleSection>

          <Card>
            <View style={styles.cardHead}>
              <Text style={type.heading}>Velocity</Text>
            </View>
            <Segmented options={VELOCITY_METRICS} value={velocityMetric} onChange={setVelocityMetric} />
            <HBarChart
              rows={velocityRows}
              baseline={avgBaseline}
              emptyText="No chronograph strings for the loads and filters shown."
            />
          </Card>

          <Card>
            <Text style={[type.heading, styles.chartTitle]}>Velocity over time</Text>
            <Text style={[type.caption, styles.chartSub]}>Each string's average, by date.</Text>
            <XYChart
              series={trendSeries}
              xFormat={shortDate}
              yFormat={(y) => `${Math.round(y)}`}
              emptyText="No chronograph strings for the loads and filters shown."
            />
          </Card>

          <Card>
            <Text style={[type.heading, styles.chartTitle]}>Group size</Text>
            <Text style={[type.caption, styles.chartSub]}>Every recorded group, by distance.</Text>
            <Segmented options={GROUP_UNITS} value={groupUnit} onChange={setGroupUnit} />
            <XYChart
              series={groupSeries}
              xFormat={fmtDist}
              yFormat={(y) => y.toFixed(2)}
              emptyText="No groups recorded for the loads and filters shown."
            />
          </Card>

          <Card>
            <Text style={[type.heading, styles.chartTitle]}>Elevation holds</Text>
            <Text style={[type.caption, styles.chartSub]}>
              Logged DOPE in {rifle.turretUnit}; repeats at a distance are averaged.
            </Text>
            <XYChart
              series={dopeSeries}
              xFormat={fmtDist}
              yFormat={(y) => formatHold(y, rifle.turretUnit)}
              emptyText="No elevation holds logged for the loads and filters shown."
            />
          </Card>

          <Card>
            <Text style={[type.heading, styles.chartTitle]}>Charge ladder</Text>
            <Text style={[type.caption, styles.chartSub]}>
              Velocity by charge weight from each load's latest workup.
            </Text>
            <XYChart
              series={ladderSeries}
              xFormat={(x) => `${x.toFixed(1)} gr`}
              yFormat={(y) => `${Math.round(y)}`}
              emptyText="No workup with chronograph data for the loads and filters shown."
            />
          </Card>

          <Card>
            <Text style={[type.heading, styles.chartTitle]}>Summary</Text>
            <View style={styles.tableHead}>
              <Text style={[type.label, { flex: 2 }]}>Load</Text>
              <Text style={[type.label, styles.cell]}>Avg</Text>
              <Text style={[type.label, styles.cell]}>SD</Text>
              <Text style={[type.label, styles.cell]}>Best grp</Text>
              <Text style={[type.label, styles.cell]}>Holds</Text>
            </View>
            {visibleLoads.length === 0 ? (
              <Text style={[type.secondary, { paddingVertical: spacing.md }]}>Every load is hidden.</Text>
            ) : (
              visibleLoads.map((l) => {
                const s = summaries.find((x) => x.loadId === l.loadId);
                const b = best.find((x) => x.loadId === l.loadId);
                return (
                  <View key={l.loadId} style={styles.tableRow}>
                    <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <View style={[styles.dot, { backgroundColor: l.color! }]} />
                      <Text style={type.secondary} numberOfLines={1}>
                        {l.name}
                      </Text>
                    </View>
                    <Text style={[type.body, type.mono, styles.cell]}>{s ? Math.round(s.avgFps) : '—'}</Text>
                    <Text style={[type.body, type.mono, styles.cell]}>{s?.sdFps != null ? s.sdFps.toFixed(1) : '—'}</Text>
                    <Text style={[type.body, type.mono, styles.cell]}>
                      {b ? fmtGroup(groupInUnit(b.groupIn, b.distanceYd, groupUnit)).replace(/ (MOA|in)$/, '') : '—'}
                    </Text>
                    <Text style={[type.body, type.mono, styles.cell]}>{dopeCount(l.loadId) || '—'}</Text>
                  </View>
                );
              })
            )}
            <Text style={[type.caption, { marginTop: spacing.sm, color: colors.textTertiary }]}>
              Avg and SD in fps, shot-weighted across strings. Best group in {groupUnit}. Holds counts logged
              elevation entries. Distances in {distUnit}.
            </Text>
          </Card>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chipScroll: { marginHorizontal: -spacing.lg, marginBottom: spacing.md },
  chipRow: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  link: { color: colors.accent, fontSize: 14, fontWeight: '600' },
  loadRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  swatch: { width: 14, height: 14, borderRadius: 4 },
  swatchOff: { opacity: 0.35 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  chartTitle: { marginBottom: 2 },
  chartSub: { marginBottom: spacing.md },
  tableHead: { flexDirection: 'row', paddingBottom: spacing.xs, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  cell: { flex: 1, textAlign: 'right' },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
