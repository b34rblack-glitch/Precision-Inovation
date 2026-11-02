import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Button } from '@/components/Buttons';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { CollapsibleSection, Field, Half, NumericField, Row, Segmented } from '@/components/Form';
import { ListPickerModal } from '@/components/ListPickerModal';
import { Screen } from '@/components/Screen';
import { bestBc, CatalogBullet } from '@/data/bulletCatalog';
import {
  BRASS_OPTIONS,
  POWDER_OPTIONS,
  PRESS_OPTIONS,
  PRIMER_OPTIONS,
  SEATING_DIE_OPTIONS,
  SIZING_DIE_OPTIONS,
} from '@/data/componentCatalog';
import { activeRiflesQuery } from '@/db/repositories/rifles';
import { BulletCatalogModal } from '@/features/loads/BulletCatalogModal';
import {
  draftPreview,
  draftToResult,
  emptyDraft,
  firstStepWithErrors,
  GUIDED_STEPS,
  GuidedDraft,
  GuidedErrors,
  GuidedField,
  GuidedResult,
  isDraftDirty,
  isStepFilled,
  suggestLoadName,
  validateDraft,
} from '@/features/loads/guidedLoad';
import { SIZING_DIE_TYPE_CHOICES, YES_NO } from '@/features/loads/recipe';
import { colors, spacing, type } from '@/theme';

// "Let's build a new load": the recipe form broken into one screen per
// component, in the order a loader works, with a sentence on why each one
// matters. Same validation and same saved shape as the full form — the
// walkthrough is a different door into the same room, not a different room.

type Props = {
  /** Preselects the rifle (and seeds the cartridge from it) via a deep link. */
  defaultRifleId?: string | null;
  onSubmit: (result: GuidedResult, options: { startWorkup: boolean }) => void | Promise<void>;
};

type Picker = 'catalog' | 'powder' | 'primer' | 'brass' | 'sizingDie' | 'seatingDie' | 'press';

export function GuidedLoadWizard({ defaultRifleId, onSubmit }: Props) {
  const navigation = useNavigation();
  const { data: rifles } = useLiveQuery(activeRiflesQuery());
  const scrollRef = useRef<ScrollView>(null);

  const [draft, setDraft] = useState<GuidedDraft>(() =>
    emptyDraft({ rifleId: defaultRifleId ?? null }),
  );
  const [stepIndex, setStepIndex] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [errors, setErrors] = useState<GuidedErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [picker, setPicker] = useState<Picker | null>(null);
  // Cartridge follows the chosen rifle until the user types one themselves.
  const [cartridgeTouched, setCartridgeTouched] = useState(false);
  // The suggested name tracks the recipe until the user edits it.
  const [nameAuto, setNameAuto] = useState(true);

  const step = GUIDED_STEPS[stepIndex]!;
  const isLast = stepIndex === GUIDED_STEPS.length - 1;

  const set = <K extends GuidedField>(field: K, value: GuidedDraft[K]) => {
    setDraft((d) => ({ ...d, [field]: value }));
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  };

  // Deep-linked rifle: its cartridge arrives with the live query, after mount.
  const defaultRifle = rifles.find((r) => r.id === defaultRifleId);
  useEffect(() => {
    if (cartridgeTouched || !defaultRifle?.cartridge) return;
    setDraft((d) =>
      d.rifleId === defaultRifle.id && d.cartridge === ''
        ? { ...d, cartridge: defaultRifle.cartridge ?? '' }
        : d,
    );
  }, [defaultRifle, cartridgeTouched]);

  // Entering the review step fills in a name unless the user already wrote one.
  useEffect(() => {
    if (!isLast || !nameAuto) return;
    setDraft((d) => {
      const suggested = suggestLoadName(d);
      return d.name === suggested ? d : { ...d, name: suggested };
    });
  }, [isLast, nameAuto]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [stepIndex]);

  const seed = useMemo(
    () =>
      emptyDraft({
        rifleId: defaultRifleId ?? null,
        cartridge: defaultRifle?.cartridge ?? null,
      }),
    [defaultRifleId, defaultRifle],
  );
  const dirty = isDraftDirty(draft, seed);
  usePreventRemove(dirty && !submitting, ({ data }) => {
    Alert.alert('Leave the walkthrough?', "You'll lose what you've entered so far.", [
      { text: 'Keep Building', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  const goTo = (i: number) => {
    setStepIndex(i);
    setMaxReached((m) => Math.max(m, i));
  };

  const next = () => {
    const errs = validateDraft(draft, step.fields);
    if (Object.keys(errs).length > 0) {
      setErrors((e) => ({ ...e, ...errs }));
      return;
    }
    goTo(stepIndex + 1);
  };

  const save = async (startWorkup: boolean) => {
    const errs = validateDraft(draft);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      const where = firstStepWithErrors(errs);
      if (where >= 0 && where !== stepIndex) goTo(where);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await onSubmit(draftToResult(draft), { startWorkup });
    } finally {
      setSubmitting(false);
    }
  };

  const pickRifle = (rifleId: string | null) => {
    const rifle = rifles.find((r) => r.id === rifleId);
    setDraft((d) => ({
      ...d,
      rifleId,
      cartridge: cartridgeTouched ? d.cartridge : (rifle?.cartridge ?? d.cartridge),
    }));
  };

  // Catalog pick prefills the bullet's make/model/weight and its best BC
  // (G7 preferred). Every field stays editable afterward.
  const applyCatalogBullet = (bullet: CatalogBullet) => {
    const bc = bestBc(bullet);
    setDraft((d) => ({
      ...d,
      bulletMake: bullet.maker,
      bulletModel: bullet.model,
      bulletWeight: bullet.weightGr.toString(),
      bulletDiameter: bullet.diameterIn.toString(),
      bcValue: bc ? bc.bcValue.toString() : d.bcValue,
      bcModel: bc ? bc.bcModel : d.bcModel,
    }));
    setErrors((e) => ({ ...e, bulletWeight: undefined, bcValue: undefined, bulletDiameter: undefined }));
  };

  const numeric = (
    field: GuidedField,
    label: string,
    extra: Partial<Parameters<typeof NumericField>[0]> = {},
  ) => (
    <NumericField
      label={label}
      value={draft[field] as string}
      onChangeText={(v) => set(field, v as GuidedDraft[typeof field])}
      error={errors[field]}
      {...extra}
    />
  );

  const text = (
    field: GuidedField,
    label: string,
    extra: Partial<Parameters<typeof Field>[0]> = {},
  ) => (
    <Field
      label={label}
      value={draft[field] as string}
      onChangeText={(v) => set(field, v as GuidedDraft[typeof field])}
      error={errors[field]}
      {...extra}
    />
  );

  const renderStep = () => {
    switch (step.key) {
      case 'rifle':
        return (
          <>
            <Text style={type.label}>Rifle</Text>
            <View style={{ marginBottom: spacing.lg, marginTop: spacing.xs }}>
              {rifles.length === 0 ? (
                <Text style={type.secondary}>
                  No rifles yet — this load can stay unassigned. Add a rifle from the Rifles tab
                  and assign it later from the load's Edit screen.
                </Text>
              ) : (
                <View style={styles.chipWrap}>
                  <Chip
                    label="Unassigned"
                    selected={draft.rifleId === null}
                    onPress={() => pickRifle(null)}
                  />
                  {rifles.map((r) => (
                    <Chip
                      key={r.id}
                      label={r.name}
                      selected={draft.rifleId === r.id}
                      onPress={() => pickRifle(r.id)}
                    />
                  ))}
                </View>
              )}
            </View>
            <Field
              label="Cartridge"
              value={draft.cartridge}
              onChangeText={(v) => {
                setCartridgeTouched(true);
                set('cartridge', v);
              }}
              placeholder="6.5 Creedmoor"
            />
          </>
        );
      case 'bullet':
        return (
          <>
            <Button
              label="Choose from Catalog"
              variant="secondary"
              onPress={() => setPicker('catalog')}
              style={{ marginBottom: spacing.lg }}
            />
            <Row>
              <Half>{text('bulletMake', 'Bullet make', { placeholder: 'Hornady' })}</Half>
              <Half>{text('bulletModel', 'Bullet model', { placeholder: 'ELD-M' })}</Half>
            </Row>
            <Row>
              <Half>{numeric('bulletWeight', 'Weight', { suffix: 'gr', placeholder: '140' })}</Half>
              <Half>{numeric('bcValue', 'BC', { placeholder: '0.326' })}</Half>
            </Row>
            <Segmented
              label="BC model"
              options={['G7', 'G1'] as const}
              value={draft.bcModel}
              onChange={(v) => set('bcModel', v)}
            />
            <CollapsibleSection
              title="Length & diameter"
              initiallyOpen={draft.bulletLength !== '' || draft.bulletDiameter !== ''}
            >
              <Text style={[type.secondary, styles.hint]}>
                Optional. Both together enable the spin-drift estimate on range cards.
              </Text>
              <Row>
                <Half>
                  {numeric('bulletLength', 'Length', { suffix: 'in', placeholder: '1.40' })}
                </Half>
                <Half>
                  {numeric('bulletDiameter', 'Diameter', { suffix: 'in', placeholder: '0.264' })}
                </Half>
              </Row>
            </CollapsibleSection>
          </>
        );
      case 'powder':
        return (
          <>
            <Button
              label="Choose Powder"
              variant="secondary"
              onPress={() => setPicker('powder')}
              style={{ marginBottom: spacing.lg }}
            />
            <Row>
              <Half>{text('powderName', 'Powder', { placeholder: 'H4350' })}</Half>
              <Half>
                {numeric('chargeGr', 'Starting charge', { suffix: 'gr', placeholder: '40.0' })}
              </Half>
            </Row>
            <Text style={[type.secondary, styles.hint]}>
              The catalog holds product names only, never charge weights. Start from published
              load data and watch for pressure signs as you work up.
            </Text>
            <CollapsibleSection
              title="Charging detail"
              initiallyOpen={draft.chargeMethod !== '' || draft.powderLot !== ''}
            >
              {text('chargeMethod', 'Charge method', { placeholder: 'Autotrickler V4' })}
              {text('powderLot', 'Powder lot #', { placeholder: 'Lot 8021' })}
            </CollapsibleSection>
          </>
        );
      case 'primer':
        return (
          <>
            <Button
              label="Choose Primer"
              variant="secondary"
              onPress={() => setPicker('primer')}
              style={{ marginBottom: spacing.lg }}
            />
            {text('primer', 'Primer', { placeholder: 'CCI BR-2' })}
            {text('primerLot', 'Primer lot #', { placeholder: 'Lot 91-2' })}
          </>
        );
      case 'brass':
        return (
          <>
            <Button
              label="Choose Brass"
              variant="secondary"
              onPress={() => setPicker('brass')}
              style={{ marginBottom: spacing.lg }}
            />
            <Row>
              <Half>{text('brass', 'Brass', { placeholder: 'Lapua' })}</Half>
              <Half>{numeric('brassFirings', 'Firings', { integer: true, placeholder: '0' })}</Half>
            </Row>
            {text('caseLot', 'Case lot #', { placeholder: 'Lot 4823' })}
          </>
        );
      case 'casePrep':
        return (
          <>
            <Row>
              <Half>
                {numeric('caseTrimLength', 'Trim length', { suffix: 'in', placeholder: '1.910' })}
              </Half>
              <Half>
                {text('caseTrimmedTo', 'Trimmed with', {
                  placeholder: 'Giraud',
                  autoCapitalize: 'words',
                })}
              </Half>
            </Row>
            <Row>
              <Half>
                <Segmented
                  label="Annealed"
                  options={YES_NO}
                  value={draft.annealed}
                  onChange={(v) => set('annealed', v)}
                />
              </Half>
              <Half>{text('annealMethod', 'Anneal method', { placeholder: 'AMP mode 62' })}</Half>
            </Row>
            <Row>
              <Half>
                <Segmented
                  label="Neck turned"
                  options={YES_NO}
                  value={draft.neckTurned}
                  onChange={(v) => set('neckTurned', v)}
                />
              </Half>
              <Half>
                <Segmented
                  label="Pocket uniformed"
                  options={YES_NO}
                  value={draft.pocketUniformed}
                  onChange={(v) => set('pocketUniformed', v)}
                />
              </Half>
            </Row>
            <Segmented
              label="Flash hole deburred"
              options={YES_NO}
              value={draft.flashHoleDeburred}
              onChange={(v) => set('flashHoleDeburred', v)}
            />
          </>
        );
      case 'sizing':
        return (
          <>
            <Button
              label="Choose Sizing Die"
              variant="secondary"
              onPress={() => setPicker('sizingDie')}
              style={{ marginBottom: spacing.lg }}
            />
            {text('sizingDie', 'Sizing die', {
              placeholder: 'Redding Type S Full Length Bushing',
              autoCapitalize: 'words',
            })}
            <Segmented
              label="Sizes"
              options={SIZING_DIE_TYPE_CHOICES}
              value={draft.sizingDieType}
              onChange={(v) => set('sizingDieType', v)}
            />
            <Row>
              <Half>{numeric('bushingSize', 'Bushing', { suffix: 'in', placeholder: '0.289' })}</Half>
              <Half>
                {numeric('shoulderBump', 'Shoulder bump', { suffix: 'in', placeholder: '0.002' })}
              </Half>
            </Row>
            {text('pressName', 'Press', { placeholder: 'Forster Co-Ax', autoCapitalize: 'words' })}
            <Button label="Choose Press" variant="secondary" onPress={() => setPicker('press')} />
          </>
        );
      case 'seating':
        return (
          <>
            <Button
              label="Choose Seating Die"
              variant="secondary"
              onPress={() => setPicker('seatingDie')}
              style={{ marginBottom: spacing.lg }}
            />
            {text('seatingDie', 'Seating die', {
              placeholder: 'Redding Competition Seating',
              autoCapitalize: 'words',
            })}
            <Row>
              <Half>{numeric('cbto', 'CBTO', { suffix: 'in', placeholder: '2.230' })}</Half>
              <Half>{numeric('coal', 'COAL', { suffix: 'in', placeholder: '2.810' })}</Half>
            </Row>
            <Row>
              <Half>
                {numeric('jumpToLands', 'Jump to lands', {
                  suffix: 'in',
                  signed: true,
                  placeholder: '0.020',
                })}
              </Half>
              <Half>
                {numeric('neckTension', 'Neck tension', { suffix: 'in', placeholder: '0.002' })}
              </Half>
            </Row>
            <Text style={[type.secondary, styles.hint]}>
              Jump is measured off the lands — enter a negative value if the bullet is jammed in.
            </Text>
          </>
        );
      case 'review': {
        const { ingredients, stages } = draftPreview(draft);
        const empty = ingredients.length === 0 && stages.length === 0;
        return (
          <>
            <Field
              label="Name *"
              value={draft.name}
              onChangeText={(v) => {
                setNameAuto(false);
                set('name', v);
              }}
              placeholder={'e.g. "140 ELD-M / H4350 41.5"'}
              error={errors.name}
            />
            <Card>
              {empty ? (
                <Text style={type.secondary}>
                  Nothing recorded beyond the name yet — that's fine. Every field can be filled in
                  later from the load's Edit screen.
                </Text>
              ) : (
                <>
                  {ingredients.length > 0 ? (
                    <Text style={[type.label, { marginBottom: spacing.xs }]}>Ingredients</Text>
                  ) : null}
                  {ingredients.map((r) => (
                    <SummaryRow key={r.label} label={r.label} value={r.value} />
                  ))}
                  {stages.map((s) => (
                    <View key={s.key} style={{ marginTop: spacing.md }}>
                      <Text style={[type.label, { marginBottom: spacing.xs }]}>{s.title}</Text>
                      {s.rows.map((r) => (
                        <SummaryRow key={r.label} label={r.label} value={r.value} />
                      ))}
                    </View>
                  ))}
                </>
              )}
            </Card>
            <Text style={[type.secondary, styles.hint]}>
              Tap any step above to go back and change it. QC results — muzzle velocity, runout,
              loaded weight — live on the load's Edit screen once you've shot it.
            </Text>
            {text('notes', 'Notes', {
              multiline: true,
              placeholder: 'Anything worth remembering about this recipe…',
            })}
          </>
        );
      }
    }
  };

  const nextLabel = step.optional && !isStepFilled(draft, step) ? 'Skip for now' : 'Next';

  return (
    <Screen underHeader scroll={false}>
      <KeyboardAvoidingView
        style={styles.avoider}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollContent}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        >
          <Text style={type.label}>
            Step {stepIndex + 1} of {GUIDED_STEPS.length}
          </Text>
          <View style={styles.progressRow} accessibilityRole="tablist">
            {GUIDED_STEPS.map((s, i) => (
              <Pressable
                key={s.key}
                onPress={() => goTo(i)}
                disabled={i > maxReached}
                hitSlop={{ top: 12, bottom: 12 }}
                accessibilityRole="tab"
                accessibilityLabel={`Step ${i + 1}: ${s.title}`}
                accessibilityState={{ selected: i === stepIndex, disabled: i > maxReached }}
                style={[
                  styles.progressSeg,
                  i <= maxReached && styles.progressSegReached,
                  i === stepIndex && styles.progressSegCurrent,
                ]}
              />
            ))}
          </View>
          <Text style={[type.title, { marginTop: spacing.md }]}>{step.title}</Text>
          <Text style={[type.secondary, styles.blurb]}>{step.blurb}</Text>

          {renderStep()}
        </ScrollView>

        <View style={styles.footer}>
          {isLast ? (
            <View style={{ gap: spacing.sm }}>
              <Button label="Save Load" onPress={() => save(false)} loading={submitting} />
              <View style={styles.footerRow}>
                <Button
                  label="Back"
                  variant="secondary"
                  onPress={() => goTo(stepIndex - 1)}
                  disabled={submitting}
                  style={styles.backBtn}
                />
                {draft.rifleId ? (
                  <Button
                    label="Save & Plan a Workup"
                    variant="secondary"
                    onPress={() => save(true)}
                    disabled={submitting}
                    style={styles.nextBtn}
                  />
                ) : null}
              </View>
            </View>
          ) : (
            <View style={styles.footerRow}>
              {stepIndex > 0 ? (
                <Button
                  label="Back"
                  variant="secondary"
                  onPress={() => goTo(stepIndex - 1)}
                  style={styles.backBtn}
                />
              ) : null}
              <Button label={nextLabel} onPress={next} style={styles.nextBtn} />
            </View>
          )}
        </View>
      </KeyboardAvoidingView>

      <BulletCatalogModal
        visible={picker === 'catalog'}
        onClose={() => setPicker(null)}
        onSelect={applyCatalogBullet}
      />
      <ListPickerModal
        visible={picker === 'powder'}
        title="Powders"
        options={POWDER_OPTIONS}
        placeholder="Search h4350, varget, RL16…"
        footer="Product names only — enter your own worked-up charge weight. Always start from published load data and watch for pressure."
        onClose={() => setPicker(null)}
        onSelect={(v) => set('powderName', v)}
      />
      <ListPickerModal
        visible={picker === 'primer'}
        title="Primers"
        options={PRIMER_OPTIONS}
        placeholder="Search CCI, 210M, magnum…"
        onClose={() => setPicker(null)}
        onSelect={(v) => set('primer', v)}
      />
      <ListPickerModal
        visible={picker === 'brass'}
        title="Brass"
        options={BRASS_OPTIONS}
        placeholder="Search Lapua, Peterson…"
        onClose={() => setPicker(null)}
        onSelect={(v) => set('brass', v)}
      />
      <ListPickerModal
        visible={picker === 'sizingDie'}
        title="Sizing Dies"
        options={SIZING_DIE_OPTIONS}
        placeholder="Search Redding, bushing, body…"
        onClose={() => setPicker(null)}
        onSelect={(v) => set('sizingDie', v)}
      />
      <ListPickerModal
        visible={picker === 'seatingDie'}
        title="Seating Dies"
        options={SEATING_DIE_OPTIONS}
        placeholder="Search Wilson, micrometer, arbor…"
        onClose={() => setPicker(null)}
        onSelect={(v) => set('seatingDie', v)}
      />
      <ListPickerModal
        visible={picker === 'press'}
        title="Presses"
        options={PRESS_OPTIONS}
        placeholder="Search Co-Ax, arbor, turret…"
        onClose={() => setPicker(null)}
        onSelect={(v) => set('pressName', v)}
      />
    </Screen>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[type.secondary, { flexShrink: 0, marginRight: spacing.md }]}>{label}</Text>
      <Text style={[type.body, type.mono, { flexShrink: 1, textAlign: 'right' }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avoider: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  progressRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  progressSeg: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  progressSegReached: { backgroundColor: colors.textTertiary },
  progressSegCurrent: { backgroundColor: colors.accent },
  blurb: { marginTop: spacing.sm, marginBottom: spacing.xl, lineHeight: 20 },
  hint: { marginBottom: spacing.lg, color: colors.textTertiary },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 4,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  footerRow: { flexDirection: 'row', gap: spacing.md },
  backBtn: { flex: 1 },
  nextBtn: { flex: 2 },
});
