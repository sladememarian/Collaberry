/**
 * Home — pick a workspace (Personal / University / Work or any custom one), then
 * open one of its boards. New users land here with a "Personal" workspace already
 * waiting, so it's never an empty void on first run.
 */
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { workspaceApi } from "@/api/endpoints";
import { ApiError } from "@/api/client";
import { AppContainer } from "@/components/AppContainer";
import {
  BrandMark,
  ChevronRightIcon,
  GearIcon,
  KanbanIcon,
  LogoutIcon,
  PlusIcon,
  UsersIcon,
} from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { ContextBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";
import { Sheet } from "@/components/ui/Sheet";
import { Skeleton } from "@/components/ui/Skeleton";
import { TextField } from "@/components/ui/TextField";
import { MembersSheet } from "@/components/workspace/MembersSheet";
import { useAuth } from "@/context/AuthContext";
import { contextAccent, palette, type WorkspaceContext } from "@/theme/tokens";
import type { Board, Workspace } from "@/types";

const CONTEXTS: WorkspaceContext[] = ["personal", "university", "work"];

const DEFAULT_LANES = ["To do", "In progress", "Done"];

/** Starter board shapes offered on first board creation. `columns: null` keeps
 *  the backend default (To do · In progress · Done). */
const BOARD_TEMPLATES: { id: string; label: string; columns: string[] | null }[] = [
  { id: "basic", label: "Basic board", columns: null },
  { id: "personal-weekly", label: "Personal weekly", columns: ["This week", "Doing", "Done", "Someday"] },
  { id: "university-term", label: "University term", columns: ["To read", "Assignments", "In progress", "Submitted"] },
  { id: "work-sprint", label: "Work sprint", columns: ["Backlog", "In progress", "Code review", "Blocked", "Done"] },
];

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [loadingWs, setLoadingWs] = useState(true);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = useMemo(
    () => workspaces.find((w) => w.id === activeId) ?? null,
    [workspaces, activeId],
  );

  const loadWorkspaces = useCallback(async () => {
    setError(null);
    try {
      const rows = await workspaceApi.list();
      setWorkspaces(rows);
      setActiveId((cur) => cur ?? rows[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't load your workspaces. Check your connection and pull to refresh.");
    } finally {
      setLoadingWs(false);
    }
  }, []);

  const loadBoards = useCallback(async (wsId: string) => {
    setLoadingBoards(true);
    try {
      setBoards(await workspaceApi.listBoards(wsId));
    } catch {
      setBoards([]);
    } finally {
      setLoadingBoards(false);
    }
  }, []);

  useEffect(() => {
    loadWorkspaces();
  }, [loadWorkspaces]);

  useEffect(() => {
    if (activeId) loadBoards(activeId);
  }, [activeId, loadBoards]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadWorkspaces();
    if (activeId) await loadBoards(activeId);
    setRefreshing(false);
  }, [loadWorkspaces, loadBoards, activeId]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    const part = h < 12 ? "Morning" : h < 18 ? "Afternoon" : "Evening";
    return `${part}, ${user?.display_name?.split(" ")[0] ?? "there"}`;
  }, [user]);

  // --- create sheets ------------------------------------------------------ //
  const [wsSheet, setWsSheet] = useState(false);
  const [boardSheet, setBoardSheet] = useState(false);
  const [membersSheet, setMembersSheet] = useState(false);

  return (
    <AppContainer>
      {/* Header */}
      <View className="flex-row items-center justify-between px-5 pb-3 pt-1">
        <View className="flex-row items-center gap-2.5">
          <BrandMark size={30} />
          <View>
            <Text className="text-h2 font-bold text-text-hi">Collaberry</Text>
            <Text className="text-sub text-text-low">{greeting}</Text>
          </View>
        </View>
        <View className="flex-row items-center gap-3">
          <Pressable
            onPress={() => router.push("/settings")}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Server settings"
            className="h-11 w-11 items-center justify-center rounded-full bg-ink-raised"
          >
            <GearIcon size={18} color={palette.textMid} />
          </Pressable>
          <Pressable
            onPress={signOut}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            className="h-11 w-11 items-center justify-center rounded-full bg-ink-raised"
          >
            <LogoutIcon size={18} color={palette.textMid} />
          </Pressable>
          {user ? <Avatar name={user.display_name} id={user.id} size={36} /> : null}
        </View>
      </View>

      <ScrollView
        className="flex-1"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.purple} />}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* Workspace switcher */}
        <Text className="mb-2 px-5 text-meta uppercase text-text-low">Workspaces</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
        >
          {loadingWs
            ? [0, 1, 2].map((i) => <Skeleton key={i} width={150} height={78} radius={14} />)
            : workspaces.map((ws) => (
                <WorkspaceChip
                  key={ws.id}
                  ws={ws}
                  active={ws.id === activeId}
                  onPress={() => setActiveId(ws.id)}
                />
              ))}
          <Pressable
            onPress={() => setWsSheet(true)}
            className="h-[78px] w-[110px] items-center justify-center gap-1 rounded-md border border-dashed border-ink-hair"
          >
            <PlusIcon size={18} color={palette.textMid} />
            <Text className="text-sub text-text-low">New</Text>
          </Pressable>
        </ScrollView>

        {error ? (
          <View className="mx-5 mt-6">
            <GlassCard className="p-4">
              <Text className="text-body text-state-danger">{error}</Text>
              <View className="mt-3">
                <Button label="Retry" variant="subtle" onPress={loadWorkspaces} />
              </View>
            </GlassCard>
          </View>
        ) : null}

        {/* Boards */}
        <View className="mt-7 flex-row items-center justify-between px-5">
          <Text className="text-meta uppercase text-text-low">
            {active ? `${active.name} · Boards` : "Boards"}
          </Text>
          {active ? (
            <View className="flex-row items-center gap-4">
              <Pressable onPress={() => setMembersSheet(true)} className="flex-row items-center gap-1">
                <UsersIcon size={15} color={palette.textMid} />
                <Text className="text-sub font-semibold text-text-mid">Members</Text>
              </Pressable>
              <Pressable onPress={() => setBoardSheet(true)} className="flex-row items-center gap-1">
                <PlusIcon size={15} color={palette.purpleSoft} />
                <Text className="text-sub font-semibold text-brand-purple-soft">New board</Text>
              </Pressable>
            </View>
          ) : null}
        </View>

        <View className="mt-3 px-5">
          {loadingBoards ? (
            <View className="gap-3">
              {[0, 1].map((i) => (
                <Skeleton key={i} width="100%" height={72} radius={16} />
              ))}
            </View>
          ) : boards.length === 0 ? (
            <EmptyState
              icon={<KanbanIcon size={26} color={palette.textLow} />}
              title="No boards yet"
              body="Spin up your first board to start dropping cards, docs, and checklists."
              ctaLabel={active ? "Create a board" : undefined}
              onCta={active ? () => setBoardSheet(true) : undefined}
            />
          ) : (
            <View className="gap-3">
              {boards.map((b) => (
                <BoardRow
                  key={b.id}
                  board={b}
                  context={active?.context ?? "personal"}
                  onPress={() => router.push(`/(app)/board/${b.id}`)}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <CreateWorkspaceSheet
        open={wsSheet}
        onClose={() => setWsSheet(false)}
        onCreated={(ws) => {
          setWorkspaces((prev) => [...prev, ws]);
          setActiveId(ws.id);
          setWsSheet(false);
        }}
      />
      <CreateBoardSheet
        open={boardSheet}
        workspaceId={active?.id ?? null}
        onClose={() => setBoardSheet(false)}
        onCreated={(b) => {
          setBoards((prev) => [...prev, b]);
          setBoardSheet(false);
        }}
      />
      <MembersSheet
        open={membersSheet}
        workspace={active}
        currentUser={user}
        onClose={() => setMembersSheet(false)}
        onUpdated={(ws) =>
          setWorkspaces((prev) => prev.map((w) => (w.id === ws.id ? ws : w)))
        }
      />
    </AppContainer>
  );
}

// --------------------------------------------------------------------------- //
function WorkspaceChip({
  ws,
  active,
  onPress,
}: {
  ws: Workspace;
  active: boolean;
  onPress: () => void;
}) {
  const accent = contextAccent[ws.context];
  return (
    <Pressable onPress={onPress}>
      <GlassCard
        glowColor={active ? accent.color : undefined}
        className="w-[150px] p-3"
        style={active ? { borderColor: accent.color } : undefined}
      >
        <ContextBadge context={ws.context} />
        <Text className="mt-2 text-body font-semibold text-text-hi" numberOfLines={1}>
          {ws.name}
        </Text>
        <Text className="mt-0.5 text-meta text-text-low">
          {ws.members.length} {ws.members.length === 1 ? "member" : "members"}
        </Text>
      </GlassCard>
    </Pressable>
  );
}

function BoardRow({
  board,
  context,
  onPress,
}: {
  board: Board;
  context: WorkspaceContext;
  onPress: () => void;
}) {
  const accent = contextAccent[context];
  return (
    <GlassCard onPress={onPress} className="flex-row items-center gap-3 p-4">
      <View
        style={{ backgroundColor: `${accent.color}18`, borderColor: `${accent.color}55` }}
        className="h-11 w-11 items-center justify-center rounded-md border"
      >
        <KanbanIcon size={20} color={accent.color} strokeWidth={1.9} />
      </View>
      <View className="flex-1">
        <Text className="text-h3 font-semibold text-text-hi" numberOfLines={1}>
          {board.name}
        </Text>
        <Text className="text-sub text-text-low">
          {board.columns.length} lanes
        </Text>
      </View>
      <ChevronRightIcon size={20} color={palette.textFaint} />
    </GlassCard>
  );
}

// --------------------------------------------------------------------------- //
function CreateWorkspaceSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (ws: Workspace) => void;
}) {
  const [name, setName] = useState("");
  const [context, setContext] = useState<WorkspaceContext>("work");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim()) return setError("Give it a name.");
    setBusy(true);
    setError(null);
    try {
      const ws = await workspaceApi.create(name.trim(), context);
      setName("");
      onCreated(ws);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't create that workspace. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="New workspace">
      <View className="gap-4">
        <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Thesis, Q3 Launch" error={error} />
        <View>
          <Text className="mb-2 text-sub font-medium text-text-mid">Context</Text>
          <View className="flex-row gap-2">
            {CONTEXTS.map((c) => {
              const a = contextAccent[c];
              const on = c === context;
              return (
                <Pressable
                  key={c}
                  onPress={() => setContext(c)}
                  className="flex-1 items-center rounded-md border py-2.5"
                  style={{
                    borderColor: on ? a.color : palette.border,
                    backgroundColor: on ? `${a.color}18` : "transparent",
                  }}
                >
                  <Text className="text-sub font-medium" style={{ color: on ? a.color : palette.textMid }}>
                    {a.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <Button label="Create workspace" onPress={submit} loading={busy} full />
      </View>
    </Sheet>
  );
}

function CreateBoardSheet({
  open,
  workspaceId,
  onClose,
  onCreated,
}: {
  open: boolean;
  workspaceId: string | null;
  onClose: () => void;
  onCreated: (b: Board) => void;
}) {
  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState<string>(BOARD_TEMPLATES[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const template = BOARD_TEMPLATES.find((t) => t.id === templateId) ?? BOARD_TEMPLATES[0];

  const submit = async () => {
    if (!workspaceId) return;
    if (!name.trim()) return setError("Name your board.");
    setBusy(true);
    setError(null);
    try {
      const b = await workspaceApi.createBoard(
        workspaceId,
        name.trim(),
        template.columns ?? undefined,
      );
      setName("");
      setTemplateId(BOARD_TEMPLATES[0].id);
      onCreated(b);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't create this board. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="New board">
      <View className="gap-4">
        <TextField
          label="Board name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Sprint 4, Reading list"
          error={error}
        />

        <View>
          <Text className="mb-2 text-sub font-medium text-text-mid">Start from a template</Text>
          <View className="gap-2">
            {BOARD_TEMPLATES.map((t) => {
              const on = t.id === templateId;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setTemplateId(t.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  className="rounded-lg border p-3"
                  style={{
                    borderColor: on ? palette.purple : palette.border,
                    backgroundColor: on ? "rgba(168,85,247,0.08)" : "transparent",
                  }}
                >
                  <Text className="text-body font-medium text-text-hi">{t.label}</Text>
                  <Text className="mt-0.5 text-sub text-text-low">
                    {(t.columns ?? DEFAULT_LANES).join(" · ")}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <Button label="Create board" onPress={submit} loading={busy} full />
      </View>
    </Sheet>
  );
}
