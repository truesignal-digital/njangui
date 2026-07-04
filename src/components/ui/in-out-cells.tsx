import { Text, View } from 'react-native';

/**
 * Side-by-side money in/out cells (money-hero iter-3): « À payer » vs
 * « À recevoir » on home, « sorties/entrées <mois> » on the calendar.
 * Amounts arrive pre-formatted (formatCurrencyXAF) — no math here.
 */
export function InOutCells({
  payLabel,
  payAmount,
  receiveLabel,
  receiveAmount,
}: {
  payLabel: string;
  payAmount: string;
  receiveLabel: string;
  receiveAmount: string;
}) {
  return (
    <View className="flex-row gap-sm">
      <View className="flex-1 gap-1 rounded-md bg-surface-muted px-md py-sm">
        <Text
          numberOfLines={1}
          className="font-body-semi text-caption uppercase text-muted"
        >
          {payLabel}
        </Text>
        <Text numberOfLines={1} className="font-body-semi text-title-lg text-foreground">
          {payAmount}
        </Text>
      </View>
      <View className="flex-1 gap-1 rounded-md bg-surface-muted px-md py-sm">
        <Text
          numberOfLines={1}
          className="font-body-semi text-caption uppercase text-muted"
        >
          {receiveLabel}
        </Text>
        <Text
          numberOfLines={1}
          className="font-body-semi text-title-lg text-success-dark"
        >
          {receiveAmount}
        </Text>
      </View>
    </View>
  );
}
