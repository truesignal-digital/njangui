import { Image, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Full-screen viewer for proof photos. Pinch-to-zoom comes from ScrollView's
 * native zoom (maximumZoomScale) — no gesture library needed. Rendered as a
 * plain fullScreen Modal so it works from any screen without a route.
 */
export function ImagePreviewModal({
  uri,
  onClose,
}: {
  uri: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={uri !== null}
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black">
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1 }}
          maximumZoomScale={5}
          minimumZoomScale={1}
          bouncesZoom
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
        >
          {uri ? (
            <Image
              source={{ uri }}
              resizeMode="contain"
              style={{ flex: 1, width: '100%' }}
              accessibilityLabel={t('payment.proofImage')}
            />
          ) : null}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          onPress={onClose}
          style={{ position: 'absolute', top: insets.top + 8, right: 16 }}
          className="rounded-pill bg-black/60 px-md py-xs"
        >
          <Text className="font-body-medium text-body text-white">
            ✕ {t('common.close')}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}
