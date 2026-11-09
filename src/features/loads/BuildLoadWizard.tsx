import Ionicons from '@expo/vector-icons/Ionicons';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useNavigation, useRouter } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
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
import {
  CollapsibleSection,
  Field,
  Half,
  NumericField,
  Row,
  Segmented,
  Stepper,
} from '@/components/Form';
import { ListPickerModal } from '@/components/ListPickerModal';
import { Screen } from '@/components/Screen';
import { boreDiameterForCartridge } from '@/data/cartridgeBores';
import {
  BRASS_OPTIONS,
  POWDER_OPTIONS,
  PRESS_OPTIONS,
  PRIMER_OPTIONS,
  SEATING_DIE_OPTIONS,
  SIZING_DIE_OPTIONS,
} from '@/data/componentCatalog';
import { benchItemsQuery } from '@/db/repositories/bench';
import { activeRiflesQuery } from '@/db/repositories/rifles';
import type { Rifle } from '@/db/schema';
import {
  BuildDraft,
  BuildErrors,
  BuildField,
  BuildStep,
  canAdvance,
  CHARGE_ACK_TEXT,
  draftToPrefill,
  isDraftDirty,
  isStepFilled,
  LadderMethod,
  ladderPlan,
  stepsFor,
  validateStep,
} from '@/features/loads/buildLoad';
import { BulletCatalogModal, type PickedBullet } from '@/features/loads/BulletCatalogModal';
import { LoadForm, LoadFormResult } from '@/features/loads/LoadForm';
import { SIZING_DIE_TYPE_CHOICES, YES_NO } from '@/features/loads/recipe';
import { DEFAULT_STEP_COUNT } from '@/lib/workup/seriesGenerator';
import { useBuildLoad } from '@/stores/buildLoadStore';
import { colors, radii, spacing, type } from '@/theme';

// "Let's build a new load": one component per screen, in the order a loader
// works, with a sentence on why each one matters. The last step is the real
// LoadForm, prefilled — its Save is the only save path. The draft lives in the
// buildLoadStore so a detour to add a rifle (another tab) can't lose it.

type Props = {
  onSubmit: (result: LoadFormResult, draft: BuildDraft) => void | Promise<void>;
};

type Picker = 'catalog' | 'powder' | 'primer' | 'brass' | 'sizingDie' | 'seatingDie' | 'press';

const LADDER_METHODS: { key: LadderMethod; title: string; blurb: string; forYou: string }[] = [
  {
    key: 'velocity',
    title: 'Velocity ladder',
    blurb: '5-shot strings per charge over a chronograph. Find flat spots and low SD/ES.',
    forYou: 'Pick this if you have a chronograph. Easiest to read.',
  },
  {
    key: 'ocw',
    title: 'OCW',
    blurb: '3-shot groups per charge at 100 yd. Find the charge window where POI stays put.',
    forYou: 'Pick this with no chronograph and a 100-yard target.',
  },
  {
    key: 'ladder',
    title: 'Ladder',
    blurb: '1 shot per charge at 300+ yd. Watch for vertical clusters on the target.',
    forYou: 'Fewest rounds, but needs a long range and calm conditions.',
  },
];

export function BuildLoadWizard({ onSubmit }: Props) {
  const navigation = useNavigation();
  const router = useRouter();
  const { draft, stepIndex, patch, setStep, reset } = useBuildLoad();
  const { data: rifles } = useLiveQuery(activeRiflesQuery());
  // Same bench the full form shows, so both pickers open on what you own.
  const { data: bench } = useLiveQuery(benchItemsQuery());
  const scrollRef = useRef<ScrollView>(null);

  const [maxReached, setMaxReached] = useState(stepIndex);
  const [errors, setErrors] = useState<BuildErrors>({});
  const [saving, setSaving] = useState(false);
  const [picker, setPicker] = useState<Picker | null>(null);
  // Cartridge follows the chosen rifle until the user types one themselves.
  const [cartridgeTouched, setCartridgeTouched] = useState(false);

  const rifle: Rifle | undefined = rifles.find((r) => r.id === draft?.rifleId);

  // A rifle chosen by deep link (or just created) arrives with the live query,
  // after mount — fill the cartridge from it then.
  useEffect(() => {
    if (!draft || cartridgeTouched || !rifle?.cartridge || draft.cartridge !== '') return;
    patch({ cartridge: rifle.cartridge });
  }, [draft, rifle, cartridgeTouched, patch]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [stepIndex]);

  const dirty = draft ? isDraftDirty(draft) : false;
  usePreventRemove(dirty && !saving, ({ data }) => {
    Alert.alert('Leave the walkthrough?', "You'll lose what you've entered so far.", [
      { text: 'Keep Building', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () => {
          // A fresh start next time — including an un-ticked charge acknowledgement.
          reset();
          navigation.dispatch(data.action);
        },
      },
    ]);
  });

  if (!draft) return <Screen underHeader>{null}</Screen>;

  const steps = stepsFor(draft.stringType);
  const index = Math.min(stepIndex, steps.length - 1);
  const step: BuildStep = steps[index]!;
  const isReview = step.key === 'review';

  const set = <K extends BuildField>(field: K, value: BuildDraft[K]) => {
    patch({ [field]: value } as Partial<BuildDraft>);
    setErrors((e) => (e[field] ? { ...e, [field]: undefined } : e));
  };

  const goTo = (i: number) => {
    setStep(i);
    setMaxReached((m) => Math.max(m, i));
  };

  /** Leaving a step forward re-checks it, so garbage can't ride into the form. */
  const leaveForward = (to: number): boolean => {
    const errs = validateStep(draft, step);
    if (Object.keys(errs).length > 0) {
      setErrors((e) => ({ ...e, ...errs }));
      return false;
    }
    if (!canAdvance(draft, step)) return false;
    goTo(to);
    return true;
  };

  const next = () => leaveForward(index + 1);
  const back = () => (index === 0 ? navigation.goBack() : goTo(index - 1));
  const jump = (i: number) => {
    if (i > maxReached) return;
    if (i > index) leaveForward(i);
    else goTo(i);
  };

  const pickRifle = (id: string) => {
    const r = rifles.find((x) => x.id === id);
    patch({
      rifleId: id,
      cartridge: cartridgeTouched ? draft.cartridge : (r?.cartridge ?? draft.cartridge),
    });
  };

  const applyCatalogBullet = (bullet: PickedBullet) => {
    patch({
      bulletMake: bullet.maker,
      bulletModel: bullet.model,
      ...(bullet.weightGr != null ? { bulletWeight: String(bullet.weightGr) } : {}),
      ...(bullet.diameterIn != null ? { bulletDiameter: String(bullet.diameterIn) } : {}),
      ...(bullet.bcValue != null && bullet.bcModel
        ? { bcValue: String(bullet.bcValue), bcModel: bullet.bcModel }
        : {}),
    });
    setErrors((e) => ({ ...e, bulletWeight: undefined, bcValue: undefined, bulletDiameter: undefined }));
  };

  const numeric = (
    field: BuildField,
    label: string,
    extra: Partial<Parameters<typeof NumericField>[0]> = {},
  ) => (
    <NumericField
      label={label}
      value={draft[field] as string}
      onChangeText={(v) => set(field, v as BuildDraft[typeof field])}
      error={errors[field]}
      {...extra}
    />
  );

  const text = (
    field: BuildField,
    label: string,
    extra: Partial<Parameters<typeof Field>[0]> = {},
  ) => (
    <Field
      label={label}
      value={draft[field] as string}
      onChangeText={(v) => set(field, v as BuildDraft[typeof field])}
      error={errors[field]}
      {...extra}
    />
  );

  const yesNo = (field: 'neckTurned' | 'pocketUniformed' | 'flashHoleDeburred' | 'annealed', label: string) => (
    <Segmented label={label} options={YES_NO} value={draft[field]} onChange={(v) => set(field, v)} />
  );

  const renderStep = () => {
    switch (step.key) {
      case 'stringType':
        return (
          <View accessibilityRole="radiogroup">
            {(
              [
                {
                  key: 'batch',
                  title: 'Batch',
                  blurb:
                    'A number of identical rounds of one recipe — you already know the charge you want.',
                },
                {
                  key: 'ladder',
                  title: 'Charge ladder',
                  blurb:
                    "A short series of charges in small steps to find what this rifle likes. You'll shoot it over a chrono or at paper.",
                },
              ] as const
            ).map((o) => (
              <Pressable
                key={o.key}
                onPress={() => set('stringType', o.key)}
                accessibilityRole="radio"
                accessibilityState={{ checked: draft.stringType === o.key }}
                style={[styles.choice, draft.stringType === o.key && styles.choiceActive]}
              >
                <Text style={[type.heading, draft.stringType === o.key && { color: colors.accent }]}>
                  {o.title}
                </Text>
                <Text style={[type.secondary, { marginTop: 2 }]}>{o.blurb}</Text>
              </Pressable>
            ))}
          </View>
        );
      case 'rifle':
        return (
          <>
            {rifles.length === 0 ? (
              <Card>
                <Text style={type.heading}>No rifles yet</Text>
                <Text style={[type.secondary, { marginTop: spacing.sm, marginBottom: spacing.lg }]}>
                  The walkthrough needs a rifle: its cartridge picks the bullets you can use, and
                  everything you shoot is logged against it. Add one and you'll come straight back
                  here.
                </Text>
                <Button
                  label="Add a Rifle"
                  onPress={() => router.push('/rifles/new?returnTo=/loads/build')}
                />
              </Card>
            ) : (
              <>
                <Text style={type.label}>Rifle</Text>
                <View style={[styles.chipWrap, { marginTop: spacing.xs, marginBottom: spacing.lg }]}>
                  {rifles.map((r) => (
                    <Chip
                      key={r.id}
                      label={r.name}
                      selected={draft.rifleId === r.id}
                      onPress={() => pickRifle(r.id)}
                    />
                  ))}
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
                {rifle?.notes ? (
                  <Card>
                    <Text style={type.label}>Rifle notes</Text>
                    <Text style={[type.body, { marginTop: spacing.xs }]}>{rifle.notes}</Text>
                  </Card>
                ) : null}
                <Button
                  label="Add Another Rifle"
                  variant="secondary"
                  onPress={() => router.push('/rifles/new?returnTo=/loads/build')}
                />
              </>
            )}
          </>
        );
      case 'bullet': {
        const bore = boreDiameterForCartridge(draft.cartridge || rifle?.cartridge);
        return (
          <>
            <Button
              label="Choose from Catalog"
              variant="secondary"
              onPress={() => setPicker('catalog')}
              style={{ marginBottom: spacing.sm }}
            />
            <Text style={[type.secondary, styles.hint]}>
              {bore
                ? `Filtered to ${draft.cartridge || rifle?.cartridge} bullets — you can show all calibers inside the catalog.`
                : "This cartridge isn't in the bore table, so the catalog shows every caliber."}
            </Text>
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
                <Half>{numeric('bulletLength', 'Length', { suffix: 'in', placeholder: '1.40' })}</Half>
                <Half>
                  {numeric('bulletDiameter', 'Diameter', { suffix: 'in', placeholder: '0.264' })}
                </Half>
              </Row>
            </CollapsibleSection>
          </>
        );
      }
      case 'powder':
        return (
          <>
            <Button
              label="Choose Powder"
              variant="secondary"
              onPress={() => setPicker('powder')}
              style={{ marginBottom: spacing.lg }}
            />
            {text('powderName', 'Powder', { placeholder: 'H4350' })}
            {text('powderLot', 'Powder lot #', { placeholder: 'Lot 8021' })}
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
            <Row>
              <Half>{text('primerLot', 'Primer lot #', { placeholder: 'Lot 91-2' })}</Half>
              <Half>
                {numeric('primerSeatingDepth', 'Seated below flush', {
                  suffix: 'in',
                  placeholder: '0.003',
                })}
              </Half>
            </Row>
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
            <Text style={[type.label, { marginBottom: spacing.sm }]}>Case prep</Text>
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
              <Half>{yesNo('annealed', 'Annealed')}</Half>
              <Half>{text('annealMethod', 'Anneal method', { placeholder: 'AMP mode 62' })}</Half>
            </Row>
            <Row>
              <Half>{yesNo('neckTurned', 'Neck turned')}</Half>
              <Half>{yesNo('pocketUniformed', 'Pocket uniformed')}</Half>
            </Row>
            {yesNo('flashHoleDeburred', 'Flash hole deburred')}
            {text('casePrepNotes', 'Prep notes', {
              multiline: true,
              placeholder: 'Chamfer, deburr, pocket uniforming…',
            })}
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
            {text('lubeMethod', 'Lube', { placeholder: 'Imperial wax, graphite necks' })}
            {text('pressName', 'Press', { placeholder: 'Forster Co-Ax', autoCapitalize: 'words' })}
            <Button label="Choose Press" variant="secondary" onPress={() => setPicker('press')} />
          </>
        );
      case 'charging':
        return (
          <>
            {numeric('chargeGr', draft.stringType === 'ladder' ? 'Starting charge' : 'Charge', {
              suffix: 'gr',
              placeholder: '0.0',
            })}
            <Text style={[type.secondary, styles.hint]}>
              {draft.stringType === 'ladder'
                ? 'The first rung of your ladder — the published starting load for this bullet and powder. Each step adds the increment you set next.'
                : 'From the published manual for this exact bullet and powder.'}
            </Text>
            <Pressable
              onPress={() => set('chargeAcknowledged', !draft.chargeAcknowledged)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: draft.chargeAcknowledged }}
              style={[styles.ack, draft.chargeAcknowledged && styles.ackChecked]}
            >
              <Ionicons
                name={draft.chargeAcknowledged ? 'checkbox' : 'square-outline'}
                size={26}
                color={draft.chargeAcknowledged ? colors.accent : colors.textSecondary}
              />
              <Text style={[type.body, { flex: 1, lineHeight: 22 }]}>{CHARGE_ACK_TEXT}</Text>
            </Pressable>
            <Text style={[type.secondary, styles.hint]}>
              Required every time. Changing the charge clears it.
            </Text>
            <CollapsibleSection
              title="Charging detail"
              initiallyOpen={draft.chargeMethod !== '' || draft.chargeVariance !== ''}
            >
              {text('chargeMethod', 'Charge method', { placeholder: 'Autotrickler V4' })}
              {numeric('chargeVariance', 'Tolerance (±)', { suffix: 'gr', placeholder: '0.02' })}
            </CollapsibleSection>
          </>
        );
      case 'ladderPlan': {
        const plan = ladderPlan(draft);
        const unit = rifle?.distanceUnit ?? 'yd';
        return (
          <>
            <Text style={[type.label, { marginBottom: spacing.sm }]}>Method</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="Method">
              {LADDER_METHODS.map((m) => (
                <Pressable
                  key={m.key}
                  onPress={() =>
                    patch({ ladderMethod: m.key, stepCount: DEFAULT_STEP_COUNT[m.key] })
                  }
                  accessibilityRole="radio"
                  accessibilityState={{ checked: draft.ladderMethod === m.key }}
                  style={[styles.choice, draft.ladderMethod === m.key && styles.choiceActive]}
                >
                  <Text style={[type.heading, draft.ladderMethod === m.key && { color: colors.accent }]}>
                    {m.title}
                  </Text>
                  <Text style={[type.secondary, { marginTop: 2 }]}>{m.blurb}</Text>
                  <Text style={[type.secondary, { marginTop: 4, color: colors.textTertiary }]}>
                    {m.forYou}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={{ marginTop: spacing.lg }}>
              <Stepper
                label="Increment"
                value={draft.incrementGr}
                step={0.1}
                decimals={1}
                suffix="gr"
                min={0.1}
                onChange={(v) => patch({ incrementGr: v })}
              />
              <Stepper
                label="Charges"
                value={draft.stepCount}
                step={1}
                decimals={0}
                min={2}
                onChange={(v) => patch({ stepCount: Math.round(v) })}
              />
              <Row>
                <Half>
                  {numeric('testDistance', 'Test distance', {
                    suffix: unit,
                    placeholder: draft.ladderMethod === 'ladder' ? '300' : '100',
                  })}
                </Half>
                <Half>
                  <View />
                </Half>
              </Row>
            </View>
            <Card>
              <Text style={type.label}>Series preview</Text>
              {plan.series.length === 0 ? (
                <Text style={[type.secondary, { marginTop: spacing.sm }]}>
                  Go back and enter a starting charge to see the series.
                </Text>
              ) : (
                <>
                  <Text style={[type.body, { marginTop: spacing.sm, fontVariant: ['tabular-nums'] }]}>
                    {plan.series.join(' · ')} gr
                  </Text>
                  <Text style={[type.secondary, { marginTop: spacing.sm }]}>
                    {plan.series.length} charges × {plan.shotsPerCharge}{' '}
                    {plan.shotsPerCharge === 1 ? 'shot' : 'shots'} = {plan.rounds} rounds to load
                  </Text>
                </>
              )}
              <Text style={[type.secondary, { marginTop: spacing.xs, color: colors.textTertiary }]}>
                Work up from a published start load and watch for pressure signs — this app tracks
                your data, it doesn't validate loads.
              </Text>
            </Card>
          </>
        );
      }
      case 'batchCount':
        return (
          <>
            {numeric('roundsLoaded', 'Rounds to load', { integer: true, placeholder: '' })}
            <Text style={[type.secondary, styles.hint]}>
              Required. A whole number of rounds of this recipe.
            </Text>
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
            {text('seatingMicrometer', 'Micrometer setting', { placeholder: '4.5 on the dial' })}
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
            <Row>
              <Half>{text('crimp', 'Crimp', { placeholder: 'None' })}</Half>
              <Half>
                {text('crimpDie', 'Crimp die', { placeholder: 'Lee Factory Crimp', autoCapitalize: 'words' })}
              </Half>
            </Row>
          </>
        );
      case 'review':
        return (
          <>
            <Card>
              <Text style={type.body}>
                Everything you entered is below and still editable. Save creates the load
                {draft.stringType === 'ladder'
                  ? ` and plans your ${ladderPlan(draft).series.length}-charge ladder.`
                  : '.'}
              </Text>
              <Text style={[type.secondary, { marginTop: spacing.sm, color: colors.textTertiary }]}>
                Going back to an earlier step resets this form to the walkthrough's answers.
              </Text>
            </Card>
            <LoadForm
              prefill={draftToPrefill(draft)}
              rifleRequired
              guardUnsaved={false}
              submitLabel="Save Load"
              onSubmit={async (result) => {
                setSaving(true);
                try {
                  await onSubmit(result, draft);
                } finally {
                  setSaving(false);
                }
              }}
            />
          </>
        );
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
          {rifle ? (
            <View style={styles.specStrip} accessibilityLabel="Rifle">
              <Ionicons name="locate" size={14} color={colors.textSecondary} />
              <Text style={[type.caption, { flex: 1 }]} numberOfLines={1}>
                {[
                  rifle.name,
                  rifle.cartridge,
                  rifle.barrelLengthIn ? `${rifle.barrelLengthIn}"` : null,
                  rifle.twistRate,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
          ) : null}
          <Text style={type.label}>
            Step {index + 1} of {steps.length}
          </Text>
          <View style={styles.progressRow} accessibilityRole="tablist">
            {steps.map((s, i) => (
              <Pressable
                key={s.key}
                onPress={() => jump(i)}
                disabled={i > maxReached}
                hitSlop={{ top: 12, bottom: 12 }}
                accessibilityRole="tab"
                accessibilityLabel={`Step ${i + 1}: ${s.title}`}
                accessibilityState={{ selected: i === index, disabled: i > maxReached }}
                style={[
                  styles.progressSeg,
                  i <= maxReached && styles.progressSegReached,
                  i === index && styles.progressSegCurrent,
                ]}
              />
            ))}
          </View>
          <Text style={[type.title, { marginTop: spacing.md }]}>{step.title}</Text>
          <Text style={[type.secondary, styles.blurb]}>{step.blurb}</Text>

          {renderStep()}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <Button
              label="Back"
              variant="secondary"
              onPress={back}
              disabled={saving}
              style={isReview ? styles.nextBtn : styles.backBtn}
            />
            {isReview ? null : (
              <Button
                label={nextLabel}
                onPress={next}
                disabled={!canAdvance(draft, step)}
                style={styles.nextBtn}
              />
            )}
          </View>
        </View>
      </KeyboardAvoidingView>

      <BulletCatalogModal
        visible={picker === 'catalog'}
        benchItems={bench}
        onClose={() => setPicker(null)}
        onSelect={applyCatalogBullet}
        defaultDiameterIn={boreDiameterForCartridge(draft.cartridge || rifle?.cartridge)}
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

const styles = StyleSheet.create({
  avoider: { flex: 1 },
  scrollContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  specStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  progressRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm },
  progressSeg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  progressSegReached: { backgroundColor: colors.textTertiary },
  progressSegCurrent: { backgroundColor: colors.accent },
  blurb: { marginTop: spacing.sm, marginBottom: spacing.xl, lineHeight: 20 },
  hint: { marginBottom: spacing.lg, color: colors.textTertiary },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  choice: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.sm,
  },
  choiceActive: { borderColor: colors.accent },
  ack: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  ackChecked: { borderColor: colors.accent },
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
