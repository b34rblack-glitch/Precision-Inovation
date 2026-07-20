import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button } from '@/components/Buttons';
import { Chip } from '@/components/Chip';
import { CollapsibleSection, Field, Half, NumericField, Row, Segmented } from '@/components/Form';
import { LoadComponentValues } from '@/db/repositories/loads';
import { activeRiflesQuery } from '@/db/repositories/rifles';
import { Load, LoadVersion } from '@/db/schema';
import { parseDecimal } from '@/lib/parse';
import { colors, spacing, type } from '@/theme';

export type LoadFormResult = {
  meta: { name: string; cartridge: string | null; rifleId: string | null };
  components: LoadComponentValues;
};

const str = (s: string): string | null => (s.trim() === '' ? null : s.trim());

type Errors = Partial<
  Record<'name' | 'bulletWeight' | 'bcValue' | 'chargeGr' | 'brassFirings' | 'cbto' | 'coal' | 'mv', string>
>;

type Props = {
  initialLoad?: Load;
  initialVersion?: LoadVersion;
  /** Preselects a rifle when creating a new load (ignored when editing). */
  defaultRifleId?: string | null;
  submitLabel: string;
  onSubmit: (result: LoadFormResult) => void | Promise<void>;
};

export function LoadForm({ initialLoad, initialVersion, defaultRifleId, submitLabel, onSubmit }: Props) {
  const navigation = useNavigation();
  const { data: rifles } = useLiveQuery(activeRiflesQuery());

  const initialRifleId = initialLoad ? (initialLoad.rifleId ?? null) : (defaultRifleId ?? null);
  const [name, setName] = useState(initialLoad?.name ?? '');
  const [cartridge, setCartridge] = useState(initialLoad?.cartridge ?? '');
  const [rifleId, setRifleId] = useState<string | null>(initialRifleId);

  const [bulletMake, setBulletMake] = useState(initialVersion?.bulletMake ?? '');
  const [bulletModel, setBulletModel] = useState(initialVersion?.bulletModel ?? '');
  const [bulletWeight, setBulletWeight] = useState(initialVersion?.bulletWeightGr?.toString() ?? '');
  const [bcValue, setBcValue] = useState(initialVersion?.bcValue?.toString() ?? '');
  const [bcModel, setBcModel] = useState<'G1' | 'G7'>(initialVersion?.bcModel ?? 'G7');
  const [powderName, setPowderName] = useState(initialVersion?.powderName ?? '');
  const [chargeGr, setChargeGr] = useState(initialVersion?.chargeGr?.toString() ?? '');
  const [primer, setPrimer] = useState(initialVersion?.primer ?? '');
  const [brass, setBrass] = useState(initialVersion?.brass ?? '');
  const [brassFirings, setBrassFirings] = useState(initialVersion?.brassFirings?.toString() ?? '');
  const [cbto, setCbto] = useState(initialVersion?.cbtoIn?.toString() ?? '');
  const [coal, setCoal] = useState(initialVersion?.coalIn?.toString() ?? '');
  const [crimp, setCrimp] = useState(initialVersion?.crimp ?? '');
  const [mv, setMv] = useState(initialVersion?.muzzleVelocityFps?.toString() ?? '');
  const [notes, setNotes] = useState(initialVersion?.notes ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);

  const dirty =
    name !== (initialLoad?.name ?? '') ||
    cartridge !== (initialLoad?.cartridge ?? '') ||
    rifleId !== initialRifleId ||
    bulletMake !== (initialVersion?.bulletMake ?? '') ||
    bulletModel !== (initialVersion?.bulletModel ?? '') ||
    bulletWeight !== (initialVersion?.bulletWeightGr?.toString() ?? '') ||
    bcValue !== (initialVersion?.bcValue?.toString() ?? '') ||
    bcModel !== (initialVersion?.bcModel ?? 'G7') ||
    powderName !== (initialVersion?.powderName ?? '') ||
    chargeGr !== (initialVersion?.chargeGr?.toString() ?? '') ||
    primer !== (initialVersion?.primer ?? '') ||
    brass !== (initialVersion?.brass ?? '') ||
    brassFirings !== (initialVersion?.brassFirings?.toString() ?? '') ||
    cbto !== (initialVersion?.cbtoIn?.toString() ?? '') ||
    coal !== (initialVersion?.coalIn?.toString() ?? '') ||
    crimp !== (initialVersion?.crimp ?? '') ||
    mv !== (initialVersion?.muzzleVelocityFps?.toString() ?? '') ||
    notes !== (initialVersion?.notes ?? '');

  // While submitting the guard is down so the post-save navigation goes through;
  // a failed save re-arms it (submitting resets to false).
  usePreventRemove(dirty && !submitting, ({ data }) => {
    Alert.alert('Discard changes?', 'You have unsaved edits on this load.', [
      { text: 'Keep Editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  const clearError = (key: keyof Errors) =>
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));

  const submit = async () => {
    const errs: Errors = {};
    // Non-empty but unparseable numbers block submit; empty stays null.
    const num = (value: string, key: keyof Errors): number | null => {
      if (value.trim() === '') return null;
      const n = parseDecimal(value);
      if (n === null) errs[key] = 'Enter a number like 41.5';
      return n;
    };
    if (name.trim() === '') errs.name = 'Name is required — everything else is optional.';
    const bulletWeightGr = num(bulletWeight, 'bulletWeight');
    const bc = num(bcValue, 'bcValue');
    if (bc !== null && bc <= 0 && !errs.bcValue) errs.bcValue = 'BC must be greater than 0.';
    const charge = num(chargeGr, 'chargeGr');
    const firings = num(brassFirings, 'brassFirings');
    const cbtoIn = num(cbto, 'cbto');
    const coalIn = num(coal, 'coal');
    const muzzleVelocityFps = num(mv, 'mv');
    if (Object.values(errs).some(Boolean)) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await onSubmit({
        meta: { name: name.trim(), cartridge: str(cartridge), rifleId },
        components: {
          bulletMake: str(bulletMake),
          bulletModel: str(bulletModel),
          bulletWeightGr,
          bcValue: bc,
          bcModel,
          powderName: str(powderName),
          chargeGr: charge,
          primer: str(primer),
          brass: str(brass),
          brassFirings: firings != null ? Math.round(firings) : null,
          cbtoIn,
          coalIn,
          crimp: str(crimp),
          muzzleVelocityFps,
          notes: str(notes),
        },
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View>
      <Field
        label="Name *"
        value={name}
        onChangeText={(v) => {
          setName(v);
          clearError('name');
        }}
        placeholder={'e.g. "140 ELD-M / H4350 41.5"'}
        autoFocus={!initialLoad}
        error={errors.name}
      />
      <Field label="Cartridge" value={cartridge} onChangeText={setCartridge} placeholder="6.5 Creedmoor" />

      <Text style={type.label}>Rifle</Text>
      <View style={{ marginBottom: spacing.lg, marginTop: spacing.xs }}>
        {rifles.length === 0 ? (
          <Text style={type.secondary}>No rifles yet — this load can stay unassigned.</Text>
        ) : (
          <View style={styles.chipWrap}>
            <Chip label="Unassigned" selected={rifleId === null} onPress={() => setRifleId(null)} />
            {rifles.map((r) => (
              <Chip key={r.id} label={r.name} selected={rifleId === r.id} onPress={() => setRifleId(r.id)} />
            ))}
          </View>
        )}
      </View>

      <CollapsibleSection title="Bullet" initiallyOpen>
        <Row>
          <Half>
            <Field label="Make" value={bulletMake} onChangeText={setBulletMake} placeholder="Hornady" />
          </Half>
          <Half>
            <Field label="Model" value={bulletModel} onChangeText={setBulletModel} placeholder="ELD-M" />
          </Half>
        </Row>
        <Row>
          <Half>
            <NumericField
              label="Weight"
              value={bulletWeight}
              onChangeText={(v) => {
                setBulletWeight(v);
                clearError('bulletWeight');
              }}
              suffix="gr"
              error={errors.bulletWeight}
            />
          </Half>
          <Half>
            <NumericField
              label="BC"
              value={bcValue}
              onChangeText={(v) => {
                setBcValue(v);
                clearError('bcValue');
              }}
              placeholder="0.326"
              error={errors.bcValue}
            />
          </Half>
        </Row>
        <Segmented label="BC model" options={['G7', 'G1'] as const} value={bcModel} onChange={setBcModel} />
      </CollapsibleSection>

      <CollapsibleSection title="Powder & primer" initiallyOpen>
        <Row>
          <Half>
            <Field label="Powder" value={powderName} onChangeText={setPowderName} placeholder="H4350" />
          </Half>
          <Half>
            <NumericField
              label="Charge"
              value={chargeGr}
              onChangeText={(v) => {
                setChargeGr(v);
                clearError('chargeGr');
              }}
              suffix="gr"
              error={errors.chargeGr}
            />
          </Half>
        </Row>
        <Field label="Primer" value={primer} onChangeText={setPrimer} placeholder="CCI BR-2" />
      </CollapsibleSection>

      <CollapsibleSection title="Brass & seating">
        <Row>
          <Half>
            <Field label="Brass" value={brass} onChangeText={setBrass} placeholder="Lapua" />
          </Half>
          <Half>
            <NumericField
              label="Firings"
              value={brassFirings}
              onChangeText={(v) => {
                setBrassFirings(v);
                clearError('brassFirings');
              }}
              integer
              error={errors.brassFirings}
            />
          </Half>
        </Row>
        <Row>
          <Half>
            <NumericField
              label="CBTO"
              value={cbto}
              onChangeText={(v) => {
                setCbto(v);
                clearError('cbto');
              }}
              suffix="in"
              error={errors.cbto}
            />
          </Half>
          <Half>
            <NumericField
              label="COAL"
              value={coal}
              onChangeText={(v) => {
                setCoal(v);
                clearError('coal');
              }}
              suffix="in"
              error={errors.coal}
            />
          </Half>
        </Row>
        <Field label="Crimp" value={crimp} onChangeText={setCrimp} placeholder="None" />
      </CollapsibleSection>

      <CollapsibleSection title="Velocity & notes">
        <NumericField
          label="Muzzle velocity (avg)"
          value={mv}
          onChangeText={(v) => {
            setMv(v);
            clearError('mv');
          }}
          suffix="fps"
          error={errors.mv}
        />
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Anything worth remembering about this recipe…" />
      </CollapsibleSection>

      <Text style={[type.secondary, { marginBottom: spacing.md, color: colors.textTertiary }]}>
        Editing a load that already has range history creates a new version automatically — your
        old results stay tied to the exact recipe that produced them.
      </Text>

      <Button label={submitLabel} onPress={submit} loading={submitting} />
    </View>
  );
}

const styles = StyleSheet.create({
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
