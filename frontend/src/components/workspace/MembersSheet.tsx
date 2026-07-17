/**
 * Members sheet — see who's in a workspace and invite someone new by email.
 *
 * The catch the UI has to bridge: membership is stored by opaque `user_id`, but a
 * human invites a person by their email address. So "add" is two hops — resolve the
 * email to a profile (authApi.userByEmail), then hand that id to workspaceApi.addMember.
 * The row is dropped in optimistically the moment we have the profile, then the
 * server's authoritative workspace replaces the local list.
 */
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { authApi, workspaceApi } from "@/api/endpoints";
import { ApiError } from "@/api/client";
import { UsersIcon } from "@/components/icons";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { TextField } from "@/components/ui/TextField";
import { palette } from "@/theme/tokens";
import type { MemberRole, UserPublic, Workspace } from "@/types";

const ROLES: { role: MemberRole; label: string }[] = [
  { role: "editor", label: "Editor" },
  { role: "viewer", label: "Viewer" },
  { role: "owner", label: "Owner" },
];

export function MembersSheet({
  open,
  workspace,
  currentUser,
  onClose,
  onUpdated,
}: {
  open: boolean;
  workspace: Workspace | null;
  currentUser: UserPublic | null;
  onClose: () => void;
  onUpdated: (ws: Workspace) => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<MemberRole>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // display_name isn't stored on a membership, so we keep a best-effort map of the
  // names we *do* know — the signed-in user and anyone resolved this session.
  const [names, setNames] = useState<Record<string, string>>({});

  const nameFor = (userId: string): string => {
    if (userId === currentUser?.id) return currentUser.display_name;
    return names[userId] ?? "Member";
  };

  const members = workspace?.members ?? [];
  const isOwner = useMemo(
    () => workspace?.owner_id === currentUser?.id,
    [workspace, currentUser],
  );

  const submit = async () => {
    if (!workspace) return;
    const addr = email.trim().toLowerCase();
    if (!addr) return setError("Enter an email to invite.");
    setBusy(true);
    setError(null);
    try {
      const person = await authApi.userByEmail(addr);
      setNames((prev) => ({ ...prev, [person.id]: person.display_name }));
      const updated = await workspaceApi.addMember(workspace.id, person.id, role);
      setEmail("");
      onUpdated(updated);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setError("No one is registered with that email yet.");
      } else {
        setError(e instanceof ApiError ? e.message : "Couldn't add that member. Check the email and try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Members">
      <View className="gap-4">
        <ScrollView className="max-h-56" showsVerticalScrollIndicator={false}>
          <View className="gap-2">
            {members.map((m) => {
              const you = m.user_id === currentUser?.id;
              return (
                <View
                  key={m.user_id}
                  className="flex-row items-center gap-3 rounded-md bg-ink-raised px-3 py-2.5"
                >
                  <Avatar name={nameFor(m.user_id)} id={m.user_id} size={34} />
                  <View className="flex-1">
                    <Text className="text-body font-medium text-text-hi" numberOfLines={1}>
                      {nameFor(m.user_id)}
                      {you ? " · You" : ""}
                    </Text>
                    <Text className="text-meta uppercase text-text-low">{m.role}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>

        {isOwner ? (
          <View className="gap-3 border-t border-ink-hair pt-4">
            <TextField
              label="Invite by email"
              value={email}
              onChangeText={setEmail}
              placeholder="name@company.com"
              autoCapitalize="none"
              keyboardType="email-address"
              error={error}
              leading={<UsersIcon size={16} color={palette.textLow} />}
            />
            <View>
              <Text className="mb-2 text-sub font-medium text-text-mid">Role</Text>
              <View className="flex-row gap-2">
                {ROLES.map(({ role: r, label }) => {
                  const on = r === role;
                  return (
                    <Pressable
                      key={r}
                      onPress={() => setRole(r)}
                      className="flex-1 items-center rounded-md border py-2.5"
                      style={{
                        borderColor: on ? palette.purple : palette.border,
                        backgroundColor: on ? `${palette.purple}18` : "transparent",
                      }}
                    >
                      <Text
                        className="text-sub font-medium"
                        style={{ color: on ? palette.purple : palette.textMid }}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <Button label="Add member" onPress={submit} loading={busy} full />
          </View>
        ) : (
          <Text className="border-t border-ink-hair pt-4 text-sub text-text-low">
            Only the workspace owner can invite new members.
          </Text>
        )}
      </View>
    </Sheet>
  );
}
