/**
 * The left navigation rail — the app's persistent spine.
 *
 * Two widths, one component: a 64px icon rail by default, expanding to 210px
 * with labels. The choice persists, because a rail that resets to collapsed on
 * every launch is a rail the user re-expands forever.
 *
 * Layout note (load-bearing): the rail is a real flex sibling of the screen
 * content, not an absolute overlay. An overlay would sit on top of the kanban
 * board's horizontal scroller and eat drag gestures near the left edge — the
 * exact region a user grabs when dragging a card out of the first lane.
 *
 * Responsiveness: below `RAIL_MIN_WIDTH` of window width there isn't room for
 * a rail beside the board, so it renders as a floating button that opens the
 * same destinations in an overlay. Phones get the overlay; the overlay is
 * dismissible, so eating gestures isn't a concern there.
 */
import { usePathname, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  BellIcon,
  BrandMark,
  ChevronLeftIcon,
  ChevronRightIcon,
  GearIcon,
  HomeIcon,
  LogoutIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
  UserIcon,
} from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { useAuth } from "@/context/AuthContext";
import { useNotifications } from "@/context/NotificationContext";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useTheme } from "@/theme/ThemeContext";
import { palette } from "@/theme/tokens";

const COLLAPSED_W = 64;
const EXPANDED_W = 210;
/** Below this window width the rail becomes an overlay instead of a column. */
const RAIL_MIN_WIDTH = 720;
const STORAGE_KEY = "collaberry:rail-expanded";

export interface NavRailProps {
  /** Opens the profile panel — owned by the layout so it survives navigation. */
  onOpenProfile: () => void;
  /** Opens the notifications panel. */
  onOpenNotifications: () => void;
  /**
   * Board-screen search. Omitted on screens with nothing to search, where the
   * entry is hidden rather than shown disabled — a permanently dead control
   * teaches people to ignore that part of the rail.
   */
  onOpenSearch?: () => void;
}

export function NavRail({ onOpenProfile, onOpenNotifications, onOpenSearch }: NavRailProps) {
  const { width } = useWindowDimensions();
  const [overlayOpen, setOverlayOpen] = useState(false);

  if (width < RAIL_MIN_WIDTH) {
    return (
      <>
        <FloatingRailButton onPress={() => setOverlayOpen(true)} />
        <Modal visible={overlayOpen} transparent animationType="fade" onRequestClose={() => setOverlayOpen(false)}>
          <Pressable className="flex-1 flex-row bg-black/60" onPress={() => setOverlayOpen(false)}>
            <Pressable onPress={(e) => e.stopPropagation()} className="h-full">
              <RailBody
                expanded
                onToggle={() => setOverlayOpen(false)}
                onOpenProfile={onOpenProfile}
                onOpenNotifications={onOpenNotifications}
                onOpenSearch={onOpenSearch}
                onNavigate={() => setOverlayOpen(false)}
                toggleLabel="Close menu"
              />
            </Pressable>
          </Pressable>
        </Modal>
      </>
    );
  }

  return (
    <PersistentRail
      onOpenProfile={onOpenProfile}
      onOpenNotifications={onOpenNotifications}
      onOpenSearch={onOpenSearch}
    />
  );
}

function PersistentRail({ onOpenProfile, onOpenNotifications, onOpenSearch }: NavRailProps) {
  const [expanded, setExpanded] = useState(false);
  const reduceMotion = useReducedMotion();
  const w = useSharedValue(COLLAPSED_W);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v === "1") {
        setExpanded(true);
        // Jump, don't animate: this is the restore of a saved state on mount,
        // and sliding it open on every launch would read as a stray animation.
        w.value = EXPANDED_W;
      }
    });
  }, [w]);

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      AsyncStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      const target = next ? EXPANDED_W : COLLAPSED_W;
      w.value = reduceMotion ? target : withTiming(target, { duration: 190 });
      return next;
    });
  }, [reduceMotion, w]);

  // Inline style, not className: NativeWind drops className on Animated.View.
  const style = useAnimatedStyle(() => ({ width: w.value }));

  return (
    <Animated.View
      testID="nav-rail"
      style={[
        style,
        {
          height: "100%",
          borderRightWidth: 1,
          borderRightColor: palette.border,
          backgroundColor: palette.base,
          overflow: "hidden",
        },
      ]}
    >
      <RailBody
        expanded={expanded}
        onToggle={toggle}
        onOpenProfile={onOpenProfile}
        onOpenNotifications={onOpenNotifications}
        onOpenSearch={onOpenSearch}
        toggleLabel={expanded ? "Collapse navigation" : "Expand navigation"}
      />
    </Animated.View>
  );
}

function RailBody({
  expanded,
  onToggle,
  onOpenProfile,
  onOpenNotifications,
  onOpenSearch,
  onNavigate,
  toggleLabel,
}: NavRailProps & {
  expanded: boolean;
  onToggle: () => void;
  onNavigate?: () => void;
  toggleLabel: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const { unreadCount } = useNotifications();

  const go = useCallback(
    (href: string) => {
      router.push(href as never);
      onNavigate?.();
    },
    [router, onNavigate],
  );

  const act = useCallback(
    (fn: () => void) => {
      fn();
      onNavigate?.();
    },
    [onNavigate],
  );

  const onHome = pathname === "/" || pathname.startsWith("/(app)") === false
    ? pathname === "/"
    : pathname === "/(app)";

  return (
    <View
      className="h-full bg-ink-base"
      style={{ width: expanded ? EXPANDED_W : COLLAPSED_W, paddingVertical: 12 }}
    >
      {/* Brand + collapse toggle */}
      <View className={`mb-3 flex-row items-center ${expanded ? "px-3" : "justify-center"}`}>
        <Pressable
          onPress={() => go("/(app)")}
          accessibilityRole="button"
          accessibilityLabel="Collaberry home"
          className="flex-row items-center gap-2"
        >
          <BrandMark size={26} />
          {expanded ? (
            <Text className="text-h3 font-bold text-text-hi" numberOfLines={1}>
              Collaberry
            </Text>
          ) : null}
        </Pressable>
      </View>

      <View className="mb-2 h-px bg-ink-border" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
        <RailItem
          expanded={expanded}
          label="Home"
          active={onHome}
          icon={(c) => <HomeIcon size={20} color={c} />}
          onPress={() => go("/(app)")}
        />
        {onOpenSearch ? (
          <RailItem
            expanded={expanded}
            label="Search"
            icon={(c) => <SearchIcon size={20} color={c} />}
            onPress={() => act(onOpenSearch)}
          />
        ) : null}
        <RailItem
          expanded={expanded}
          label="Notifications"
          badge={unreadCount}
          icon={(c) => <BellIcon size={20} color={c} />}
          onPress={() => act(onOpenNotifications)}
        />
        <RailItem
          expanded={expanded}
          label="Profile"
          icon={(c) => <UserIcon size={20} color={c} />}
          onPress={() => act(onOpenProfile)}
        />
        <RailItem
          expanded={expanded}
          label="Server settings"
          active={pathname === "/settings"}
          icon={(c) => <GearIcon size={20} color={c} />}
          onPress={() => go("/settings")}
        />
      </ScrollView>

      <View className="mt-auto">
        <View className="mb-2 h-px bg-ink-border" />

        <RailItem
          expanded={expanded}
          label={theme === "dark" ? "Light theme" : "Dark theme"}
          icon={(c) =>
            theme === "dark" ? <SunIcon size={20} color={c} /> : <MoonIcon size={20} color={c} />
          }
          onPress={() => setTheme(theme === "dark" ? "light" : "dark")}
          testID="rail-theme-toggle"
        />

        <Pressable
          onPress={() => act(onOpenProfile)}
          accessibilityRole="button"
          accessibilityLabel="Your profile"
          className={`flex-row items-center gap-2.5 rounded-md py-2 ${expanded ? "px-3" : "justify-center px-0"}`}
        >
          {user ? <Avatar name={user.display_name} id={user.id} size={30} /> : null}
          {expanded && user ? (
            <View className="flex-1">
              <Text className="text-sub font-semibold text-text-hi" numberOfLines={1}>
                {user.display_name}
              </Text>
              <Text className="text-meta text-text-low" numberOfLines={1}>
                {user.email}
              </Text>
            </View>
          ) : null}
        </Pressable>

        <RailItem
          expanded={expanded}
          label="Sign out"
          icon={(c) => <LogoutIcon size={20} color={c} />}
          onPress={() => act(signOut)}
        />

        <Pressable
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityLabel={toggleLabel}
          testID="rail-toggle"
          className={`mt-1 flex-row items-center gap-3 rounded-md py-2 ${expanded ? "px-3" : "justify-center px-0"}`}
        >
          {expanded ? (
            <ChevronLeftIcon size={18} color={palette.textLow} />
          ) : (
            <ChevronRightIcon size={18} color={palette.textLow} />
          )}
          {expanded ? <Text className="text-sub text-text-low">Collapse</Text> : null}
        </Pressable>
      </View>
    </View>
  );
}

function RailItem({
  expanded,
  label,
  icon,
  onPress,
  active = false,
  badge = 0,
  testID,
}: {
  expanded: boolean;
  label: string;
  icon: (color: string) => React.ReactNode;
  onPress: () => void;
  active?: boolean;
  badge?: number;
  testID?: string;
}) {
  const color = active ? palette.purpleSoft : palette.textMid;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      testID={testID}
      // The collapsed rail shows no text, so the label has to survive as a
      // native tooltip on web — otherwise the icons are a guessing game.
      {...(Platform.OS === "web" && !expanded ? ({ title: label } as object) : {})}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
      className={`mx-2 mb-0.5 flex-row items-center gap-3 rounded-md py-2.5 ${
        expanded ? "px-3" : "justify-center px-0"
      } ${active ? "bg-brand-purple/12" : ""}`}
    >
      <View>
        {icon(color)}
        {badge > 0 ? (
          <View
            testID={`rail-badge-${label.toLowerCase()}`}
            className="absolute items-center justify-center rounded-full bg-state-danger"
            style={{ top: -5, right: -8, minWidth: 16, height: 16, paddingHorizontal: 3 }}
          >
            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>
              {badge > 9 ? "9+" : badge}
            </Text>
          </View>
        ) : null}
      </View>
      {expanded ? (
        <Text
          className="flex-1 text-body"
          style={{ color: active ? palette.purpleSoft : palette.textMid }}
          numberOfLines={1}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** The narrow-window entry point: a small floating button over the content. */
function FloatingRailButton({ onPress }: { onPress: () => void }) {
  const { unreadCount } = useNotifications();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open navigation"
      testID="nav-rail-fab"
      className="absolute bottom-6 left-4 h-12 w-12 items-center justify-center rounded-full border border-ink-border bg-ink-raised"
      style={{ zIndex: 40 }}
    >
      <ChevronRightIcon size={20} color={palette.textMid} />
      {unreadCount > 0 ? (
        <View
          className="absolute items-center justify-center rounded-full bg-state-danger"
          style={{ top: 2, right: 2, minWidth: 16, height: 16, paddingHorizontal: 3 }}
        >
          <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
