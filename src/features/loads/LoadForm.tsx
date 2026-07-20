import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { Button } from '@/components/Buttons';
import { CollapsibleSection, Field, Half, NumericField, Row, Segmented } from '@/components/Form';
import { LoadComponentValues } from '@/db/repositories/loads';
import { activeRiflesQuery } from '@/db/repositories/rifles';
import { Load, LoadVersion } from '@/db/schema';
import { colors, spacing, type } from '@/theme';

export type LoadFormResult = {
  meta: { name: string; cartridge: string | null; rifleId: string | null };
  components: LoadComponentValues;
};

const num = (s: string): number | null => {
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : null;
};
const str = (s: string): string | null => (s.trim() === '' ? null : s.trim());

type Props = {
  initialLoad?: Load;
  initialVersion?: LoadVersion;
  submitLabel: string;
  onSubmit: (result: LoadFormResult) => void;
};

export function LoadForm({ initialLoad, initialVersion, submitLabel, onSubmit }: Props) {
  const { data: rifles } = useLiveQuery(activeRiflesQuery());

  const [name, setName] = useState(initialLoad?.name ?? '');
  const [cartridge, setCartridge] = useState(initialLoad?.cartridge ?? '');
  const [rifleId, setRifleId] = useState<string | null>(initialLoad?.rifleId ?? null);

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

  const submit = () => {
    if (name.trim() === '') {
      Alert.alert('Name required', 'Give this load a name — everything else is optional.');
      return;
    }
    onSubmit({
      meta: { name: name.trim(), cartridge: str(cartridge), rifleId },
      components: {
        bulletMake: str(bulletMake),
        bulletModel: str(bulletModel),
        bulletWeightGr: num(bulletWeight),
        bcValue: num(bcValue),
        bcModel,
        powderName: str(powderName),
        chargeGr: num(chargeGr),
        primer: str(primer),
        brass: str(brass),
        brassFirings: brassFirings ? Math.round(num(brassFirings) ?? 0) : null,
        cbtoIn: num(cbto),
        coalIn: num(coal),
        crimp: str(crimp),
        muzzleVelocityFps: num(mv),
        notes: str(notes),
      },
    });
  };

  return (
    <View>
      <Field
        label="Name *"
        value={name}
        onChangeText={setName}
        placeholder={'e.g. "140 ELD-M / H4350 41.5"'}
        autoFocus={!initialLoad}
      />
      <Field label="Cartridge" value={cartridge} onChangeText={setCartridge} placeholder="6.5 Creedmoor" />

      <Text style={type.label}>Rifle</Text>
      <View style={{ marginBottom: spacing.lg, marginTop: spacing.xs }}>
        {rifles.length === 0 ? (
          <Text style={type.secondary}>No rifles yet — this load can stay unassigned.</Text>
        ) : (
          <Segmented
            label=""
            options={['Unassigned', ...rifles.map((r) => r.name)] as const}
            value={rifles.find((r) => r.id === rifleId)?.name ?? 'Unassigned'}
            onChange={(label) =>
              setRifleId(label === 'Unassigned' ? null : rifles.find((r) => r.name === label)?.id ?? null)
            }
          />
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
            <NumericField label="Weight" value={bulletWeight} onChangeText={setBulletWeight} suffix="gr" />
          </Half>
          <Half>
            <NumericField label="BC" value={bcValue} onChangeText={setBcValue} placeholder="0.326" />
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
            <NumericField label="Charge" value={chargeGr} onChangeText={setChargeGr} suffix="gr" />
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
            <NumericField label="Firings" value={brassFirings} onChangeText={setBrassFirings} />
          </Half>
        </Row>
        <Row>
          <Half>
            <NumericField label="CBTO" value={cbto} onChangeText={setCbto} suffix="in" />
          </Half>
          <Half>
            <NumericField label="COAL" value={coal} onChangeText={setCoal} suffix="in" />
          </Half>
        </Row>
        <Field label="Crimp" value={crimp} onChangeText={setCrimp} placeholder="None" />
      </CollapsibleSection>

      <CollapsibleSection title="Velocity & notes">
        <NumericField label="Muzzle velocity (avg)" value={mv} onChangeText={setMv} suffix="fps" />
        <Field label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Anything worth remembering about this recipe…" />
      </CollapsibleSection>

      <Text style={[type.secondary, { marginBottom: spacing.md, color: colors.textTertiary }]}>
        Editing a load that already has range history creates a new version automatically — your
        old results stay tied to the exact recipe that produced them.
      </Text>

      <Button label={submitLabel} onPress={submit} />
    </View>
  );
}
