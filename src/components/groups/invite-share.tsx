import { Pressable, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useTranslation } from 'react-i18next';
import { DocumentDuplicateIcon, ShareIcon } from 'react-native-heroicons/outline';
import { toast } from 'sonner-native';

import { haptics } from '../../lib/haptics';
import { useAppTheme } from '../../lib/theme';
import { AppButton } from '../ui/button';

/**
 * Invite code + WhatsApp share (docs/03 B9 step 4 / B2 settings).
 * Mobile-only decision (2026-06-11): no web /j/:code layer — the WhatsApp
 * share is plain text carrying the 6-char code; recipients enter it via
 * « J'ai un code ». WhatsApp is the primary funnel.
 */
export function InviteShare({
  inviteCode,
  groupName,
}: {
  inviteCode: string;
  groupName: string;
}) {
  const { t } = useTranslation();
  const theme = useAppTheme();

  const copyCode = async () => {
    try {
      await Clipboard.setStringAsync(inviteCode);
      haptics.success();
      toast.success(t('groups.invite.copiedToast'));
    } catch {
      toast.error(t('common.error'));
    }
  };

  const shareOnWhatsApp = async () => {
    const message = t('groups.invite.whatsappMessage', { groupName, code: inviteCode });
    const url = `https://wa.me/?text=${encodeURIComponent(message)}`;
    try {
      await Linking.openURL(url);
    } catch {
      toast.error(t('common.error'));
    }
  };

  return (
    <View className="gap-sm">
      <View className="gap-xs">
        <Text className="font-body-medium text-caption text-muted">
          {t('groups.invite.codeLabel')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('groups.invite.copyCode')}
          onPress={() => void copyCode()}
          className="min-h-cta flex-row items-center justify-between gap-xs rounded-lg border border-border bg-surface-muted px-md py-xs active:bg-surface-recessed"
        >
          <Text className="font-mono-bold text-price-lg tracking-[4px] text-foreground">
            {inviteCode}
          </Text>
          <DocumentDuplicateIcon size={18} color={theme.textMuted} />
        </Pressable>
      </View>
      <AppButton
        label={t('groups.invite.whatsapp')}
        icon={<ShareIcon size={18} color={theme.primaryForeground} />}
        onPress={() => void shareOnWhatsApp()}
      />
    </View>
  );
}
