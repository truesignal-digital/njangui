import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import type { GroupPurpose } from '@/lib/group-summary';

export function GroupPurposeTag({
  purpose,
  compact = false,
}: {
  purpose: GroupPurpose;
  compact?: boolean;
}) {
  const { t } = useTranslation();

  return (
    <View
      className={
        compact
          ? 'rounded-pill bg-success-bg px-xs py-[2px]'
          : 'rounded-pill bg-success-bg px-sm py-xs'
      }
    >
      <Text
        numberOfLines={1}
        className={
          compact
            ? 'font-body-semi text-overline text-success-dark'
            : 'font-body-semi text-caption text-success-dark'
        }
      >
        {t(`groups.purpose.${purpose}`)}
      </Text>
    </View>
  );
}
