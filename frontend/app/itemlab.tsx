/**
 * Dev-only item-detail harness — NOT part of the product. Mounts the
 * backend-free pieces of the item screen (estimation input + help dialog,
 * the calendar date picker, and the comments section) against local mock
 * state so they can be exercised deterministically by Playwright (see
 * e2e-web/item.spec.ts) or by hand at http://localhost:8081/itemlab. Lives at
 * the route root, outside the (app) auth guard, and short-circuits to a
 * 404-ish notice outside dev builds so it can never ship as a reachable
 * screen — same pattern as kanbanlab.tsx.
 */
import React, { useState } from "react";
import { Text, View } from "react-native";

import { AppContainer } from "@/components/AppContainer";
import { DateField } from "@/components/item/DateField";
import { EstimationInput } from "@/components/item/EstimationInput";
import { CommentsSection } from "@/components/item/CommentsSection";
import { DatePickerDialog } from "@/components/ui/DatePickerDialog";
import type { Comment } from "@/types";

const CURRENT_USER_ID = "user-me";

function mockComments(): Comment[] {
  return [
    {
      id: "c1",
      item_id: "item-lab",
      user_id: "user-other",
      body: "Looks good, one nit on the copy.",
      created_at: "2026-01-01T00:00:00Z",
    },
  ];
}

export default function ItemLab() {
  const [estimation, setEstimation] = useState<number | null>(null);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [datePicker, setDatePicker] = useState<"start" | "end" | null>(null);
  const [comments, setComments] = useState<Comment[]>(() => mockComments());

  if (!__DEV__) {
    return (
      <AppContainer>
        <View className="flex-1 items-center justify-center">
          <Text className="text-body text-text-low">Not available.</Text>
        </View>
      </AppContainer>
    );
  }

  return (
    <AppContainer variant="aurora">
      <View testID="itemlab" className="border-b border-ink-border/60 px-4 py-3">
        <Text className="text-h2 font-bold text-text-hi">Item Lab</Text>
        <Text className="text-meta uppercase text-text-low">dev harness · mock data</Text>
      </View>

      <View className="gap-6 p-4">
        <EstimationInput readOnly={false} value={estimation} onCommit={setEstimation} />

        <View className="flex-row gap-4">
          <View className="flex-1">
            <Text className="mb-2 text-meta uppercase text-text-low">Start date</Text>
            <DateField readOnly={false} value={startDate} testID="start-date" onPress={() => setDatePicker("start")} />
          </View>
          <View className="flex-1">
            <Text className="mb-2 text-meta uppercase text-text-low">End date</Text>
            <DateField readOnly={false} value={endDate} testID="end-date" onPress={() => setDatePicker("end")} />
          </View>
        </View>

        <CommentsSection
          comments={comments}
          currentUserId={CURRENT_USER_ID}
          names={{ [CURRENT_USER_ID]: "Me", "user-other": "Riley" }}
          onAdd={(body) => {
            setComments((cur) => [
              ...cur,
              {
                id: `c-new-${cur.length}`,
                item_id: "item-lab",
                user_id: CURRENT_USER_ID,
                body,
                created_at: new Date().toISOString(),
              },
            ]);
          }}
          onDelete={(commentId) => {
            setComments((cur) => cur.filter((c) => c.id !== commentId));
          }}
        />
      </View>

      <DatePickerDialog
        open={datePicker !== null}
        value={datePicker === "start" ? startDate : endDate}
        onSelect={(iso) => {
          if (datePicker === "start") setStartDate(iso);
          else if (datePicker === "end") setEndDate(iso);
          setDatePicker(null);
        }}
        onClear={() => {
          if (datePicker === "start") setStartDate(null);
          else if (datePicker === "end") setEndDate(null);
          setDatePicker(null);
        }}
        onClose={() => setDatePicker(null)}
      />
    </AppContainer>
  );
}
