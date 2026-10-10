import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { router, useGlobalSearchParams } from 'expo-router';
import { useAction, useConvexAuth, useMutation, useQuery } from 'convex/react';
import { toast } from 'sonner-native';

import { api, type Id } from '@/lib/convex-api';
import { useClerk, useSignIn } from '@/lib/clerk-client';
import {
  consumePendingPilotGroup,
  isPilotOffline,
  setPendingPilotGroup,
  setPilotOffline,
} from '@/lib/dev-pilot';

import { PictogramGallery } from './pictogram-gallery';

// Test phones (555-01XX block). Slots mirror convex/dev.ts DEV_TEST_PHONES:
// the seed puts .treasurer/.member on real memberships, so signing in as
// them attaches those memberships — the two-sided handshake is drivable
// in the sim.
const TEST_USERS = [
  { label: 'P', phone: '+12015550100', hint: 'président' },
  { label: 'T', phone: '+12015550101', hint: 'trésorier' },
  { label: 'M', phone: '+12015550102', hint: 'membre' },
] as const;

/**
 * DEV-only auto sign-in. User-facing auth is username+password + Google
 * SSO, so the pills call devLoginTicket — the server resolves/creates the
 * dev Clerk user, provisions the Convex row (test phone + seeded-membership
 * attach) and returns a short-TTL Clerk ticket. Env-gated server-side
 * (DEV_SEED_ENABLED). One tap per identity.
 */
export function DevAuthButton() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const devLoginTicket = useAction(api.dev.devLoginTicket);
  const [busyPhone, setBusyPhone] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const run = async (phone: string) => {
    if (!isLoaded || !signIn) return;
    setBusyPhone(phone);
    setStatus('minting dev ticket…');
    try {
      const minted = await devLoginTicket({ phone });
      if (!minted.ok || !minted.ticket) {
        throw new Error('dev ticket mint failed');
      }
      const attempt = await signIn.create({
        strategy: 'ticket',
        ticket: minted.ticket,
      });
      if (attempt.status === 'complete' && setActive) {
        await setActive({ session: attempt.createdSessionId });
        return;
      }
      throw new Error(`ticket sign-in status ${attempt.status}`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'dev auth failed');
      setBusyPhone(null);
    }
  };

  return (
    <View className="absolute inset-x-0 bottom-[40px] items-center">
      <View className="flex-row items-center gap-sm">
        {TEST_USERS.map((u) => (
          <Pressable
            key={u.phone}
            testID={`dev-signin-${u.label}`}
            onPress={() => void run(u.phone)}
            disabled={busyPhone !== null}
            className="flex-row items-center gap-xs rounded-pill border border-dashed border-accent bg-accent-faint px-lg py-sm"
          >
            {busyPhone === u.phone ? (
              <ActivityIndicator size="small" color="#b45309" />
            ) : null}
            <Text className="font-body-semi text-body-sm text-accent">
              DEV {u.label} ({u.hint})
            </Text>
          </Pressable>
        ))}
      </View>
      {status ? (
        <Text className="mt-xs px-lg text-center font-body text-caption text-muted">
          {status}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * DEV-only floating cluster in the authed area: seed a group, start+open a
 * round on the group being viewed, and sign out to switch test identities.
 * Kept top-right, clear of bottom CTAs (audit P1: never overlay form CTAs).
 */
export function DevSeedButton() {
  const { isAuthenticated } = useConvexAuth();
  const { signOut } = useClerk();
  const params = useGlobalSearchParams<{ groupId?: string }>();
  const devSeedPilot = useAction(api.dev.devSeedPilot);
  const devStartAndOpenRound = useMutation(api.dev.devStartAndOpenRound);
  const devAdvancePilotRound = useAction(api.dev.devAdvancePilotRound);
  const activeGroup = useQuery(
    api.groups.getGroup,
    isAuthenticated && params.groupId
      ? { groupId: params.groupId as Id<'groups'> }
      : 'skip'
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [scenario, setScenario] = useState(0);
  const [stateLine, setStateLine] = useState('Ready to create the mock group');
  const [offline, setOffline] = useState(false);
  const [showPictograms, setShowPictograms] = useState(false);

  useEffect(() => {
    void isPilotOffline().then(setOffline);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || params.groupId) return;
    void consumePendingPilotGroup().then((groupId) => {
      if (!groupId) return;
      router.replace({
        pathname: '/groups/[groupId]',
        params: { groupId },
      });
    });
  }, [isAuthenticated, params.groupId]);

  if (!isAuthenticated) return null;

  const seed = async () => {
    setBusy('seed');
    try {
      const { groupId } = await devSeedPilot({});
      await setPendingPilotGroup(groupId);
      setStateLine('Njangi Solidarité · 15 members · draft cycle');
      toast.success('pilot seeded — sign in as P to begin');
      await signOut();
      router.replace('/sign-in');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'pilot seed failed');
    } finally {
      setBusy(null);
    }
  };

  const openRound = async () => {
    if (!params.groupId) return;
    setBusy('round');
    try {
      const result = await devStartAndOpenRound({
        groupId: params.groupId as Id<'groups'>,
      });
      setStateLine(
        `Round ${result.opened ? 'opened' : 'already open'} · 16 obligations expected`
      );
      toast.success(`round ${result.opened ? 'opened' : 'already open'}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'open round failed');
    } finally {
      setBusy(null);
    }
  };

  const advance = async (
    step: 'open_next' | 'to_grace' | 'to_close' | 'expire_claims'
  ) => {
    if (!params.groupId) return;
    setBusy(step);
    try {
      const result = await devAdvancePilotRound({
        groupId: params.groupId as Id<'groups'>,
        step,
      });
      setStateLine(
        `Round ${result.roundIndex ?? '—'} · ${result.roundStatus ?? 'no active round'}`
      );
      toast.success(`pilot: ${step}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `pilot ${step} failed`);
    } finally {
      setBusy(null);
    }
  };

  const switchUser = async () => {
    setBusy('switch');
    try {
      await signOut();
      router.replace('/sign-in');
    } finally {
      setBusy(null);
    }
  };

  const scenarios = [
    ['Round 1 · Normal meeting', '15 contributions and one payout'],
    ['Round 2 · Unreliable network', '15 unique entries · no loss · no duplicate'],
    ['Round 3 · Exceptions', 'Partial, dispute, withdrawal and arrears'],
    ['Round 4 · Governance', 'Correction, order and treasurer handover'],
  ] as const;

  return (
    <>
      {/* Bottom-right above the tab bar: the top-right corner belongs to
          real controls (profile avatar, Groups +) and the Expo dev gear —
          the pilot pill must never intercept their taps. */}
      <Pressable
        testID="dev-open-console"
        onPress={() => setOpen(true)}
        className="rounded-pill border border-dashed border-accent bg-inverted-bg px-md py-xs"
        style={{ position: 'absolute', bottom: 110, right: 12 }}
      >
        <Text className="font-mono text-caption text-accent">DEV · PILOT</Text>
      </Pressable>
      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setOpen(false)}
      >
        <ScrollView
          className="flex-1 bg-inverted-bg"
          contentContainerClassName="gap-md px-lg pb-xxl pt-xxl"
        >
          <View className="flex-row items-start justify-between gap-sm">
            <View className="min-w-0 flex-1">
              <Text className="font-heading text-headline text-inverted">
                Pilot control
              </Text>
              <Text className="font-mono text-caption uppercase text-inverted-muted">
                Njangi Solidarité · 15 members
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close pilot control"
              testID="dev-close-console"
              onPress={() => setOpen(false)}
              className="h-[40px] w-[40px] items-center justify-center rounded-md bg-surface-muted"
            >
              <Text className="font-heading text-title text-inverted">×</Text>
            </Pressable>
          </View>

          <Text className="font-mono text-caption uppercase text-inverted-muted">
            Active identity
          </Text>
          <View className="flex-row gap-xs">
            {TEST_USERS.map((user) => (
              <Pressable
                key={user.label}
                testID={`dev-console-persona-${user.label}`}
                onPress={() => void switchUser()}
                disabled={busy !== null}
                className="min-h-[52px] flex-1 items-center justify-center rounded-md bg-surface-muted px-xs"
              >
                <Text className="font-mono text-body text-accent">{user.label}</Text>
                <Text className="font-body text-caption text-inverted-muted">
                  {user.hint}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text className="font-body text-caption text-inverted-muted">
            Switching signs out safely; choose P, T or M on the next screen.
          </Text>

          <Text className="font-mono text-caption uppercase text-inverted-muted">
            Scenario
          </Text>
          <View className="rounded-xl border border-border bg-surface p-md">
            <Text className="font-body-semi text-body text-foreground">
              {scenarios[scenario][0]}
            </Text>
            <Text className="pt-[2px] font-body text-caption text-muted">
              {scenarios[scenario][1]}
            </Text>
            <View className="mt-sm flex-row gap-xs">
              {scenarios.map((_, index) => (
                <Pressable
                  key={index}
                  accessibilityRole="button"
                  testID={`dev-scenario-${index + 1}`}
                  onPress={() => setScenario(index)}
                  className={
                    index <= scenario
                      ? 'h-[8px] flex-1 rounded-pill bg-accent'
                      : 'h-[8px] flex-1 rounded-pill bg-surface-recessed'
                  }
                />
              ))}
            </View>
            <View className="mt-md border-t border-border-subtle pt-sm">
              <Text className="font-body-semi text-caption text-muted">
                CURRENT STATE
              </Text>
              <Text className="pt-[2px] font-body-medium text-body-sm text-foreground">
                {stateLine}
              </Text>
            </View>
          </View>

          <Pressable
            testID="dev-seed-pilot"
            onPress={() => void seed()}
            disabled={busy !== null}
            className="min-h-cta flex-row items-center justify-center gap-xs rounded-lg bg-accent px-lg"
          >
            {busy === 'seed' ? <ActivityIndicator size="small" color="#0c1222" /> : null}
            <Text className="font-body-semi text-body text-primary-fg">
              Create fresh pilot group
            </Text>
          </Pressable>
          {params.groupId ? (
            <View className="gap-xs">
              <DevConsoleButton
                label={
                  activeGroup?.viewerRole === 'president'
                    ? 'Start cycle and open round'
                    : 'Switch to president to start the round'
                }
                testID="dev-open-round"
                busy={busy === 'round'}
                disabled={
                  busy !== null || activeGroup?.viewerRole !== 'president'
                }
                onPress={() => void openRound()}
              />
              <DevConsoleButton
                label="Move round to grace"
                testID="dev-to-grace"
                busy={busy === 'to_grace'}
                disabled={busy !== null}
                onPress={() => void advance('to_grace')}
              />
              <DevConsoleButton
                label="Age claim timers by 8 days"
                testID="dev-expire-claims"
                busy={busy === 'expire_claims'}
                disabled={busy !== null}
                onPress={() => void advance('expire_claims')}
              />
              <DevConsoleButton
                label={
                  offline
                    ? 'Restore Meeting Mode network'
                    : 'Simulate Meeting Mode offline'
                }
                testID="dev-toggle-offline"
                busy={false}
                disabled={busy !== null}
                onPress={() =>
                  void (async () => {
                    const next = !offline;
                    await setPilotOffline(next);
                    setOffline(next);
                    setStateLine(
                      next
                        ? 'Meeting Mode offline · taps stay on this phone'
                        : 'Meeting Mode online · queued taps will replay'
                    );
                  })()
                }
              />
              <DevConsoleButton
                label="Close current round"
                testID="dev-to-close"
                busy={busy === 'to_close'}
                disabled={busy !== null}
                onPress={() => void advance('to_close')}
              />
              <DevConsoleButton
                label="Open next round"
                testID="dev-open-next"
                busy={busy === 'open_next'}
                disabled={busy !== null}
                onPress={() => void advance('open_next')}
              />
            </View>
          ) : null}
          <DevConsoleButton
            label={showPictograms ? 'Hide pictogram gallery' : 'Show pictogram gallery'}
            testID="dev-pictogram-gallery"
            busy={false}
            disabled={false}
            onPress={() => setShowPictograms((shown) => !shown)}
          />
          {showPictograms ? <PictogramGallery /> : null}
          <Text className="font-body text-caption text-inverted-muted">
            Visible only in development. Lifecycle controls use production cron paths.
          </Text>
        </ScrollView>
      </Modal>
    </>
  );
}

function DevConsoleButton({
  label,
  testID,
  busy,
  disabled,
  onPress,
}: {
  label: string;
  testID: string;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      className="min-h-[48px] flex-row items-center justify-center gap-xs rounded-lg border border-border bg-surface px-md"
    >
      {busy ? <ActivityIndicator size="small" color="#e8a838" /> : null}
      <Text className="font-body-semi text-body-sm text-foreground">{label}</Text>
    </Pressable>
  );
}
