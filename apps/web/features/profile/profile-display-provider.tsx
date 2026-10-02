"use client";

import { createContext, useContext, type ReactNode } from "react";
import { resolveMembershipStatus, type MembershipStatusView } from "@/features/membership/membership-status";
import type { GuardianSharingPreferences, StudentFocusHistory } from "@mirujima/contracts";
import type { WalletSummary } from "@/features/wallet/wallet-data";

interface ProfileContextValue {
  displayName: string;
  hasActiveGuardian: boolean | null;
  membershipStatus: MembershipStatusView;
  walletSummary: WalletSummary | null;
  walletCheckedAt?: string;
  sharingPreferences: GuardianSharingPreferences | null;
  studySummary: StudentFocusHistory["summary"] | null;
}

const ProfileContext = createContext<ProfileContextValue>({
  sharingPreferences: null,
  studySummary: null,
  displayName: "이름 미설정",
  hasActiveGuardian: null,
  membershipStatus: resolveMembershipStatus(null),
  walletSummary: null,
});

export function ProfileDisplayNameProvider({
  displayName,
  hasActiveGuardian,
  membershipStatus,
  walletSummary,
  walletCheckedAt,
  sharingPreferences,
  studySummary,
  children,
}: {
  displayName: string;
  hasActiveGuardian: boolean | null;
  membershipStatus: MembershipStatusView;
  walletSummary: WalletSummary | null;
  walletCheckedAt?: string;
  sharingPreferences: GuardianSharingPreferences | null;
  studySummary: StudentFocusHistory["summary"] | null;
  children: ReactNode;
}) {
  return <ProfileContext.Provider value={{ displayName, hasActiveGuardian, membershipStatus, walletSummary, walletCheckedAt, sharingPreferences, studySummary }}>{children}</ProfileContext.Provider>;
}

export function useProfileDisplayName(): string {
  return useContext(ProfileContext).displayName;
}

export function useStudentHasActiveGuardian(): boolean | null {
  return useContext(ProfileContext).hasActiveGuardian;
}

export function useMembershipStatus(): MembershipStatusView {
  return useContext(ProfileContext).membershipStatus;
}

export function useWalletSummary(): WalletSummary | null {
  return useContext(ProfileContext).walletSummary;
}

export function useGuardianSharingPreferences(): GuardianSharingPreferences | null {
  return useContext(ProfileContext).sharingPreferences;
}

export function useStudySummary(): StudentFocusHistory["summary"] | null { return useContext(ProfileContext).studySummary; }

export function useWalletCheckedAt(): string | undefined { return useContext(ProfileContext).walletCheckedAt; }
