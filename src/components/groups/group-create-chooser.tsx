import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  ArrowPathRoundedSquareIcon,
  KeyIcon,
  SparklesIcon,
} from 'react-native-heroicons/outline';

import { useAppTheme } from '@/lib/theme';
import { ChoiceCard } from '@/components/groups/choice-card';

export function GroupCreateChooser({
  onContribution,
  onNjangi,
  onJoin,
}: {
  onContribution: () => void;
  onNjangi: () => void;
  onJoin: () => void;
}) {
  const { t } = useTranslation();
  const theme = useAppTheme();

  return (
    <View className="gap-lg">
      <View className="gap-xs">
        <Text className="font-heading text-display-lg text-foreground">
          {t('groups.unifiedChooser.title')}
        </Text>
        <Text className="font-body text-body-sm text-muted">
          {t('groups.unifiedChooser.subtitle')}
        </Text>
      </View>

      <View className="gap-sm">
        <ChoiceCard
          dominant
          title={t('groups.unifiedChooser.contributionTitle')}
          description={t('groups.unifiedChooser.contributionBody')}
          icon={<SparklesIcon size={22} color={theme.textInverted} />}
          onPress={onContribution}
          testID="choose-contribution"
        />
        <ChoiceCard
          title={t('groups.unifiedChooser.njangiTitle')}
          description={t('groups.unifiedChooser.njangiBody')}
          icon={
            <ArrowPathRoundedSquareIcon
              size={22}
              color={theme.successDark}
            />
          }
          onPress={onNjangi}
          testID="choose-njangi"
        />
        <ChoiceCard
          title={t('groups.unifiedChooser.joinTitle')}
          description={t('groups.unifiedChooser.joinBody')}
          icon={<KeyIcon size={22} color={theme.successDark} />}
          onPress={onJoin}
          testID="choose-invitation"
        />
      </View>

      <Text className="text-center font-body text-caption text-muted">
        {t('groups.unifiedChooser.safety')}
      </Text>
    </View>
  );
}
