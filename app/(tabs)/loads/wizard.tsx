import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Buttons';
import { Card } from '@/components/Card';
import { Chip } from '@/components/Chip';
import { Field, Half, NumericField, Row, Segmented } from '@/components/Form';
import { ListPickerModal } from '@/components/ListPickerModal';
import { Screen } from '@/components/Screen';
import { BRASS_OPTIONS, POWDER_OPTIONS, PRIMER_OPTIONS } from '@/data/componentCatalog';
import { CatalogBullet } from '@/data/bulletCatalog';
import { createLoad } from '@/db/repositories/loads';
import { activeRiflesQuery } from '@/db/repositories/rifles';
import { BulletCatalogModal } from '@/features/loads/BulletCatalogModal';
import { parseDecimal } from '@/lib/parse';
import { colors, spacing, type } from '@/theme';

// Guided alternative to the full recipe form. The form is better once you know
// what you track; this is better the first time, because it asks for the few
// fields that actually drive a firing solution and says what each one unlocks.
//
// Nothing here is required until the final step, where the load needs a name.
// Every step can be walked past empty.

const STEPS = ['Rifle', 'Bullet', 'Components', 'Velocity', 'Review'] as const;
type StepIndex = 0 | 1 | 2 | 3 | 4;

const str = (s: string): string | null => (s.trim() === '' ? null : s.trim());

export default function LoadWizardScreen() {
  const router = useRouter();
  const { rifleId: paramRifleId } = useLocalSearchParams<{ rifleId?: string }>();
  const { data: rifles, updatedAt: riflesLoadedAt } = useLiveQuery(activeRiflesQuery());

  const [step, setStep] = useState<StepIndex>(0);
  const [creating, setCreating] = useState(false);

  const [rifleId, setRifleId] = useState<string | null>(paramRifleId ?? null);
  const [cartridge, setCartridge] = useState('');

  const [bulletMake, setBulletMake] = useState('');
  const [bulletModel, setBulletModel] = useState('');
  const [bulletWeight, setBulletWeight] = useState('');
  const [bcValue, setBcValue] = useState('');
  const [bcModel, setBcModel] = useState<'G7' | 'G1'>('G7');
  const [bulletLength, setBulletLength] = useState('');
  const [bulletDiameter, setBulletDiameter] = useState('');
  const [catalogOpen, setCatalogOpen] = useState(false);

  const [powderName, setPowderName] = useState('');
  const [chargeGr, setChargeGr] = useState('');
  const [primer, setPrimer] = useState('');
  const [brass, setBrass] = useState('');
  const [brassFirings, setBrassFirings] = useState('');
  const [powderPickerOpen, setPowderPickerOpen] = useState(false);
  const [primerPickerOpen, setPrimerPickerOpen] = useState(false);
  const [brassPickerOpen, setBrassPickerOpen] = useState(false);

  const [muzzleVelocity, setMuzzleVelocity] = useState('');
  const [mvTempRef, setMvTempRef] = useState('');
  const [mvTempSens, setMvTempSens] = useState('');

  const [name, setName] = useState('');
  const [nameTouched, setNameTouched] = useState(false);
  const [nameError, setNameError] = useState<string | undefined>();

  // Suggested name reads like a shooter would write it: "140 ELD-M / H4350 41.5".
  const suggestedName = (() => {
    const bullet = [str(bulletWeight), str(bulletModel) ?? str(bulletMake)]
      .filter(Boolean)
      .join(' ');
    const powder = [str(powderName), str(chargeGr)].filter(Boolean).join(' ');
    return [bullet, powder].filter(Boolean).join(' / ');
  })();
  const effectiveName = nameTouched ? name : suggestedName;

  const applyCatalogBullet = (b: CatalogBullet) => {
    setBulletMake(b.maker);
    setBulletModel(b.model);
    setBulletWeight(String(b.weightGr));
    setBulletDiameter(String(b.diameterIn));
    if (b.bcG7 != null) {
      setBcModel('G7');
      setBcValue(String(b.bcG7));
    } else if (b.bcG1 != null) {
      setBcModel('G1');
      setBcValue(String(b.bcG1));
    }
    if (!cartridge.trim()) setCartridge(b.caliber);
    setCatalogOpen(false);
  };

  // The two hard requirements for a computed range card.
  const hasBc = parseDecimal(bcValue) != null;
  const hasMv = parseDecimal(muzzleVelocity) != null;
  const cardReady = hasBc && hasMv;
  const spinReady =
    parseDecimal(bulletLength) != null &&
    parseDecimal(bulletDiameter) != null &&
    parseDecimal(bulletWeight) != null;

  const create = async () => {
    const finalName = effectiveName.trim();
    if (finalName === '') {
      setNameError('Give the load a name so you can find it again.');
      return;
    }
    setCreating(true);
    try {
      const load = await createLoad(
        { name: finalName, cartridge: str(cartridge), rifleId },
        {
          bulletMake: str(bulletMake),
          bulletModel: str(bulletModel),
          bulletWeightGr: parseDecimal(bulletWeight),
          bulletLengthIn: parseDecimal(bulletLength),
          bulletDiameterIn: parseDecimal(bulletDiameter),
          bcValue: parseDecimal(bcValue),
          bcModel,
          powderName: str(powderName),
          chargeGr: parseDecimal(chargeGr),
          primer: str(primer),
          brass: str(brass),
          brassFirings: parseDecimal(brassFirings),
          muzzleVelocityFps: parseDecimal(muzzleVelocity),
          mvTempRefF: parseDecimal(mvTempRef),
          mvTempSensFpsPerDegF: parseDecimal(mvTempSens),
        },
      );
      router.replace(`/loads/${load.id}`);
    } catch (e) {
      Alert.alert('Save failed', e instanceof Error ? e.message : String(e));
    } finally {
      setCreating(false);
    }
  };

  const next = () => setStep((s) => (Math.min(s + 1, 4) as StepIndex));
  const back = () => setStep((s) => (Math.max(s - 1, 0) as StepIndex));

  return (
    <Screen scroll={false} underHeader>
      <View style={styles.progress}>
        {STEPS.map((label, i) => (
          <View
            key={label}
            style={[styles.tick, i <= step && styles.tickDone]}
            accessibilityElementsHidden
          />
        ))}
      </View>
      <Text style={[type.secondary, styles.progressLabel]}>
        Step {step + 1} of {STEPS.length} · {STEPS[step]}
      </Text>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {step === 0 ? (
          <>
            <Text style={type.heading}>Which rifle is this for?</Text>
            <Text style={[type.secondary, styles.hint]}>
              The rifle supplies sight height, zero distance and turret units — the geometry
              every hold is measured against. You can leave a load unassigned and attach it
              later.
            </Text>
            {riflesLoadedAt && rifles.length === 0 ? (
              <Card>
                <Text style={type.body}>No rifles yet.</Text>
                <Text style={[type.secondary, { marginTop: spacing.xs }]}>
                  A load can exist without one, but it needs a rifle before it can produce a
                  range card.
                </Text>
                <Button
                  label="Add a Rifle"
                  variant="secondary"
                  onPress={() => router.push('/rifles/new')}
                  style={{ marginTop: spacing.md }}
                />
              </Card>
            ) : (
              <View style={styles.chipWrap}>
                <Chip
                  label="Unassigned"
                  selected={rifleId === null}
                  onPress={() => setRifleId(null)}
                />
                {rifles.map((r) => (
                  <Chip
                    key={r.id}
                    label={r.name}
                    selected={rifleId === r.id}
                    onPress={() => {
                      setRifleId(r.id);
                      if (!cartridge.trim() && r.cartridge) setCartridge(r.cartridge);
                    }}
                  />
                ))}
              </View>
            )}
            <View style={{ marginTop: spacing.lg }}>
              <Field
                label="Cartridge"
                value={cartridge}
                onChangeText={setCartridge}
                placeholder="6.5 Creedmoor"
              />
            </View>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Text style={type.heading}>What bullet?</Text>
            <Text style={[type.secondary, styles.hint]}>
              This is the step that matters most. The ballistic coefficient governs how fast
              the bullet sheds speed, so it shapes every row of the range card. Pick from the
              catalog to fill it in from published figures.
            </Text>
            <Button
              label="Choose from Catalog"
              variant="secondary"
              onPress={() => setCatalogOpen(true)}
              style={{ marginBottom: spacing.lg }}
            />
            <Row>
              <Half>
                <Field
                  label="Make"
                  value={bulletMake}
                  onChangeText={setBulletMake}
                  placeholder="Hornady"
                />
              </Half>
              <Half>
                <Field
                  label="Model"
                  value={bulletModel}
                  onChangeText={setBulletModel}
                  placeholder="ELD-M"
                />
              </Half>
            </Row>
            <Row>
              <Half>
                <NumericField
                  label="Weight"
                  value={bulletWeight}
                  onChangeText={setBulletWeight}
                  suffix="gr"
                />
              </Half>
              <Half>
                <NumericField
                  label="BC"
                  value={bcValue}
                  onChangeText={setBcValue}
                  placeholder="0.326"
                />
              </Half>
            </Row>
            <Segmented
              label="BC model"
              options={['G7', 'G1'] as const}
              value={bcModel}
              onChange={setBcModel}
            />
            <Text style={[type.secondary, styles.warn]}>
              Use the number published for the model you pick. A G1 figure entered against G7
              is the single most damaging mistake in the app — it is roughly twice the value
              and will put you metres low at distance.
            </Text>
            <Row>
              <Half>
                <NumericField
                  label="Length"
                  value={bulletLength}
                  onChangeText={setBulletLength}
                  suffix="in"
                />
              </Half>
              <Half>
                <NumericField
                  label="Diameter"
                  value={bulletDiameter}
                  onChangeText={setBulletDiameter}
                  suffix="in"
                />
              </Half>
            </Row>
            <Text style={[type.secondary, styles.hint]}>
              Length and diameter are optional. With them — plus the rifle&apos;s twist rate —
              the card can also compute spin drift and aerodynamic jump.
            </Text>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text style={type.heading}>Powder, primer, brass</Text>
            <Text style={[type.secondary, styles.hint]}>
              None of this reaches the solver — it is how you tell two loads apart later, and
              how you answer &ldquo;what did I change?&rdquo; when one of them shoots better.
            </Text>
            <Row>
              <Half>
                <Field
                  label="Powder"
                  value={powderName}
                  onChangeText={setPowderName}
                  placeholder="H4350"
                />
              </Half>
              <Half>
                <NumericField
                  label="Charge"
                  value={chargeGr}
                  onChangeText={setChargeGr}
                  suffix="gr"
                />
              </Half>
            </Row>
            <Button
              label="Choose Powder"
              variant="secondary"
              onPress={() => setPowderPickerOpen(true)}
              style={{ marginBottom: spacing.lg }}
            />
            <Field
              label="Primer"
              value={primer}
              onChangeText={setPrimer}
              placeholder="CCI BR-2"
            />
            <Button
              label="Choose Primer"
              variant="secondary"
              onPress={() => setPrimerPickerOpen(true)}
              style={{ marginBottom: spacing.lg }}
            />
            <Row>
              <Half>
                <Field
                  label="Brass"
                  value={brass}
                  onChangeText={setBrass}
                  placeholder="Lapua"
                />
              </Half>
              <Half>
                <NumericField
                  label="Firings"
                  value={brassFirings}
                  onChangeText={setBrassFirings}
                  integer
                />
              </Half>
            </Row>
            <Button
              label="Choose Brass"
              variant="secondary"
              onPress={() => setBrassPickerOpen(true)}
            />
            <Text style={[type.secondary, styles.warn]}>
              The app ships product names only — never charge weights. Work your charge up
              from current manufacturer data in your own rifle.
            </Text>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <Text style={type.heading}>How fast does it leave?</Text>
            <Text style={[type.secondary, styles.hint]}>
              Muzzle velocity sets the whole shape of the curve. A chronograph number is best.
              A manual&apos;s figure is a usable starting point — you can true it against real
              DOPE later, which is what the card&apos;s True-up button does.
            </Text>
            <NumericField
              label="Muzzle velocity"
              value={muzzleVelocity}
              onChangeText={setMuzzleVelocity}
              suffix="fps"
              placeholder="2750"
            />
            <Text style={[type.secondary, styles.hint]}>
              Leave it blank and the card will fall back to the newest chronograph string you
              log for this load.
            </Text>
            <Row>
              <Half>
                <NumericField
                  label="Measured at"
                  value={mvTempRef}
                  onChangeText={setMvTempRef}
                  suffix="°F"
                  signed
                />
              </Half>
              <Half>
                <NumericField
                  label="Temp sens."
                  value={mvTempSens}
                  onChangeText={setMvTempSens}
                  suffix="fps/°F"
                />
              </Half>
            </Row>
            <Text style={[type.secondary, styles.hint]}>
              Both optional, and only useful together: with them the card shifts velocity for
              the temperature on the day. Typical extruded powders run 0.5–1.5 fps/°F.
            </Text>
          </>
        ) : null}

        {step === 4 ? (
          <>
            <Text style={type.heading}>Name it and check</Text>
            <Field
              label="Name *"
              value={effectiveName}
              onChangeText={(v) => {
                setNameTouched(true);
                setName(v);
                setNameError(undefined);
              }}
              placeholder={'e.g. "140 ELD-M / H4350 41.5"'}
              error={nameError}
            />
            {!nameTouched && suggestedName !== '' ? (
              <Text style={[type.secondary, styles.hint]}>
                Suggested from what you entered — edit it if you like.
              </Text>
            ) : null}

            <Card style={{ marginTop: spacing.md }}>
              <Text style={type.label}>What this load can do</Text>
              <ReadyRow ok={cardReady} label="Range card" />
              {!cardReady ? (
                <Text style={[type.secondary, styles.readyNote]}>
                  Needs {!hasBc ? 'a ballistic coefficient' : ''}
                  {!hasBc && !hasMv ? ' and ' : ''}
                  {!hasMv ? 'a muzzle velocity' : ''}. You can add it later and the card will
                  start working.
                </Text>
              ) : null}
              <ReadyRow ok={spinReady} label="Spin drift & aerodynamic jump" />
              {!spinReady ? (
                <Text style={[type.secondary, styles.readyNote]}>
                  Needs bullet weight, length and diameter — plus a twist rate on the rifle.
                </Text>
              ) : null}
              <ReadyRow
                ok={parseDecimal(mvTempSens) != null && parseDecimal(mvTempRef) != null}
                label="Powder temperature correction"
              />
            </Card>

            <Text style={[type.secondary, styles.hint]}>
              Everything else — case prep, dies, bushings, seating depth, runout — lives on the
              load page under the numbered stages. Nothing there is required.
            </Text>
          </>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        {step > 0 ? (
          <Button label="Back" variant="secondary" onPress={back} style={{ flex: 1 }} />
        ) : (
          <Button
            label="Use Full Form"
            variant="secondary"
            onPress={() => router.replace(rifleId ? `/loads/new?rifleId=${rifleId}` : '/loads/new')}
            style={{ flex: 1 }}
          />
        )}
        {step < 4 ? (
          <Button label="Next" onPress={next} style={{ flex: 1 }} />
        ) : (
          <Button label="Create Load" onPress={create} loading={creating} style={{ flex: 1 }} />
        )}
      </View>

      <BulletCatalogModal
        visible={catalogOpen}
        onClose={() => setCatalogOpen(false)}
        onSelect={applyCatalogBullet}
      />
      <ListPickerModal
        visible={powderPickerOpen}
        title="Powder"
        options={POWDER_OPTIONS}
        placeholder="Search powders"
        footer="Product names only — never a charge weight. Work up from current manufacturer data."
        onClose={() => setPowderPickerOpen(false)}
        onSelect={(v) => {
          setPowderName(v);
          setPowderPickerOpen(false);
        }}
      />
      <ListPickerModal
        visible={primerPickerOpen}
        title="Primer"
        options={PRIMER_OPTIONS}
        placeholder="Search primers"
        onClose={() => setPrimerPickerOpen(false)}
        onSelect={(v) => {
          setPrimer(v);
          setPrimerPickerOpen(false);
        }}
      />
      <ListPickerModal
        visible={brassPickerOpen}
        title="Brass"
        options={BRASS_OPTIONS}
        placeholder="Search brass"
        onClose={() => setBrassPickerOpen(false)}
        onSelect={(v) => {
          setBrass(v);
          setBrassPickerOpen(false);
        }}
      />
    </Screen>
  );
}

function ReadyRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <View
      style={styles.readyRow}
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${ok ? 'ready' : 'not yet'}`}
    >
      <View style={[styles.readyDot, ok ? styles.readyDotOk : styles.readyDotOff]} />
      <Text style={[type.body, !ok && { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[type.secondary, { marginLeft: 'auto' }]}>{ok ? 'Ready' : 'Not yet'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  progress: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  tick: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  tickDone: { backgroundColor: colors.accent },
  progressLabel: { paddingHorizontal: spacing.lg, marginTop: spacing.xs },
  body: { padding: spacing.lg, paddingBottom: spacing.xl },
  hint: { marginTop: spacing.xs, marginBottom: spacing.md },
  warn: { marginTop: spacing.xs, marginBottom: spacing.md, color: colors.textTertiary },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  readyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  readyDot: { width: 9, height: 9, borderRadius: 999 },
  readyDotOk: { backgroundColor: colors.accent },
  readyDotOff: { backgroundColor: colors.border },
  readyNote: { marginTop: 2, marginLeft: 17 },
});
