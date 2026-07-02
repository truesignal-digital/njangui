import { Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

/**
 * Setup readiness checklist (docs 02 §a lock guards, made visible): who's
 * missing before the president can lock the cycle, plus a projected season
 * — "N tours · du X au Y" — computed from schedule + member count so the
 * group can SEE that waiting for one more member pushes the last pot out
 * another period. Estimates only; the real dates are set at lock.
 */

type Schedule = 'weekly' | 'biweekly' | 'monthly';

function addPeriods(start: Date, schedule: Schedule, periods: number): Date {
  const d = new Date(start);
  if (schedule === 'monthly') {
    d.setMonth(d.getMonth() + periods);
  } else {
    d.setDate(d.getDate() + periods * (schedule === 'weekly' ? 7 : 14));
  }
  return d;
}

/** Next occurrence of the meeting weekday, at least a few days out. */
function estimatedFirstRound(meetingDayOfWeek: number | undefined): Date {
  const now = new Date();
  if (meetingDayOfWeek === undefined) {
    now.setDate(now.getDate() + 7);
    return now;
  }
  const delta = (meetingDayOfWeek - now.getDay() + 7) % 7 || 7;
  now.setDate(now.getDate() + delta);
  return now;
}

function CheckLine({
  ok,
  label,
  hint,
}: {
  ok: boolean;
  label: string;
  hint?: string;
}) {
  return (
    <View className="flex-row items-center gap-sm">
      <Text
        className={
          ok
            ? 'font-body-semi text-body-sm text-success-dark'
            : 'font-body-semi text-body-sm text-placeholder'
        }
      >
        {ok ? '✓' : '○'}
      </Text>
      <Text className="flex-1 font-body text-body-sm text-foreground">
        {label}
        {!ok && hint ? (
          <Text className="font-body text-body-sm text-muted"> — {hint}</Text>
        ) : null}
      </Text>
    </View>
  );
}

export function ReadinessCard({
  activeMemberCount,
  targetMemberCount,
  hasPresident,
  hasTreasurer,
  schedule,
  meetingDayOfWeek,
}: {
  activeMemberCount: number;
  targetMemberCount?: number;
  hasPresident: boolean;
  hasTreasurer: boolean;
  schedule: Schedule;
  meetingDayOfWeek?: number;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB';

  const membersOk =
    activeMemberCount >= Math.max(2, targetMemberCount ?? 2) ||
    (targetMemberCount === undefined && activeMemberCount >= 2);
  const membersLabel =
    targetMemberCount !== undefined
      ? t('groups.readiness.membersOfTarget', {
          count: activeMemberCount,
          target: targetMemberCount,
        })
      : t('groups.memberCount', { count: activeMemberCount });

  const canProject = activeMemberCount >= 2;
  const start = estimatedFirstRound(meetingDayOfWeek);
  const end = addPeriods(start, schedule, Math.max(0, activeMemberCount - 1));
  const fmt = (d: Date) =>
    d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });

  return (
    <View className="mt-lg gap-sm rounded-xl border border-accent-muted bg-accent-faint p-md">
      <Text className="font-body-semi text-body text-foreground">
        {t('groups.readiness.title')}
      </Text>
      <CheckLine
        ok={membersOk}
        label={membersLabel}
        hint={
          activeMemberCount < 2 ? t('groups.readiness.minMembers') : undefined
        }
      />
      <CheckLine
        ok={hasTreasurer}
        label={t('groups.roles.treasurer')}
        hint={t('groups.readiness.toAssign')}
      />
      <CheckLine
        ok={hasPresident}
        label={t('groups.roles.president')}
        hint={t('groups.readiness.presidentHint')}
      />
      {canProject ? (
        <Text className="pt-xs font-body text-body-sm text-muted">
          {t('groups.readiness.projection', {
            count: activeMemberCount,
            start: fmt(start),
            end: fmt(end),
          })}
        </Text>
      ) : null}
    </View>
  );
}
